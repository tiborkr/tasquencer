import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { components } from '../../_generated/api'
import { cstabletopsVersionManager } from './definition'
import {
  getParticipantForSession,
  getSessionByJoinCode,
  listParticipantsForSession,
  listSessionsForUser,
  getPresentationState,
} from './db'
import { CstabletopsWorkItemHelpers } from './helpers'
import { authComponent } from '../../auth'
import { type HumanWorkItemOffer, isHumanOffer, isHumanClaim } from '@repo/tasquencer'
import { userHasScope } from '@repo/tasquencer/components/authorization/helpers'
import { assertUserHasScope } from '../../authorization'
import { EXERCISES, type ExerciseKey } from './exercises'
import invariant from 'tiny-invariant'

const apiV1 = cstabletopsVersionManager.apiForVersion('v1')
const apiV2 = cstabletopsVersionManager.apiForVersion('v2')

export const initializeRootWorkflow = apiV2.initializeRootWorkflow
export const initializeWorkItem = apiV2.initializeWorkItem
export const startWorkItemV1 = apiV1.startWorkItem
export const completeWorkItemV1 = apiV1.completeWorkItem
export const startWorkItemV2 = apiV2.startWorkItem
export const completeWorkItemV2 = apiV2.completeWorkItem

const {
  helpers: { getWorkflowTaskStates: getWorkflowTaskStatesV1 },
} = apiV1
const {
  helpers: { getWorkflowTaskStates: getWorkflowTaskStatesV2 },
} = apiV2

async function resolveVersionForWorkItem(
  ctx: { db: { get: any; query: any } },
  workItemId: Id<'tasquencerWorkItems'>,
): Promise<'v1' | 'v2'> {
  const metadata = await CstabletopsWorkItemHelpers.getWorkItemMetadata(ctx.db as any, workItemId)
  if (!metadata) return 'v2'

  const sessionId = metadata.aggregateTableId as Id<'ttxSessions'>
  const session = await ctx.db.get(sessionId)
  if (!session) return 'v2'

  const rootWorkflow = await ctx.db.get(session.workflowId)
  const rootVersion = rootWorkflow?.versionName
  if (rootVersion === 'v2') return 'v2'

  // Backwards compatibility: sessions created before introducing explicit
  // versioning may still have v1 versionName but v2 QuickFix cards/work items.
  if (session.exerciseKey === 'quick_fix') {
    const card3 = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_and_order', (q: any) =>
        q.eq('sessionId', sessionId).eq('order', 3),
      )
      .first()
    const card4 = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_and_order', (q: any) =>
        q.eq('sessionId', sessionId).eq('order', 4),
      )
      .first()

    if (card4) return 'v2'
    if (card3?.kind === 'prompt' && card3?.assignedPlayerRoleKey === 'comms') return 'v2'
  }

  return rootVersion === 'v1' ? 'v1' : 'v2'
}

function requireHumanOffer(
  metadata: Doc<'cstabletopsWorkItems'>,
): HumanWorkItemOffer {
  if (!isHumanOffer(metadata.offer)) {
    throw new Error('Tabletop work items must be offered to humans')
  }
  return metadata.offer
}

function deriveWorkItemStatus(
  workItem: Doc<'tasquencerWorkItems'> | null,
  metadata: Doc<'cstabletopsWorkItems'>,
): 'pending' | 'claimed' | 'completed' {
  if (workItem?.state === 'completed') return 'completed'
  if (isHumanClaim(metadata.claim)) return 'claimed'
  return 'pending'
}

export const getSessions = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')
    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    if (!userId) return []
    return await listSessionsForUser(ctx.db, userId as Id<'users'>)
  },
})

export const getJoinInfo = query({
  args: { joinCode: v.string() },
  handler: async (ctx, args) => {
    const joinCode = args.joinCode.trim().toUpperCase()
    if (!joinCode) return null
    const session = await getSessionByJoinCode(ctx.db, joinCode)
    if (!session) return null

    // Get existing participants to determine which player roles are already taken
    const participants = await listParticipantsForSession(ctx.db, session._id)
    const takenPlayerRoleKeys = new Set(
      participants
        .filter((p) => p.role === 'player' && p.playerRoleKey)
        .map((p) => p.playerRoleKey!),
    )

    const playerRoles = (session.playerRoles ?? []).map((role) => ({
      ...role,
      taken: takenPlayerRoleKeys.has(role.key),
    }))

    return {
      sessionId: session._id,
      title: session.title,
      exerciseTitle: session.exerciseTitle,
      status: session.status,
      playerRoles,
    }
  },
})

