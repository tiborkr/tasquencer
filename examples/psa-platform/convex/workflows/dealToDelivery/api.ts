import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { dealToDeliveryVersionManager } from './definition'
import {
  getDealByWorkflowId,
  getProjectByWorkflowId,
  listDealsByOrganization,
  listDealsByStage,
  listDealsByOwner,
  listProjectsByOrganization,
  listProjectsByStatus,
  listProjectsByManager,
  calculateProjectBudgetBurn,
  calculateUserUtilization,
} from './db'
import { DealToDeliveryWorkItemHelpers } from './helpers'
import { authComponent } from '../../auth'
import { type HumanWorkItemOffer, isHumanOffer } from '@repo/tasquencer'
import { assertUserHasScope } from '../../authorization'

// ============================================================================
// VERSION MANAGER API EXPORTS
// ============================================================================

export const {
  initializeRootWorkflow,
  initializeWorkItem,
  startWorkItem,
  completeWorkItem,
  failWorkItem,
  cancelWorkItem,
  helpers: { getWorkflowTaskStates },
} = dealToDeliveryVersionManager.apiForVersion('v1')

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function requireHumanOffer(
  metadata: Doc<'dealToDeliveryWorkItems'>,
): HumanWorkItemOffer {
  if (!isHumanOffer(metadata.offer)) {
    throw new Error('This work item must be offered to humans')
  }
  return metadata.offer
}

function deriveWorkItemStatus(
  workItem: Doc<'tasquencerWorkItems'> | null,
  metadata: Doc<'dealToDeliveryWorkItems'>,
): 'pending' | 'claimed' | 'completed' {
  if (workItem?.state === 'completed') return 'completed'
  if (metadata.claim) return 'claimed'
  return 'pending'
}

// ============================================================================
// DEAL QUERIES
// ============================================================================

/**
 * Get deal by workflow ID
 */
export const getDeal = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:deals:view:own')
    return await getDealByWorkflowId(ctx.db, args.workflowId)
  },
})

/**
 * List deals by organization
 */
export const getDeals = query({
  args: {
    organizationId: v.id('organizations'),
    stage: v.optional(
      v.union(
        v.literal('Lead'),
        v.literal('Qualified'),
        v.literal('Disqualified'),
        v.literal('Proposal'),
        v.literal('Negotiation'),
        v.literal('Won'),
        v.literal('Lost')
      )
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:deals:view:own')

    if (args.stage) {
      return await listDealsByStage(ctx.db, args.organizationId, args.stage)
    }
    return await listDealsByOrganization(ctx.db, args.organizationId)
  },
})

/**
 * List deals by owner
 */
export const getMyDeals = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'dealToDelivery:deals:view:own')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    return await listDealsByOwner(ctx.db, authUser.userId as Id<'users'>)
  },
})

// ============================================================================
// PROJECT QUERIES
// ============================================================================

/**
 * Get project by workflow ID
 */
export const getProject = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:projects:view:own')
    return await getProjectByWorkflowId(ctx.db, args.workflowId)
  },
})

/**
 * List projects by organization
 */
export const getProjects = query({
  args: {
    organizationId: v.id('organizations'),
    status: v.optional(
      v.union(
        v.literal('Planning'),
        v.literal('Active'),
        v.literal('OnHold'),
        v.literal('Completed'),
        v.literal('Archived')
      )
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:projects:view:own')

    if (args.status) {
      return await listProjectsByStatus(ctx.db, args.organizationId, args.status)
    }
    return await listProjectsByOrganization(ctx.db, args.organizationId)
  },
})

/**
 * List projects managed by current user
 */
export const getMyProjects = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'dealToDelivery:projects:view:own')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    return await listProjectsByManager(ctx.db, authUser.userId as Id<'users'>)
  },
})

// ============================================================================
// BUDGET & REPORTING QUERIES
// ============================================================================

/**
 * Get budget burn analysis for a project
 */
export const getBudgetBurn = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:budgets:view:own')
    return await calculateProjectBudgetBurn(ctx.db, args.projectId)
  },
})

/**
 * Get utilization for a user over a date range
 */
export const getUserUtilization = query({
  args: {
    userId: v.id('users'),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:view:own')
    return await calculateUserUtilization(
      ctx.db,
      args.userId,
      args.startDate,
      args.endDate
    )
  },
})

// ============================================================================
// WORK QUEUE OPERATIONS
// ============================================================================

