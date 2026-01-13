import type { DatabaseReader, DatabaseWriter } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'

/**
 * Insert a new campaign record
 */
export async function insertCampaign(
  db: DatabaseWriter,
  campaign: Omit<Doc<'campaigns'>, '_id' | '_creationTime'>,
): Promise<Id<'campaigns'>> {
  return await db.insert('campaigns', campaign)
}

/**
 * Get campaign by workflow ID
 */
export async function getCampaignByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'campaigns'> | null> {
  return await db
    .query('campaigns')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .unique()
}

/**
 * Update campaign message
 */
export async function updateCampaignMessage(
  db: DatabaseWriter,
  campaignId: Id<'campaigns'>,
  message: string,
): Promise<void> {
  await db.patch(campaignId, { message })
}

/**
 * List all campaigns
 */
export async function listCampaigns(
  db: DatabaseReader,
): Promise<Doc<'campaigns'>[]> {
  return await db.query('campaigns').order('desc').collect()
}
