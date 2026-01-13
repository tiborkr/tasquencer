import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { campaignApprovalVersionManager } from './definition'
import {
  getCampaignByWorkflowId,
  listCampaigns,
  listCampaignsByRequester,
  listCampaignsByOwner,
  getCampaign as getCampaignFromDb,
  getCampaignBudgetByCampaignId,
  listCreativesByCampaignId,
  listKPIsByCampaignId,
  updateCampaign,
  updateCampaignCreative,
} from './db'
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
  failWorkItem,
  cancelWorkItem,
  cancelRootWorkflow,
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

// ============================================================================
// Campaign Query Endpoints
// ============================================================================

/**
 * Get campaign by ID with related data
 */
export const getCampaignWithDetails = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    const campaign = await getCampaignFromDb(ctx.db, args.campaignId)
    if (!campaign) {
      return null
    }

    // Get related data
    const [budget, kpis] = await Promise.all([
      getCampaignBudgetByCampaignId(ctx.db, args.campaignId),
      listKPIsByCampaignId(ctx.db, args.campaignId),
    ])

    // Get workflow status
    const getTaskStates = getWorkflowTaskStates as any
    const taskStates = await getTaskStates(ctx.db, {
      workflowName: 'campaign_approval',
      workflowId: campaign.workflowId,
    })

    return {
      campaign,
      budget,
      kpis,
      workflowTaskStates: taskStates as Record<string, string>,
    }
  },
})

/**
 * Get campaigns owned by or requested by current user
 */
export const getMyCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'campaign:read')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    const userId = authUser.userId as Id<'users'>

    // Get campaigns where user is requester or owner
    const [requestedCampaigns, ownedCampaigns] = await Promise.all([
      listCampaignsByRequester(ctx.db, userId),
      listCampaignsByOwner(ctx.db, userId),
    ])

    // Merge and deduplicate by campaign ID
    const campaignMap = new Map<Id<'campaigns'>, Doc<'campaigns'>>()
    for (const campaign of requestedCampaigns) {
      campaignMap.set(campaign._id, campaign)
    }
    for (const campaign of ownedCampaigns) {
      campaignMap.set(campaign._id, campaign)
    }

    // Sort by creation time descending
    return Array.from(campaignMap.values()).sort(
      (a, b) => b._creationTime - a._creationTime,
    )
  },
})

// ============================================================================
// Budget Query Endpoints
// ============================================================================

/**
 * Get budget details for a campaign
 */
export const getCampaignBudget = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await getCampaignBudgetByCampaignId(ctx.db, args.campaignId)
  },
})

// ============================================================================
// Creative Query Endpoints
// ============================================================================

/**
 * Get all creative assets for a campaign
 */
export const getCampaignCreatives = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await listCreativesByCampaignId(ctx.db, args.campaignId)
  },
})

/**
 * Upload a creative asset file
 *
 * Updates a creative record with a storage reference from Convex file storage.
 * The client should first upload the file to Convex storage to get the storageId,
 * then call this mutation to associate it with the creative.
 */
export const uploadCreativeAsset = mutation({
  args: {
    creativeId: v.id('campaignCreatives'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:creative_write')

    // Verify the creative exists
    const creative = await ctx.db.get(args.creativeId)
    if (!creative) {
      throw new Error('CREATIVE_NOT_FOUND')
    }

    // Update the creative with the storage reference
    await updateCampaignCreative(ctx.db, args.creativeId, {
      storageId: args.storageId,
    })

    return { success: true }
  },
})

// ============================================================================
// Work Item Query Endpoints
// ============================================================================

/**
 * Get a specific work item with full context including campaign data
 */
export const getWorkItem = query({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')

    // Get work item from tasquencer
    const workItem = await ctx.db.get(args.workItemId)
    if (!workItem) {
      return null
    }

    // Get campaign work item metadata
    const metadata = await CampaignWorkItemHelpers.getWorkItemMetadata(
      ctx.db,
      args.workItemId,
    )
    if (!metadata) {
      return null
    }

    // Get campaign details
    const campaign = await ctx.db.get(
      metadata.aggregateTableId as Id<'campaigns'>,
    )

    const offer = isHumanOffer(metadata.offer) ? metadata.offer : null

    return {
      workItem: {
        _id: workItem._id,
        state: workItem.state,
      },
      metadata: {
        _id: metadata._id,
        workItemId: metadata.workItemId,
        taskName: metadata.payload.taskName,
        taskType: metadata.payload.type,
        payload: metadata.payload,
        requiredScope: offer?.requiredScope ?? null,
        requiredGroupId: offer?.requiredGroupId ?? null,
      },
      status: deriveWorkItemStatus(workItem, metadata),
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
  },
})

// ============================================================================
// Workflow Management Endpoints
// ============================================================================

/**
 * Cancel an in-progress campaign workflow
 *
 * Updates the campaign status to 'cancelled'. For full workflow cancellation
 * including stopping all pending work items, use `cancelRootWorkflow` which is
 * exported directly from the version manager API.
 *
 * Usage patterns:
 * - Domain-level cancellation: Call this mutation to update campaign status
 * - Full workflow cancellation: Call `cancelRootWorkflow` to stop all work items
 * - Both: Call this first for status update, then `cancelRootWorkflow` for cleanup
 */
export const cancelCampaignWorkflow = mutation({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:manage')

    // Get the campaign
    const campaign = await getCampaignByWorkflowId(ctx.db, args.workflowId)
    if (!campaign) {
      throw new Error('CAMPAIGN_NOT_FOUND')
    }

    // Update campaign status to cancelled
    await updateCampaign(ctx.db, campaign._id, { status: 'cancelled' })

    // Note: For full workflow cancellation (stopping work items), clients should
    // also call cancelRootWorkflow. Due to TypeScript type complexity with 25+
    // workflow tasks, internal mutation calls hit type inference limits (TS2589).
  },
})