export const joinSession = mutation({
  args: {
    joinCode: v.string(),
    role: v.union(v.literal('player'), v.literal('observer'), v.literal('noteTaker')),
    playerRoleKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const joinCode = args.joinCode.trim().toUpperCase()
    invariant(joinCode.length > 0, 'JOIN_CODE_REQUIRED')

    const session = await getSessionByJoinCode(ctx.db, joinCode)
    invariant(session, 'SESSION_NOT_FOUND')
    if (session.status === 'completed') {
      throw new Error('SESSION_COMPLETED')
    }
    invariant(session.joinCode, 'SESSION_NOT_JOINABLE')
    invariant(
      session.playerRoles && session.playerRoles.length > 0,
      'SESSION_NOT_JOINABLE',
    )
    invariant(session.groups.playerRoleGroups, 'SESSION_NOT_JOINABLE')

    const existing = await getParticipantForSession(ctx.db, session._id, appUserId)
    if (existing) {
      throw new Error('ALREADY_JOINED_SESSION')
    }

    if (args.role === 'observer') {
      await ctx.runMutation(components.tasquencerAuthorization.api.addUserToAuthGroup, {
        userId,
        groupId: session.groups.observersGroupId,
      })
      await ctx.db.insert('ttxParticipants', {
        sessionId: session._id,
        userId: appUserId,
        role: 'observer',
        createdAt: Date.now(),
      })
      return { sessionId: session._id }
    }

    if (args.role === 'noteTaker') {
      await ctx.runMutation(components.tasquencerAuthorization.api.addUserToAuthGroup, {
        userId,
        groupId: session.groups.noteTakersGroupId,
      })
      await ctx.db.insert('ttxParticipants', {
        sessionId: session._id,
        userId: appUserId,
        role: 'noteTaker',
        createdAt: Date.now(),
      })
      return { sessionId: session._id }
    }

    const playerRoleKey = args.playerRoleKey
    invariant(playerRoleKey, 'PLAYER_ROLE_REQUIRED')
    const roleExists = session.playerRoles.some((r) => r.key === playerRoleKey)
    invariant(roleExists, 'INVALID_PLAYER_ROLE')

    // Check if player role is already taken by another participant
    const participants = await listParticipantsForSession(ctx.db, session._id)
    const roleTaken = participants.some(
      (p) => p.role === 'player' && p.playerRoleKey === playerRoleKey,
    )
    if (roleTaken) {
      const roleTitle = session.playerRoles.find((r) => r.key === playerRoleKey)?.title ?? playerRoleKey
      throw new Error(`PLAYER_ROLE_TAKEN:${roleTitle}`)
    }

    const playerRoleGroupId =
      session.groups.playerRoleGroups?.find((g) => g.roleKey === playerRoleKey)
        ?.groupId
    invariant(playerRoleGroupId, 'PLAYER_ROLE_GROUP_NOT_FOUND')

    await ctx.runMutation(components.tasquencerAuthorization.api.addUserToAuthGroup, {
      userId,
      groupId: session.groups.playersGroupId,
    })
    await ctx.runMutation(components.tasquencerAuthorization.api.addUserToAuthGroup, {
      userId,
      groupId: playerRoleGroupId,
    })

    await ctx.db.insert('ttxParticipants', {
      sessionId: session._id,
      userId: appUserId,
      role: 'player',
      playerRoleKey,
      createdAt: Date.now(),
    })

    return { sessionId: session._id }
  },
})

export const getExercises = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx)
    if (!authUser.userId) return []

    const hasStaff = await userHasScope(
      ctx,
      components.tasquencerAuthorization,
      authUser.userId,
      'cstabletops:staff',
    )
    const hasFacilitate = await userHasScope(
      ctx,
      components.tasquencerAuthorization,
      authUser.userId,
      'cstabletops:facilitate',
    )
    if (!hasStaff && !hasFacilitate) {
      return []
    }

    return EXERCISES.map((e) => ({
      key: e.key,
      title: e.title,
      summary: e.summary,
      metadata: e.metadata,
      cardCount: e.cards.length,
    }))
  },
})

export const getUserCapabilities = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.getAuthUser(ctx)
    if (!authUser.userId) {
      return { canCreateSessions: false }
    }

    // Check if the user has the 'cstabletops:facilitate' scope (facilitators only)
    const canFacilitate = await userHasScope(
      ctx,
      components.tasquencerAuthorization,
      authUser.userId,
      'cstabletops:facilitate',
    )

    return { canCreateSessions: canFacilitate }
  },
})

