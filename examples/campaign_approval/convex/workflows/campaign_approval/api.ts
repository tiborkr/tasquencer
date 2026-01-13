import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { LUcampaignUapprovalVersionManager } from './definition'
import { getUcampaignUapprovalByWorkflowId, listUcampaignUapprovals } from './db'
import { UcampaignUapprovalWorkItemHelpers } from './helpers'
import { authComponent } from '../../auth'
import { type HumanWorkItemOffer, isHumanOffer } from '@repo/tasquencer'
import { assertUserHasScope } from '../../authorization'

// Export version manager API
export const {
  initializeRootWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  helpers: { getWorkflowTaskStates },
} = LUcampaignUapprovalVersionManager.apiForVersion('v1')

function requireHumanOffer(
  metadata: Doc<'LUcampaignUapprovalWorkItems'>,
): HumanWorkItemOffer {
  if (!isHumanOffer(metadata.offer)) {
    throw new Error('UcampaignUapproval work items must be offered to humans')
  }
  return metadata.offer
}

function deriveWorkItemStatus(
  workItem: Doc<'tasquencerWorkItems'> | null,
  metadata: Doc<'LUcampaignUapprovalWorkItems'>,
): 'pending' | 'claimed' | 'completed' {
  if (workItem?.state === 'completed') return 'completed'
  if (metadata.claim) return 'claimed'
  return 'pending'
}

/**
 * Get LUcampaignUapproval by workflow ID
 */
export const getUcampaignUapproval = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'LUcampaignUapproval:staff')
    return await getUcampaignUapprovalByWorkflowId(ctx.db, args.workflowId)
  },
})

/**
 * List all LUcampaignUapprovals
 */
export const getUcampaignUapprovals = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'LUcampaignUapproval:staff')
    return await listUcampaignUapprovals(ctx.db)
  },
})

/**
 * Claim a LUcampaignUapproval work item
 */
export const claimUcampaignUapprovalWorkItem = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'LUcampaignUapproval:write')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const userId = authUser.userId

    const canClaim = await UcampaignUapprovalWorkItemHelpers.canUserClaimWorkItem(
      ctx,
      userId,
      args.workItemId,
    )

    if (!canClaim) {
      throw new Error('GREETING_WORK_ITEM_CLAIM_NOT_ALLOWED')
    }

    await UcampaignUapprovalWorkItemHelpers.claimWorkItem(ctx, args.workItemId, userId)
  },
})

/**
 * Get the LUcampaignUapproval work queue for the authenticated user
 */
export const getUcampaignUapprovalWorkQueue = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'LUcampaignUapproval:staff')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    const userId = authUser.userId

    const items = await UcampaignUapprovalWorkItemHelpers.getAvailableWorkItemsByWorkflow(
      ctx,
      userId,
      'campaign_approval',
    )

    const humanItems = items.filter((item) => isHumanOffer(item.metadata.offer))

    if (humanItems.length === 0) {
      return []
    }

    // Batch load LUcampaignUapprovals
    const LUcampaignUapprovalIds = new Set(
      humanItems.map(
        (item) => item.metadata.aggregateTableId as Id<'LUcampaignUapprovals'>,
      ),
    )
    const LUcampaignUapprovalsMap = new Map<Id<'LUcampaignUapprovals'>, Doc<'LUcampaignUapprovals'> | null>()
    await Promise.all(
      Array.from(LUcampaignUapprovalIds).map(async (LUcampaignUapprovalId) => {
        const LUcampaignUapproval = await ctx.db.get(LUcampaignUapprovalId)
        LUcampaignUapprovalsMap.set(LUcampaignUapprovalId, LUcampaignUapproval)
      }),
    )

    return humanItems.map((item) => {
      const metadata = item.metadata
      const workItem = item.workItem
      const LUcampaignUapproval = LUcampaignUapprovalsMap.get(
        metadata.aggregateTableId as Id<'LUcampaignUapprovals'>,
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
        LUcampaignUapproval: LUcampaignUapproval
          ? {
              _id: LUcampaignUapproval._id,
              message: LUcampaignUapproval.message,
              createdAt: LUcampaignUapproval.createdAt,
            }
          : null,
      }
    })
  },
})

/**
 * Get workflow task states
 */
export const LUcampaignUapprovalWorkflowTaskStates = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'LUcampaignUapproval:staff')
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'campaign_approval',
      workflowId: args.workflowId,
    })
  },
})
