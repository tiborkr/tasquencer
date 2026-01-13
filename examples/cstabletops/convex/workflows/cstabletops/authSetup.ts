import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { AppScope } from '../../authorization'

export const AUTH_CSTABLETOPS_ROLES = {
  CSTABLETOPS_FACILITATOR: 'cstabletops_facilitator',
  CSTABLETOPS_NOTE_TAKER: 'cstabletops_note_taker',
  CSTABLETOPS_PLAYER: 'cstabletops_player',
  CSTABLETOPS_OBSERVER: 'cstabletops_observer',
} as const

export const AUTH_CSTABLETOPS_GROUPS = {
  CSTABLETOPS_STAFF: 'cstabletops_staff',
} as const

export const setupAuthCstabletopsAuthorization = internalMutation({
  args: {},
  handler: async (ctx) => {
    const common: AppScope[] = ['cstabletops:staff']
    const facilitatorScopes: AppScope[] = [
      ...common,
      'cstabletops:facilitate',
      'cstabletops:notetake',
      'cstabletops:respond',
    ]
    const noteTakerScopes: AppScope[] = [...common, 'cstabletops:notetake']
    const playerScopes: AppScope[] = [...common, 'cstabletops:respond']
    const observerScopes: AppScope[] = [...common]

    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      {
        roles: [
          {
            name: AUTH_CSTABLETOPS_ROLES.CSTABLETOPS_FACILITATOR,
            description: 'Tabletop facilitator (DM): can present cards and make choices',
            scopes: facilitatorScopes,
            isActive: true,
          },
          {
            name: AUTH_CSTABLETOPS_ROLES.CSTABLETOPS_NOTE_TAKER,
            description: 'Note-taker: captures discussion notes',
            scopes: noteTakerScopes,
            isActive: true,
          },
          {
            name: AUTH_CSTABLETOPS_ROLES.CSTABLETOPS_PLAYER,
            description: 'Player: records responses to prompts',
            scopes: playerScopes,
            isActive: true,
          },
          {
            name: AUTH_CSTABLETOPS_ROLES.CSTABLETOPS_OBSERVER,
            description: 'Observer: read-only access',
            scopes: observerScopes,
            isActive: true,
          },
        ],
      },
    )

    if (roleIds.length < 4) {
      throw new Error(`Failed to create cstabletops auth roles (${roleIds.length})`)
    }

    // Create a baseline "staff" group so admins have something to assign users to
    // before any sessions are created. Session-specific groups are created when a
    // tabletop session is initialized.
    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: AUTH_CSTABLETOPS_GROUPS.CSTABLETOPS_STAFF,
            description:
              'Baseline tabletop access (can view sessions; session roles are per-session)',
            isActive: true,
          },
        ],
      },
    )

    const staffGroupId = groupIds[0]
    const observerRoleId = roleIds[3]

    if (!staffGroupId || !observerRoleId) {
      throw new Error(
        `Failed to create cstabletops staff group (groups: ${groupIds.length}, roles: ${roleIds.length})`,
      )
    }

    await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
      {
        assignments: [
          {
            groupId: staffGroupId,
            roleId: observerRoleId,
            assignedAt: Date.now(),
          },
        ],
      },
    )

    return { roleIds, staffGroupId }
  },
})