export const getSession = query({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')
    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const participant = await getParticipantForSession(
      ctx.db,
      args.sessionId,
      userId as Id<'users'>,
    )
    if (!participant) throw new Error('FORBIDDEN')
    return await ctx.db.get(args.sessionId)
  },
})

export const getWorkItemContext = query({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')
    const metadata = await CstabletopsWorkItemHelpers.getWorkItemMetadata(
      ctx.db,
      args.workItemId,
    )
    if (!metadata) return null
    const workflowVersion = await resolveVersionForWorkItem(ctx as any, args.workItemId)
    const session = await ctx.db.get(metadata.aggregateTableId as Id<'ttxSessions'>)
    const workItem = await ctx.db.get(metadata.workItemId)

    if (metadata.payload.type === 'respondToInject') {
      return {
        workflowVersion,
        metadata,
        workItem,
        session,
        card: null,
        responses: [],
        notes: [],
        legacy: {
          injectId: metadata.payload.injectId,
          injectOrder: metadata.payload.injectOrder,
          injectTitle: metadata.payload.injectTitle,
          injectPrompt: metadata.payload.injectPrompt,
        },
      }
    }

    const cardId =
      metadata.payload.type === 'chooseOptionalCard'
        ? metadata.payload.optionalCardId
        : metadata.payload.cardId

    const card = await ctx.db.get(cardId)

    const responses = await ctx.db
      .query('ttxCardResponses')
      .withIndex('by_card_id', (q) => q.eq('cardId', cardId))
      .collect()

    const notes = await ctx.db
      .query('ttxCardNotes')
      .withIndex('by_card_id', (q) => q.eq('cardId', cardId))
      .collect()

    return { workflowVersion, metadata, workItem, session, card, responses, notes }
  },
})

