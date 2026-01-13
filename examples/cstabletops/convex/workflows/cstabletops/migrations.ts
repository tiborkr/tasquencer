import { internalMutation } from '../../_generated/server'
import { components } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { getExerciseDefinition, DEFAULT_PLAYER_ROLES } from './exercises'
import invariant from 'tiny-invariant'

function makeJoinCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return result
}

async function generateUniqueJoinCode(
  ctx: { db: any },
  maxAttempts = 50,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = makeJoinCode()
    const existing = await ctx.db
      .query('ttxSessions')
      .withIndex('by_join_code', (q: any) => q.eq('joinCode', code))
      .unique()
    if (!existing) return code
  }
  throw new Error('FAILED_TO_GENERATE_JOIN_CODE')
}

/**
 * Backfill legacy sessions created before join codes + per-player-role groups existed.
 *
 * Safe to run multiple times.
 */
export const backfillLegacySessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const playerRole = await ctx.runQuery(
      components.tasquencerAuthorization.api.getRoleByName,
      { name: 'cstabletops_player' },
    )
    invariant(playerRole, 'CSTABLETOPS_ROLE_MISSING: player')

    const sessions = await ctx.db.query('ttxSessions').collect()

    let patchedSessions = 0
    let createdRoleGroups = 0

    for (const session of sessions as Array<Doc<'ttxSessions'>>) {
      const needsJoinCode = !session.joinCode
      const needsPlayerRoles = !session.playerRoles || session.playerRoles.length === 0
      const needsPlayerRoleGroups =
        !session.groups.playerRoleGroups ||
        session.groups.playerRoleGroups.length === 0

      if (!needsJoinCode && !needsPlayerRoles && !needsPlayerRoleGroups) continue

      const exercise =
        (() => {
          try {
            return getExerciseDefinition(session.exerciseKey as any)
          } catch {
            return null
          }
        })() ?? null

      const playerRoles = (exercise?.playerRoles ?? DEFAULT_PLAYER_ROLES).map((r) => ({
        key: r.key,
        title: r.title,
      }))

      const joinCode = session.joinCode ?? (await generateUniqueJoinCode(ctx))

      let playerRoleGroups = session.groups.playerRoleGroups ?? []
      if (needsPlayerRoleGroups) {
        // Create (or reuse) per-role groups for this session.
        const groupIds: Array<string> = []
        for (const role of playerRoles) {
          const name = `cstabletops_session_${session._id}_player_${role.key}`
          const existing = await ctx.runQuery(
            components.tasquencerAuthorization.api.getAuthGroupByName,
            { name },
          )
          if (existing) {
            groupIds.push(existing._id as unknown as string)
            continue
          }

          const [groupId] = await ctx.runMutation(
            components.tasquencerAuthorization.api.insertAuthGroups,
            {
              groups: [
                {
                  name,
                  description: `Players (${role.title}) for session ${session._id}`,
                  isActive: true,
                },
              ],
            },
          )
          invariant(groupId, 'FAILED_TO_CREATE_GROUP: player role')
          groupIds.push(groupId as unknown as string)
          createdRoleGroups++
        }

        await ctx.runMutation(
          components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
          {
            assignments: groupIds.map((groupId) => ({
              groupId,
              roleId: playerRole._id,
              assignedAt: Date.now(),
            })),
          },
        )

        playerRoleGroups = playerRoles.map((role, idx) => ({
          roleKey: role.key,
          groupId: groupIds[idx] as string,
        }))
      }

      await ctx.db.patch(session._id, {
        joinCode,
        playerRoles: needsPlayerRoles ? playerRoles : session.playerRoles,
        groups: {
          ...session.groups,
          playerRoleGroups,
        },
      })
      patchedSessions++
    }

    return { patchedSessions, createdRoleGroups }
  },
})

/**
 * Older versions allowed multiple participant rows per (session,user).
 * This mutation collapses them to a single row per (session,user).
 *
 * Safe to run multiple times.
 */
export const cleanupDuplicateParticipants = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = (await ctx.db.query('ttxParticipants').collect()) as Array<
      Doc<'ttxParticipants'>
    >

    const rolePriority: Record<Doc<'ttxParticipants'>['role'], number> = {
      facilitator: 0,
      noteTaker: 1,
      player: 2,
      observer: 3,
    }

    const keyFor = (p: Doc<'ttxParticipants'>) => `${p.sessionId}:${p.userId}`

    const groups = new Map<string, Array<Doc<'ttxParticipants'>>>()
    for (const p of all) {
      const key = keyFor(p)
      const existing = groups.get(key)
      if (existing) existing.push(p)
      else groups.set(key, [p])
    }

    let deleted = 0
    let patched = 0

    for (const participants of groups.values()) {
      if (participants.length <= 1) continue

      const sorted = [...participants].sort((a, b) => {
        const byRole = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
        if (byRole !== 0) return byRole
        const aHasKey = a.playerRoleKey ? 0 : 1
        const bHasKey = b.playerRoleKey ? 0 : 1
        return aHasKey - bHasKey
      })

      const keep = sorted[0]!
      const remove = sorted.slice(1)

      for (const p of remove) {
        await ctx.db.delete(p._id)
        deleted++
      }

      if (keep.role === 'player' && !keep.playerRoleKey) {
        const session = await ctx.db.get(keep.sessionId)
        const defaultKey =
          session?.playerRoles?.[0]?.key ?? DEFAULT_PLAYER_ROLES[0]?.key ?? 'it_lead'

        await ctx.db.patch(keep._id, { playerRoleKey: defaultKey })
        patched++

        const roleGroupId = session?.groups.playerRoleGroups?.find(
          (g) => g.roleKey === defaultKey,
        )?.groupId

        // Best-effort: ensure auth group membership aligns with the assigned role.
        if (session?.groups.playersGroupId) {
          await ctx.runMutation(components.tasquencerAuthorization.api.addUserToAuthGroup, {
            userId: keep.userId as unknown as string,
            groupId: session.groups.playersGroupId,
          })
        }
        if (roleGroupId) {
          await ctx.runMutation(components.tasquencerAuthorization.api.addUserToAuthGroup, {
            userId: keep.userId as unknown as string,
            groupId: roleGroupId,
          })
        }
      }
    }

    return { deleted, patched }
  },
})
