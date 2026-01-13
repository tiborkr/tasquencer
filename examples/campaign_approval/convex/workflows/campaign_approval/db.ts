import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

/**
 * Insert a new LUcampaignUapproval record
 */
export async function insertUcampaignUapproval(
  db: DatabaseWriter,
  LUcampaignUapproval: Omit<Doc<'LUcampaignUapprovals'>, '_id' | '_creationTime'>,
): Promise<Id<'LUcampaignUapprovals'>> {
  return await db.insert('LUcampaignUapprovals', LUcampaignUapproval)
}

/**
 * Get LUcampaignUapproval by workflow ID
 */
export async function getUcampaignUapprovalByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'LUcampaignUapprovals'> | null> {
  return await db
    .query('LUcampaignUapprovals')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

/**
 * Update LUcampaignUapproval message
 */
export async function updateUcampaignUapprovalMessage(
  db: DatabaseWriter,
  LUcampaignUapprovalId: Id<'LUcampaignUapprovals'>,
  message: string,
): Promise<void> {
  await db.patch(LUcampaignUapprovalId, { message })
}

/**
 * List all LUcampaignUapprovals
 */
export async function listUcampaignUapprovals(
  db: DatabaseReader,
): Promise<Doc<'LUcampaignUapprovals'>[]> {
  return await db.query('LUcampaignUapprovals').order('desc').collect()
}