export const getSessionDashboard = query({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const participant = await getParticipantForSession(ctx.db, args.sessionId, appUserId)
    if (!participant) {
      throw new Error('FORBIDDEN')
    }

    // Players get a read-only view; facilitators/observers/note-takers get full view
    const isPlayer = participant.role === 'player'
    const canManage = participant.role === 'facilitator'

    const session = await ctx.db.get(args.sessionId)
    if (!session) return null

    const participants = await listParticipantsForSession(ctx.db, args.sessionId)
    const cards = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    // Fetch all responses to track who has responded to each card (for bottleneck identification)
    const allResponses = await ctx.db
      .query('ttxCardResponses')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    // Group responses by cardId
    const responsesByCardId = new Map<Id<'ttxCards'>, typeof allResponses>()
    for (const response of allResponses) {
      const existing = responsesByCardId.get(response.cardId) ?? []
      existing.push(response)
      responsesByCardId.set(response.cardId, existing)
    }

    const cardsSorted = [...cards].sort((a, b) => a.order - b.order)
    const totalCards = cardsSorted.length
    const completedCards = cardsSorted.filter((c) => c.status === 'completed').length
    const skippedCards = cardsSorted.filter((c) => c.status === 'skipped').length

    const playerRoles = session.playerRoles ?? []
    const playerRoleTitles = new Map(playerRoles.map((r) => [r.key, r.title]))

    // Build a map of playerRoleKey -> participant info for bottleneck identification
    const playersByRoleKey = new Map<string, { userId: Id<'users'>; playerRoleTitle: string | null }>()
    for (const p of participants) {
      if (p.role === 'player' && p.playerRoleKey) {
        playersByRoleKey.set(p.playerRoleKey, {
          userId: p.userId,
          playerRoleTitle: playerRoleTitles.get(p.playerRoleKey) ?? null,
        })
      }
    }

    const participantsView = participants.map((p) => ({
      _id: p._id,
      userId: p.userId,
      role: p.role,
      playerRoleKey: p.playerRoleKey ?? null,
      playerRoleTitle: p.playerRoleKey ? playerRoleTitles.get(p.playerRoleKey) ?? null : null,
      createdAt: p.createdAt,
    }))

    const countsByRole = participantsView.reduce<Record<string, number>>((acc, p) => {
      acc[p.role] = (acc[p.role] ?? 0) + 1
      return acc
    }, {})

    // For the current user (if player), track their assigned cards
    const currentUserPlayerRoleKey = participant.playerRoleKey ?? null

    return {
      viewerRole: participant.role,
      viewerPlayerRoleKey: currentUserPlayerRoleKey,
      viewerPlayerRoleTitle: currentUserPlayerRoleKey
        ? playerRoleTitles.get(currentUserPlayerRoleKey) ?? null
        : null,
      isPlayer,
      canManage,
      session: {
        _id: session._id,
        title: session.title,
        exerciseKey: session.exerciseKey as ExerciseKey,
        exerciseTitle: session.exerciseTitle,
        joinCode: isPlayer ? null : (session.joinCode ?? null), // Hide join code from players
        status: session.status,
        createdAt: session.createdAt,
        completedAt: session.completedAt ?? null,
        playerRoles,
      },
      stats: {
        totalCards,
        completedCards,
        skippedCards,
      },
      countsByRole,
      participants: participantsView,
      cards: cardsSorted.map((c) => {
        const cardResponses = responsesByCardId.get(c._id) ?? []
        const respondedRoleKeys = new Set(cardResponses.map((r) => r.playerRoleKey).filter(Boolean))

        // Determine which roles are expected to respond to this card
        // For prompt cards with assigned role, only that role responds
        // Otherwise, check if it's a discussion card (multiple could respond)
        let expectedResponders: Array<{ roleKey: string; roleTitle: string | null; hasResponded: boolean }> = []
        let waitingOn: Array<{ roleKey: string; roleTitle: string | null }> = []

        if (c.kind === 'prompt' && c.assignedPlayerRoleKey) {
          // Single role assigned
          const hasResponded = respondedRoleKeys.has(c.assignedPlayerRoleKey)
          expectedResponders = [{
            roleKey: c.assignedPlayerRoleKey,
            roleTitle: playerRoleTitles.get(c.assignedPlayerRoleKey) ?? null,
            hasResponded,
          }]
          if (!hasResponded && c.status === 'active') {
            waitingOn = [{
              roleKey: c.assignedPlayerRoleKey,
              roleTitle: playerRoleTitles.get(c.assignedPlayerRoleKey) ?? null,
            }]
          }
        }

        return {
          _id: c._id,
          order: c.order,
          kind: c.kind,
          title: c.title,
          status: c.status,
          assignedPlayerRoleKey: c.assignedPlayerRoleKey ?? null,
          assignedPlayerRoleTitle: c.assignedPlayerRoleKey
            ? playerRoleTitles.get(c.assignedPlayerRoleKey) ?? null
            : null,
          completedAt: c.completedAt ?? null,
          // Response tracking for bottleneck identification
          responseCount: cardResponses.length,
          expectedResponders,
          waitingOn,
          // For player view: is this card assigned to the current user?
          isAssignedToViewer: currentUserPlayerRoleKey
            ? c.assignedPlayerRoleKey === currentUserPlayerRoleKey
            : false,
        }
      }),
    }
  },
})