/**
 * Claim a work item for the authenticated user
 */
export const claimWorkItem = mutation({
  args: {
    workItemId: v.id('tasquencerWorkItems'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:staff')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const userId = authUser.userId

    const canClaim = await DealToDeliveryWorkItemHelpers.canUserClaimWorkItem(
      ctx,
      userId,
      args.workItemId,
    )

    if (!canClaim) {
      throw new Error('WORK_ITEM_CLAIM_NOT_ALLOWED')
    }

    await DealToDeliveryWorkItemHelpers.claimWorkItem(ctx, args.workItemId, userId)
  },
})

/**
 * Get the work queue for the authenticated user
 * Returns all available work items across all workflow phases
 */
export const getWorkQueue = query({
  args: {},
  handler: async (ctx) => {
    await assertUserHasScope(ctx, 'dealToDelivery:staff')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    const userId = authUser.userId

    const items = await DealToDeliveryWorkItemHelpers.getAvailableWorkItemsByWorkflow(
      ctx,
      userId,
      'dealToDelivery',
    )

    const humanItems = items.filter((item) => isHumanOffer(item.metadata.offer))

    if (humanItems.length === 0) {
      return []
    }

    // Batch load deals
    const dealIds = new Set(
      humanItems.map(
        (item) => item.metadata.aggregateTableId as Id<'deals'>,
      ),
    )
    const dealsMap = new Map<Id<'deals'>, Doc<'deals'> | null>()
    await Promise.all(
      Array.from(dealIds).map(async (dealId) => {
        const deal = await ctx.db.get(dealId)
        dealsMap.set(dealId, deal)
      }),
    )

    return humanItems.map((item) => {
      const metadata = item.metadata
      const workItem = item.workItem
      const deal = dealsMap.get(metadata.aggregateTableId as Id<'deals'>)
      const offer = requireHumanOffer(metadata)

      return {
        _id: metadata._id,
        _creationTime: metadata._creationTime,
        workItemId: metadata.workItemId,
        taskName: metadata.payload.taskName,
        taskType: metadata.payload.type,
        status: deriveWorkItemStatus(workItem, metadata),
        requiredScope: offer.requiredScope ?? null,
        deal: deal
          ? {
              _id: deal._id,
              name: deal.name,
              value: deal.value,
              stage: deal.stage,
            }
          : null,
      }
    })
  },
})

/**
 * Get work queue filtered by work item type
 */
export const getWorkQueueByType = query({
  args: {
    workItemType: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:staff')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      return []
    }

    const userId = authUser.userId

    const items = await DealToDeliveryWorkItemHelpers.getAvailableWorkItemsByWorkflow(
      ctx,
      userId,
      'dealToDelivery',
    )

    const filteredItems = items.filter(
      (item) =>
        isHumanOffer(item.metadata.offer) &&
        item.metadata.payload.type === args.workItemType
    )

    if (filteredItems.length === 0) {
      return []
    }

    // Batch load deals
    const dealIds = new Set(
      filteredItems.map(
        (item) => item.metadata.aggregateTableId as Id<'deals'>,
      ),
    )
    const dealsMap = new Map<Id<'deals'>, Doc<'deals'> | null>()
    await Promise.all(
      Array.from(dealIds).map(async (dealId) => {
        const deal = await ctx.db.get(dealId)
        dealsMap.set(dealId, deal)
      }),
    )

    return filteredItems.map((item) => {
      const metadata = item.metadata
      const workItem = item.workItem
      const deal = dealsMap.get(metadata.aggregateTableId as Id<'deals'>)
      const offer = requireHumanOffer(metadata)

      return {
        _id: metadata._id,
        _creationTime: metadata._creationTime,
        workItemId: metadata.workItemId,
        taskName: metadata.payload.taskName,
        taskType: metadata.payload.type,
        status: deriveWorkItemStatus(workItem, metadata),
        requiredScope: offer.requiredScope ?? null,
        deal: deal
          ? {
              _id: deal._id,
              name: deal.name,
              value: deal.value,
              stage: deal.stage,
            }
          : null,
      }
    })
  },
})

// ============================================================================
// WORKFLOW STATE QUERIES
// ============================================================================

/**
 * Get workflow task states for a specific workflow
 */
export const getWorkflowStates = query({
  args: {
    workflowId: v.id('tasquencerWorkflows'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:staff')
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'dealToDelivery',
      workflowId: args.workflowId,
    })
  },
})
