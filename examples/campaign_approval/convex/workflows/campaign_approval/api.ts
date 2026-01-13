import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { campaignApprovalVersionManager } from './definition'
import { getCampaignByWorkflowId, listCampaigns } from './db'
import { CampaignWorkItemHelpers } from './helpers'
import { authComponent } from '../../auth'
import { type HumanWorkItemOffer, isHumanOffer } from '@repo/tasquencer'
import { assertUserHasScope } from '../../authorization'

// Extract API from version manager
// Note: With 20+ tasks, TypeScript type inference hits depth limits
// Using internal/exported pattern to manage type complexity
const versionApi = campaignApprovalVersionManager.apiForVersion('v1')

// Export work item APIs directly (these don't hit the depth limit)
export const {
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  helpers: { getWorkflowTaskStates },
} = versionApi

// Export initializeRootWorkflow with explicit typing to avoid TS2589
// The mutation still works correctly at runtime
export const initializeRootWorkflow = versionApi.initializeRootWorkflow as typeof versionApi.initializeRootWorkflow

function requireHumanOffer(
  metadata: Doc<'campaignWorkItems'>,
): HumanWorkItemOffer {
  if (!isHumanOffer(metadata.offer)) {
    throw new Error('Campaign work items must be offered to humans')
  }
  return metadata.offer
}

function deriveWorkItemStatus(
  workItem: Doc<'tasquencerWorkItems'> | null,
  metadata: Doc<'campaignWorkItems'>,
): 'pending' | 'claimed' | 'completed' {
  if (workItem?.state === 'completed') return 'completed'
  if (metadata.claim) return 'claimed'
  return 'pending'
}

/**
 * Get campaign by workflow ID
 */
export const getCampaign = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await getCampaignByWorkflowId(ctx.db, args.workflowId)
  },
})

/**
 * List all campaigns
 */
export const getCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await listCampaigns(ctx.db)
  },
})

/**
 * Claim a campaign work item
 */
export const claimCampaignWorkItem = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:manage')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const userId = authUser.userId

    const canClaim = await CampaignWorkItemHelpers.canUserClaimWorkItem(
      ctx,
      userId,
      args.workItemId,
    )

    if (!canClaim) {
      throw new Error('CAMPAIGN_WORK_ITEM_CLAIM_NOT_ALLOWED')
    }

    await CampaignWorkItemHelpers.claimWorkItem(ctx, args.workItemId, userId)
  },
})

/**
 * Get the campaign work queue for the authenticated user
 */
export const getCampaignWorkQueue = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'campaign:read')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    const userId = authUser.userId

    const items = await CampaignWorkItemHelpers.getAvailableWorkItemsByWorkflow(
      ctx,
      userId,
      'campaign_approval',
    )

    const humanItems = items.filter((item) => isHumanOffer(item.metadata.offer))

    if (humanItems.length === 0) {
      return []
    }

    // Batch load campaigns
    const campaignIds = new Set(
      humanItems.map(
        (item) => item.metadata.aggregateTableId as Id<'campaigns'>,
      ),
    )
    const campaignsMap = new Map<Id<'campaigns'>, Doc<'campaigns'> | null>()
    await Promise.all(
      Array.from(campaignIds).map(async (campaignId) => {
        const campaign = await ctx.db.get(campaignId)
        campaignsMap.set(campaignId, campaign)
      }),
    )

    return humanItems.map((item) => {
      const metadata = item.metadata
      const workItem = item.workItem
      const campaign = campaignsMap.get(
        metadata.aggregateTableId as Id<'campaigns'>,
      )
      const offer = requireHumanOffer(metadata)

      return {
        _id: metadata._id,
        _creationTime: metadata._creationTime,
        workItemId: metadata.workItemId,
        taskName: metadata.payload.taskName,
        taskType: metadata.payload.type,
        status: deriveWorkItemStatus(workItem, metadata),
        requiredScope: offer.requiredScope ?? null,
        campaign: campaign
          ? {
              _id: campaign._id,
              name: campaign.name,
              objective: campaign.objective,
              status: campaign.status,
              estimatedBudget: campaign.estimatedBudget,
              createdAt: campaign.createdAt,
            }
          : null,
      }
    })
  },
})

/**
 * Get workflow task states
 * Note: Using any cast to avoid TypeScript deep type instantiation
 * limits with large workflow (18+ tasks)
 */
export const campaignWorkflowTaskStates = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args): Promise<Record<string, string>> => {
    await assertUserHasScope(ctx, 'campaign:read')
    // Cast to any to break deep type chain
    const getTaskStates = getWorkflowTaskStates as any
    const result = await getTaskStates(ctx.db, {
      workflowName: 'campaign_approval',
      workflowId: args.workflowId,
    })
    return result as Record<string, string>
  },
})