export const getCstabletopsWorkQueue = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')
    const authUser = await authComponent.getAuthUser(ctx)
    if (!authUser.userId) return []
    const userId = authUser.userId

    const available = await CstabletopsWorkItemHelpers.getAvailableWorkItemsByWorkflow(
      ctx,
      userId,
      'cstabletops',
    )

    const claimed = (await CstabletopsWorkItemHelpers.getClaimedWorkItemsByUser(ctx.db, userId)).filter(
      (item) => item.metadata.workflowName === 'cstabletops',
    )

    const combined = [...available, ...claimed]

    const humanItems = combined.filter(
      (item) =>
        isHumanOffer(item.metadata.offer) &&
        // Ignore legacy work items from the old inject-based example.
        item.metadata.payload.type !== 'respondToInject' &&
        // Hide completed items from the queue; they show up in history instead.
        item.workItem?.state !== 'completed',
    )
    if (humanItems.length === 0) return []

    const sessionIds = new Set(
      humanItems.map((item) => item.metadata.aggregateTableId as Id<'ttxSessions'>),
    )
    const sessionsMap = new Map<Id<'ttxSessions'>, Doc<'ttxSessions'> | null>()
    await Promise.all(
      Array.from(sessionIds).map(async (sessionId) => {
        const session = await ctx.db.get(sessionId)
        sessionsMap.set(sessionId, session)
      }),
    )

    const results: Array<{
      _id: Id<'cstabletopsWorkItems'>
      _creationTime: number
      workItemId: Id<'tasquencerWorkItems'>
      taskName: string
      taskType: string
      status: 'pending' | 'claimed' | 'completed'
      requiredScope: string | null
      session: {
        _id: Id<'ttxSessions'>
        title: string
        exerciseKey: ExerciseKey
        exerciseTitle: string
        status: 'active' | 'completed'
        createdAt: number
      } | null
      card: {
        cardId: Id<'ttxCards'>
        order: number | null
        title: string
        assignedPlayerRoleTitle?: string | null
      }
    }> = []

    for (const item of humanItems) {
      const metadata = item.metadata
      const workItem = item.workItem
      const offer = requireHumanOffer(metadata)
      const session = sessionsMap.get(
        metadata.aggregateTableId as Id<'ttxSessions'>,
      )

      if (metadata.payload.type === 'respondToInject') {
        continue
      }

      const card =
        metadata.payload.type === 'chooseOptionalCard'
          ? {
              cardId: metadata.payload.optionalCardId,
              order: null,
              title: metadata.payload.optionalCardTitle,
            }
          : {
              cardId: metadata.payload.cardId,
              order: metadata.payload.cardOrder,
              title: metadata.payload.cardTitle,
              assignedPlayerRoleTitle:
                metadata.payload.type === 'recordResponse'
                  ? metadata.payload.assignedPlayerRoleTitle ?? null
                  : null,
            }

      results.push({
        _id: metadata._id,
        _creationTime: metadata._creationTime,
        workItemId: metadata.workItemId,
        taskName: metadata.payload.taskName,
        taskType: metadata.payload.type,
        status: deriveWorkItemStatus(workItem, metadata),
        requiredScope: offer.requiredScope ?? null,
        session: session
          ? {
              _id: session._id,
              title: session.title,
              exerciseKey: session.exerciseKey as ExerciseKey,
              exerciseTitle: session.exerciseTitle,
              status: session.status,
              createdAt: session.createdAt,
            }
          : null,
        card,
      })
    }

    return results
  },
})

export const cstabletopsWorkflowTaskStates = query({
  args: { workflowId: v.id('tasquencerWorkflows') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')
    const workflow = await ctx.db.get(args.workflowId)
    const version = workflow?.versionName === 'v1' ? 'v1' : 'v2'
    const fn = version === 'v1' ? getWorkflowTaskStatesV1 : getWorkflowTaskStatesV2
    return await fn(ctx.db, { workflowName: 'cstabletops', workflowId: args.workflowId })
  },
})

export const getSessionReport = query({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const participant = await getParticipantForSession(ctx.db, args.sessionId, appUserId)
    if (!participant) {
      throw new Error('FORBIDDEN')
    }

    const session = await ctx.db.get(args.sessionId)
    if (!session) return null

    // Get all participants with user details
    const participants = await listParticipantsForSession(ctx.db, args.sessionId)
    const userIds = [...new Set(participants.map((p) => p.userId))]
    const usersMap = new Map<Id<'users'>, { name: string | null; email: string | null }>()
    await Promise.all(
      userIds.map(async (uid) => {
        const user = await ctx.db.get(uid)
        usersMap.set(uid, { name: user?.name ?? null, email: user?.email ?? null })
      }),
    )

    // Get all cards sorted by order
    const cards = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const cardsSorted = [...cards].sort((a, b) => a.order - b.order)

    // Get all responses
    const allResponses = await ctx.db
      .query('ttxCardResponses')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    // Get all notes
    const allNotes = await ctx.db
      .query('ttxCardNotes')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    // Group responses and notes by cardId
    const responsesByCardId = new Map<Id<'ttxCards'>, typeof allResponses>()
    for (const response of allResponses) {
      const existing = responsesByCardId.get(response.cardId) ?? []
      existing.push(response)
      responsesByCardId.set(response.cardId, existing)
    }

    const notesByCardId = new Map<Id<'ttxCards'>, typeof allNotes>()
    for (const note of allNotes) {
      const existing = notesByCardId.get(note.cardId) ?? []
      existing.push(note)
      notesByCardId.set(note.cardId, existing)
    }

    const playerRoles = session.playerRoles ?? []
    const playerRoleTitles = new Map(playerRoles.map((r) => [r.key, r.title]))

    // Build participant list with user info
    const participantsWithNames = participants.map((p) => {
      const user = usersMap.get(p.userId)
      return {
        role: p.role,
        playerRoleKey: p.playerRoleKey ?? null,
        playerRoleTitle: p.playerRoleKey ? playerRoleTitles.get(p.playerRoleKey) ?? null : null,
        userName: user?.name ?? user?.email ?? 'Unknown',
      }
    })

    // Build cards with their responses and notes
    const cardsWithContent = cardsSorted.map((card) => {
      const cardResponses = responsesByCardId.get(card._id) ?? []
      const cardNotes = notesByCardId.get(card._id) ?? []

      return {
        order: card.order,
        kind: card.kind,
        title: card.title,
        body: card.body,
        prompt: card.prompt ?? null,
        questions: card.questions ?? null,
        status: card.status,
        assignedPlayerRoleKey: card.assignedPlayerRoleKey ?? null,
        assignedPlayerRoleTitle: card.assignedPlayerRoleKey
          ? playerRoleTitles.get(card.assignedPlayerRoleKey) ?? null
          : null,
        responses: cardResponses.map((r) => {
          const user = usersMap.get(r.responderUserId)
          return {
            playerRoleKey: r.playerRoleKey ?? null,
            playerRoleTitle: r.playerRoleKey ? playerRoleTitles.get(r.playerRoleKey) ?? null : null,
            responderName: user?.name ?? user?.email ?? 'Unknown',
            response: r.response,
            createdAt: r.createdAt,
          }
        }),
        notes: cardNotes.map((n) => {
          const user = usersMap.get(n.authorUserId)
          return {
            authorName: user?.name ?? user?.email ?? 'Unknown',
            notes: n.notes,
            createdAt: n.createdAt,
          }
        }),
      }
    })

    return {
      session: {
        _id: session._id,
        title: session.title,
        exerciseKey: session.exerciseKey as ExerciseKey,
        exerciseTitle: session.exerciseTitle,
        status: session.status,
        createdAt: session.createdAt,
        completedAt: session.completedAt ?? null,
      },
      participants: participantsWithNames,
      cards: cardsWithContent,
    }
  },
})

