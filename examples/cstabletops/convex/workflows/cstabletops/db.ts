import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { helpers } from '../../tasquencer'

export async function insertSession(
  db: DatabaseWriter,
  session: Omit<Doc<'ttxSessions'>, '_id' | '_creationTime'>,
): Promise<Id<'ttxSessions'>> {
  return await db.insert('ttxSessions', session)
}

export async function getSessionByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'ttxSessions'> | null> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId)
  return await db
    .query('ttxSessions')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', rootWorkflowId))
    .unique()
}

export async function listSessions(
  db: DatabaseReader,
): Promise<Array<Doc<'ttxSessions'>>> {
  return await db.query('ttxSessions').withIndex('by_created_at').collect()
}

export async function listSessionsForUser(
  db: DatabaseReader,
  userId: Id<'users'>,
): Promise<Array<Doc<'ttxSessions'>>> {
  const participantRows = await db
    .query('ttxParticipants')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .collect()

  const uniqueSessionIds = Array.from(
    new Set(participantRows.map((p) => p.sessionId)),
  )

  const sessions = await Promise.all(uniqueSessionIds.map((id) => db.get(id)))
  return sessions
    .filter((s): s is Doc<'ttxSessions'> => s !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function markSessionCompleted(
  db: DatabaseWriter,
  sessionId: Id<'ttxSessions'>,
): Promise<void> {
  await db.patch(sessionId, { status: 'completed', completedAt: Date.now() })
}

export async function insertParticipant(
  db: DatabaseWriter,
  participant: Omit<Doc<'ttxParticipants'>, '_id' | '_creationTime'>,
): Promise<Id<'ttxParticipants'>> {
  return await db.insert('ttxParticipants', participant)
}

export async function listParticipantsForSession(
  db: DatabaseReader,
  sessionId: Id<'ttxSessions'>,
): Promise<Array<Doc<'ttxParticipants'>>> {
  return await db
    .query('ttxParticipants')
    .withIndex('by_session_id', (q) => q.eq('sessionId', sessionId))
    .collect()
}

export async function getParticipantForSession(
  db: DatabaseReader,
  sessionId: Id<'ttxSessions'>,
  userId: Id<'users'>,
): Promise<Doc<'ttxParticipants'> | null> {
  const matches = await db
    .query('ttxParticipants')
    .withIndex('by_session_and_user', (q) =>
      q.eq('sessionId', sessionId).eq('userId', userId),
    )
    .collect()

  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0] ?? null

  // Backwards compatibility: older versions allowed multiple roles per user/session.
  // Prefer the most "privileged" role for authorization checks.
  const rolePriority: Record<Doc<'ttxParticipants'>['role'], number> = {
    facilitator: 0,
    noteTaker: 1,
    player: 2,
    observer: 3,
  }

  const sorted = [...matches].sort((a, b) => {
    const byRole = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
    if (byRole !== 0) return byRole
    // Prefer a player record that already has a playerRoleKey.
    const aHasKey = a.playerRoleKey ? 0 : 1
    const bHasKey = b.playerRoleKey ? 0 : 1
    return aHasKey - bHasKey
  })

  return sorted[0] ?? null
}

export async function getSessionByJoinCode(
  db: DatabaseReader,
  joinCode: string,
): Promise<Doc<'ttxSessions'> | null> {
  return (
    (await db
      .query('ttxSessions')
      .withIndex('by_join_code', (q) => q.eq('joinCode', joinCode))
      .unique()) ?? null
  )
}

export async function insertCard(
  db: DatabaseWriter,
  card: Omit<Doc<'ttxCards'>, '_id' | '_creationTime'>,
): Promise<Id<'ttxCards'>> {
  return await db.insert('ttxCards', card)
}

export async function getCard(
  db: DatabaseReader,
  cardId: Id<'ttxCards'>,
): Promise<Doc<'ttxCards'> | null> {
  return await db.get(cardId)
}

export async function getCardByOrder(
  db: DatabaseReader,
  sessionId: Id<'ttxSessions'>,
  order: number,
): Promise<Doc<'ttxCards'> | null> {
  const card = await db
    .query('ttxCards')
    .withIndex('by_session_and_order', (q) =>
      q.eq('sessionId', sessionId).eq('order', order),
    )
    .unique()
  return card ?? null
}

export async function markCardActive(
  db: DatabaseWriter,
  cardId: Id<'ttxCards'>,
): Promise<void> {
  await db.patch(cardId, { status: 'active' })
}

export async function markCardCompleted(
  db: DatabaseWriter,
  cardId: Id<'ttxCards'>,
): Promise<void> {
  const card = await db.get(cardId)
  if (card?.status === 'completed') {
    throw new Error('TASK_ALREADY_COMPLETED')
  }
  await db.patch(cardId, { status: 'completed', completedAt: Date.now() })
}

export async function markCardSkipped(
  db: DatabaseWriter,
  cardId: Id<'ttxCards'>,
): Promise<void> {
  await db.patch(cardId, { status: 'skipped', completedAt: Date.now() })
}

export async function insertCardResponse(
  db: DatabaseWriter,
  response: Omit<Doc<'ttxCardResponses'>, '_id' | '_creationTime'>,
): Promise<Id<'ttxCardResponses'>> {
  return await db.insert('ttxCardResponses', response)
}

export async function insertCardNotes(
  db: DatabaseWriter,
  notes: Omit<Doc<'ttxCardNotes'>, '_id' | '_creationTime'>,
): Promise<Id<'ttxCardNotes'>> {
  return await db.insert('ttxCardNotes', notes)
}

// Live presentation state helpers

export async function getPresentationState(
  db: DatabaseReader,
  sessionId: Id<'ttxSessions'>,
): Promise<Doc<'ttxPresentationState'> | null> {
  return (
    (await db
      .query('ttxPresentationState')
      .withIndex('by_session_id', (q) => q.eq('sessionId', sessionId))
      .unique()) ?? null
  )
}

export async function listCardsForSession(
  db: DatabaseReader,
  sessionId: Id<'ttxSessions'>,
): Promise<Array<Doc<'ttxCards'>>> {
  return await db
    .query('ttxCards')
    .withIndex('by_session_id', (q) => q.eq('sessionId', sessionId))
    .collect()
}

export async function listCardResponsesForSession(
  db: DatabaseReader,
  sessionId: Id<'ttxSessions'>,
): Promise<Array<Doc<'ttxCardResponses'>>> {
  return await db
    .query('ttxCardResponses')
    .withIndex('by_session_id', (q) => q.eq('sessionId', sessionId))
    .collect()
}
