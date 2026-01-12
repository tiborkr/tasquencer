import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

/**
 * Tabletop sessions (aggregate root).
 * Domain state is the source of truth; workflow state is for orchestration and UI only.
 */
const ttxSessions = defineTable({
  workflowId: v.id('tasquencerWorkflows'),
  title: v.string(),
  exerciseKey: v.string(),
  exerciseTitle: v.string(),
  // Optional for backwards compatibility with pre-join-code sessions.
  // Run `workflows/cstabletops/migrations:backfillLegacySessions` to populate.
  joinCode: v.optional(v.string()),
  // Optional for backwards compatibility with pre-role sessions.
  playerRoles: v.optional(
    v.array(
      v.object({
        key: v.string(),
        title: v.string(),
      }),
    ),
  ),
  groups: v.object({
    facilitatorsGroupId: v.string(),
    noteTakersGroupId: v.string(),
    playersGroupId: v.string(),
    observersGroupId: v.string(),
    playerRoleGroups: v.optional(
      v.array(
        v.object({
          roleKey: v.string(),
          groupId: v.string(),
        }),
      ),
    ),
  }),
  flags: v.optional(v.any()),
  status: v.union(v.literal('active'), v.literal('completed')),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index('by_workflow_id', ['workflowId'])
  .index('by_status', ['status'])
  .index('by_created_at', ['createdAt'])
  .index('by_exercise_key', ['exerciseKey'])
  .index('by_join_code', ['joinCode'])

/**
 * Session participants. A user has exactly one role per session.
 */
const ttxParticipants = defineTable({
  sessionId: v.id('ttxSessions'),
  userId: v.id('users'),
  role: v.union(
    v.literal('facilitator'),
    v.literal('noteTaker'),
    v.literal('player'),
    v.literal('observer'),
  ),
  playerRoleKey: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_session_id', ['sessionId'])
  .index('by_session_and_user', ['sessionId', 'userId'])
  .index('by_session_role_player_role_key', ['sessionId', 'role', 'playerRoleKey'])
  .index('by_user_id', ['userId'])

/**
 * Exercise cards: scenario beats, prompts, discussion questions, injects, etc.
 */
const ttxCards = defineTable({
  sessionId: v.id('ttxSessions'),
  order: v.number(),
  kind: v.union(
    v.literal('scenario'),
    v.literal('inject'),
    v.literal('prompt'),
    v.literal('discussion'),
  ),
  assignedPlayerRoleKey: v.optional(v.string()),
  title: v.string(),
  body: v.string(),
  prompt: v.optional(v.string()),
  questions: v.optional(v.array(v.string())),
  isOptional: v.optional(v.boolean()),
  status: v.union(
    v.literal('pending'),
    v.literal('active'),
    v.literal('completed'),
    v.literal('skipped'),
  ),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index('by_session_id', ['sessionId'])
  .index('by_session_and_order', ['sessionId', 'order'])
  .index('by_session_kind', ['sessionId', 'kind'])
  .index('by_status', ['status'])

/**
 * Note-taker notes for a specific card.
 */
const ttxCardNotes = defineTable({
  sessionId: v.id('ttxSessions'),
  cardId: v.id('ttxCards'),
  authorUserId: v.id('users'),
  notes: v.string(),
  createdAt: v.number(),
})
  .index('by_session_id', ['sessionId'])
  .index('by_card_id', ['cardId'])
  .index('by_session_and_author', ['sessionId', 'authorUserId'])

/**
 * Participant responses to a specific prompt card.
 */
const ttxCardResponses = defineTable({
  sessionId: v.id('ttxSessions'),
  cardId: v.id('ttxCards'),
  responderUserId: v.id('users'),
  playerRoleKey: v.optional(v.string()),
  response: v.string(),
  createdAt: v.number(),
})
  .index('by_session_id', ['sessionId'])
  .index('by_card_id', ['cardId'])
  .index('by_session_and_responder', ['sessionId', 'responderUserId'])

/**
 * Live presentation state for a session.
 * Tracks real-time synchronized presentation mode where facilitator leads participants.
 */
const ttxPresentationState = defineTable({
  sessionId: v.id('ttxSessions'),
  status: v.union(
    v.literal('presenting'),
    v.literal('paused'),
    v.literal('showing_responses'),
  ),
  currentCardId: v.id('ttxCards'),
  currentCardOrder: v.number(),
  facilitatorUserId: v.id('users'),
  startedAt: v.number(),
  pausedAt: v.optional(v.number()),
})
  .index('by_session_id', ['sessionId'])

/**
 * Work item metadata table for tabletop sessions.
 * Uses auth scope-based authorization.
 */
const cstabletopsWorkItems =
  defineWorkItemMetadataTable('ttxSessions').withPayload(
    v.union(
      // Legacy payload (pre-card refactor). Kept for backward compatibility so
      // existing databases can boot and then be cleaned up via a migration.
      v.object({
        type: v.literal('respondToInject'),
        taskName: v.string(),
        injectId: v.string(),
        injectOrder: v.number(),
        injectTitle: v.string(),
        injectPrompt: v.string(),
      }),
      v.object({
        type: v.literal('presentCard'),
        taskName: v.string(),
        cardId: v.id('ttxCards'),
        cardOrder: v.number(),
        cardKind: v.union(v.literal('scenario'), v.literal('inject')),
        cardTitle: v.string(),
        cardBody: v.string(),
      }),
      v.object({
        type: v.literal('recordResponse'),
        taskName: v.string(),
        cardId: v.id('ttxCards'),
        cardOrder: v.number(),
        cardTitle: v.string(),
        prompt: v.string(),
        assignedPlayerRoleKey: v.optional(v.string()),
        assignedPlayerRoleTitle: v.optional(v.string()),
      }),
      v.object({
        type: v.literal('recordNotes'),
        taskName: v.string(),
        cardId: v.id('ttxCards'),
        cardOrder: v.number(),
        cardTitle: v.string(),
        questions: v.array(v.string()),
      }),
      v.object({
        type: v.literal('chooseOptionalCard'),
        taskName: v.string(),
        optionalCardId: v.id('ttxCards'),
        optionalCardTitle: v.string(),
      }),
    ),
  )

export default {
  ttxSessions,
  ttxParticipants,
  ttxCards,
  ttxCardNotes,
  ttxCardResponses,
  ttxPresentationState,
  cstabletopsWorkItems,
}