// ============================================================================
// Live Presentation API
// ============================================================================

/**
 * Get live presentation state for a session.
 * Returns null if no presentation is active.
 */
export const getLivePresentationState = query({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const participant = await getParticipantForSession(ctx.db, args.sessionId, appUserId)
    if (!participant) {
      throw new Error('FORBIDDEN')
    }

    const session = await ctx.db.get(args.sessionId)
    if (!session) return null

    const presentationState = await getPresentationState(ctx.db, args.sessionId)
    if (!presentationState) {
      return { isActive: false as const }
    }

    const currentCard = await ctx.db.get(presentationState.currentCardId)
    if (!currentCard) {
      return { isActive: false as const }
    }

    // Get all cards for navigation context
    const allCards = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const cardsSorted = [...allCards].sort((a, b) => a.order - b.order)

    // Get responses for the current card
    const responses = await ctx.db
      .query('ttxCardResponses')
      .withIndex('by_card_id', (q) => q.eq('cardId', currentCard._id))
      .collect()

    // Get user info for responses
    const responderIds = [...new Set(responses.map((r) => r.responderUserId))]
    const usersMap = new Map<Id<'users'>, { name: string | null; email: string | null }>()
    await Promise.all(
      responderIds.map(async (uid) => {
        const user = await ctx.db.get(uid)
        usersMap.set(uid, { name: user?.name ?? null, email: user?.email ?? null })
      }),
    )

    const playerRoles = session.playerRoles ?? []
    const playerRoleTitles = new Map(playerRoles.map((r) => [r.key, r.title]))

    // Check which players have responded (for prompt cards)
    const respondedRoleKeys = new Set(responses.map((r) => r.playerRoleKey).filter(Boolean))
    const expectedResponders = currentCard.kind === 'prompt' && currentCard.assignedPlayerRoleKey
      ? [{
          roleKey: currentCard.assignedPlayerRoleKey,
          roleTitle: playerRoleTitles.get(currentCard.assignedPlayerRoleKey) ?? null,
          hasResponded: respondedRoleKeys.has(currentCard.assignedPlayerRoleKey),
        }]
      : []

    // Viewer info
    const viewerPlayerRoleKey = participant.playerRoleKey ?? null
    const isCardAssignedToViewer = viewerPlayerRoleKey
      ? currentCard.assignedPlayerRoleKey === viewerPlayerRoleKey
      : false
    const hasViewerResponded = viewerPlayerRoleKey
      ? respondedRoleKeys.has(viewerPlayerRoleKey)
      : false

    return {
      isActive: true as const,
      status: presentationState.status,
      startedAt: presentationState.startedAt,
      pausedAt: presentationState.pausedAt ?? null,
      facilitatorUserId: presentationState.facilitatorUserId,
      currentCard: {
        _id: currentCard._id,
        order: currentCard.order,
        kind: currentCard.kind,
        title: currentCard.title,
        body: currentCard.body,
        prompt: currentCard.prompt ?? null,
        questions: currentCard.questions ?? null,
        assignedPlayerRoleKey: currentCard.assignedPlayerRoleKey ?? null,
        assignedPlayerRoleTitle: currentCard.assignedPlayerRoleKey
          ? playerRoleTitles.get(currentCard.assignedPlayerRoleKey) ?? null
          : null,
      },
      responses: responses.map((r) => {
        const user = usersMap.get(r.responderUserId)
        return {
          playerRoleKey: r.playerRoleKey ?? null,
          playerRoleTitle: r.playerRoleKey ? playerRoleTitles.get(r.playerRoleKey) ?? null : null,
          responderName: user?.name ?? user?.email ?? 'Unknown',
          response: r.response,
        }
      }),
      expectedResponders,
      totalCards: cardsSorted.length,
      // Viewer context
      viewerRole: participant.role,
      viewerPlayerRoleKey,
      viewerPlayerRoleTitle: viewerPlayerRoleKey
        ? playerRoleTitles.get(viewerPlayerRoleKey) ?? null
        : null,
      isCardAssignedToViewer,
      hasViewerResponded,
      // For facilitator navigation
      canGoBack: currentCard.order > 1,
      canGoForward: currentCard.order < cardsSorted.length,
    }
  },
})

