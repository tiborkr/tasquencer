import type { MutationCtx } from '../../../_generated/server'
import type { Id, Doc } from '../../../_generated/dataModel'

/**
 * Initializes LUcampaignUapproval work item metadata using auth scope-based authorization.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The ID of the work item to initialize metadata for
 * @param config - Configuration object containing scope, optional group, LUcampaignUapproval ID, and payload
 */
export async function initializeUcampaignUapprovalWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    groupId?: string
    LUcampaignUapprovalId: Id<'LUcampaignUapprovals'>
    payload: Doc<'LUcampaignUapprovalWorkItems'>['payload']
  },
): Promise<Id<'LUcampaignUapprovalWorkItems'>> {
  return await mutationCtx.db.insert('LUcampaignUapprovalWorkItems', {
    workItemId,
    workflowName: 'campaign_approval',
    offer: {
      type: 'human' as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.LUcampaignUapprovalId,
    payload: config.payload,
  })
}
