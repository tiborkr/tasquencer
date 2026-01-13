import type { MutationCtx } from '../../../_generated/server'
import type { Id, Doc } from '../../../_generated/dataModel'

/**
 * Initializes campaign work item metadata using auth scope-based authorization.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The ID of the work item to initialize metadata for
 * @param config - Configuration object containing scope, optional group, campaign ID, and payload
 */
export async function initializeCampaignWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<'tasquencerWorkItems'>,
  config: {
    scope: string
    groupId?: string
    campaignId: Id<'campaigns'>
    payload: Doc<'campaignWorkItems'>['payload']
  },
): Promise<Id<'campaignWorkItems'>> {
  return await mutationCtx.db.insert('campaignWorkItems', {
    workItemId,
    workflowName: 'campaign_approval',
    offer: {
      type: 'human' as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    },
    aggregateTableId: config.campaignId,
    payload: config.payload,
  })
}