/**
 * Start live presentation mode for a session.
 * Only facilitators can start a presentation.
 */
export const startLivePresentation = mutation({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:facilitate')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const session = await ctx.db.get(args.sessionId)
    invariant(session, 'SESSION_NOT_FOUND')
    invariant(session.status === 'active', 'SESSION_NOT_ACTIVE')

    const participant = await getParticipantForSession(ctx.db, args.sessionId, appUserId)
    invariant(participant, 'FORBIDDEN')
    invariant(participant.role === 'facilitator', 'FACILITATOR_ONLY')

    // Check if there's already an active presentation
    const existing = await getPresentationState(ctx.db, args.sessionId)
    if (existing) {
      throw new Error('PRESENTATION_ALREADY_ACTIVE')
    }

    // Get the first card to start with
    const cards = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()
    const cardsSorted = [...cards].sort((a, b) => a.order - b.order)
    const firstCard = cardsSorted[0]
    invariant(firstCard, 'NO_CARDS_IN_SESSION')

    await ctx.db.insert('ttxPresentationState', {
      sessionId: args.sessionId,
      status: 'presenting',
      currentCardId: firstCard._id,
      currentCardOrder: firstCard.order,
      facilitatorUserId: appUserId,
      startedAt: Date.now(),
    })

    return { success: true }
  },
})

/**
 * Navigate to a specific card in the presentation.
 * Only the facilitator who started the presentation can navigate.
 */
export const navigatePresentationCard = mutation({
  args: {
    sessionId: v.id('ttxSessions'),
    cardId: v.id('ttxCards'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:facilitate')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const presentationState = await getPresentationState(ctx.db, args.sessionId)
    invariant(presentationState, 'NO_ACTIVE_PRESENTATION')
    invariant(presentationState.facilitatorUserId === appUserId, 'NOT_PRESENTATION_FACILITATOR')

    const card = await ctx.db.get(args.cardId)
    invariant(card, 'CARD_NOT_FOUND')
    invariant(card.sessionId === args.sessionId, 'CARD_NOT_IN_SESSION')

    await ctx.db.patch(presentationState._id, {
      currentCardId: args.cardId,
      currentCardOrder: card.order,
      status: 'presenting',
      pausedAt: undefined,
    })

    return { success: true }
  },
})

/**
 * Pause the presentation (holds on current card).
 */
export const pausePresentation = mutation({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:facilitate')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const presentationState = await getPresentationState(ctx.db, args.sessionId)
    invariant(presentationState, 'NO_ACTIVE_PRESENTATION')
    invariant(presentationState.facilitatorUserId === appUserId, 'NOT_PRESENTATION_FACILITATOR')

    await ctx.db.patch(presentationState._id, {
      status: 'paused',
      pausedAt: Date.now(),
    })

    return { success: true }
  },
})

/**
 * Resume the presentation from pause.
 */
