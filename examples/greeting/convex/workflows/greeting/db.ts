import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

/**
 * Insert a new greeting record
 */
export async function insertGreeting(
  db: DatabaseWriter,
  greeting: Omit<Doc<'greetings'>, '_id' | '_creationTime'>,
): Promise<Id<'greetings'>> {
  return await db.insert('greetings', greeting)
}

/**
 * Get greeting by workflow ID
 */
export async function getGreetingByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'greetings'> | null> {
  return await db
    .query('greetings')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

/**
 * Update greeting message
 */
export async function updateGreetingMessage(
  db: DatabaseWriter,
  greetingId: Id<'greetings'>,
  message: string,
): Promise<void> {
  await db.patch(greetingId, { message })
}

/**
 * List all greetings
 */
export async function listGreetings(
  db: DatabaseReader,
): Promise<Doc<'greetings'>[]> {
  return await db.query('greetings').order('desc').collect()
}