export const resumePresentation = mutation({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:facilitate')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const presentationState = await getPresentationState(ctx.db, args.sessionId)
    invariant(presentationState, 'NO_ACTIVE_PRESENTATION')
    invariant(presentationState.facilitatorUserId === appUserId, 'NOT_PRESENTATION_FACILITATOR')

    await ctx.db.patch(presentationState._id, {
      status: 'presenting',
      pausedAt: undefined,
    })

    return { success: true }
  },
})

/**
 * Show responses to all participants (during discussion).
 */
export const showPresentationResponses = mutation({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:facilitate')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const presentationState = await getPresentationState(ctx.db, args.sessionId)
    invariant(presentationState, 'NO_ACTIVE_PRESENTATION')
    invariant(presentationState.facilitatorUserId === appUserId, 'NOT_PRESENTATION_FACILITATOR')

    await ctx.db.patch(presentationState._id, {
      status: 'showing_responses',
    })

    return { success: true }
  },
})

/**
 * End the live presentation.
 */
export const endLivePresentation = mutation({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:facilitate')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const presentationState = await getPresentationState(ctx.db, args.sessionId)
    invariant(presentationState, 'NO_ACTIVE_PRESENTATION')
    invariant(presentationState.facilitatorUserId === appUserId, 'NOT_PRESENTATION_FACILITATOR')

    // Delete the presentation state to end it
    await ctx.db.delete(presentationState._id)

    return { success: true }
  },
})

/**
 * Get all cards for a session (for presentation navigation).
 */
export const getSessionCards = query({
  args: { sessionId: v.id('ttxSessions') },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    const participant = await getParticipantForSession(ctx.db, args.sessionId, appUserId)
    if (!participant) {
      throw new Error('FORBIDDEN')
    }

    const session = await ctx.db.get(args.sessionId)
    if (!session) return []

    const cards = await ctx.db
      .query('ttxCards')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    const playerRoles = session.playerRoles ?? []
    const playerRoleTitles = new Map(playerRoles.map((r) => [r.key, r.title]))

    return [...cards]
      .sort((a, b) => a.order - b.order)
      .map((card) => ({
        _id: card._id,
        order: card.order,
        kind: card.kind,
        title: card.title,
        assignedPlayerRoleTitle: card.assignedPlayerRoleKey
          ? playerRoleTitles.get(card.assignedPlayerRoleKey) ?? null
          : null,
      }))
  },
})

/**
 * Submit a live response during presentation mode.
 * Players submit responses that are visible to everyone in real-time.
 */
export const submitLiveResponse = mutation({
  args: {
    sessionId: v.id('ttxSessions'),
    cardId: v.id('ttxCards'),
    response: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'cstabletops:staff')

    const authUser = await authComponent.getAuthUser(ctx)
    const userId = authUser.userId
    invariant(userId, 'USER_NOT_AUTHENTICATED')
    const appUserId = userId as Id<'users'>

    invariant(args.response.trim().length > 0, 'RESPONSE_REQUIRED')

    const session = await ctx.db.get(args.sessionId)
    invariant(session, 'SESSION_NOT_FOUND')
    invariant(session.status === 'active', 'SESSION_NOT_ACTIVE')

    const participant = await getParticipantForSession(ctx.db, args.sessionId, appUserId)
    invariant(participant, 'FORBIDDEN')
    invariant(participant.role === 'player', 'PLAYERS_ONLY')

    const card = await ctx.db.get(args.cardId)
    invariant(card, 'CARD_NOT_FOUND')
    invariant(card.sessionId === args.sessionId, 'CARD_NOT_IN_SESSION')

    // Verify the card is assigned to this player (if it has an assigned role)
    if (card.assignedPlayerRoleKey) {
      invariant(
        card.assignedPlayerRoleKey === participant.playerRoleKey,
        'NOT_ASSIGNED_TO_THIS_CARD',
      )
    }

    // Check if already responded
    const existingResponse = await ctx.db
      .query('ttxCardResponses')
      .withIndex('by_session_and_responder', (q) =>
        q.eq('sessionId', args.sessionId).eq('responderUserId', appUserId),
      )
      .filter((q) => q.eq(q.field('cardId'), args.cardId))
      .first()
    invariant(!existingResponse, 'ALREADY_RESPONDED')

    await ctx.db.insert('ttxCardResponses', {
      sessionId: args.sessionId,
      cardId: args.cardId,
      responderUserId: appUserId,
      playerRoleKey: participant.playerRoleKey,
      response: args.response.trim(),
      createdAt: Date.now(),
    })

    return { success: true }
  },
})
