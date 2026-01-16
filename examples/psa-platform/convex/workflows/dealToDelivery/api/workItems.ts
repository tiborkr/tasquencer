/**
 * Work Items API
 *
 * Queries for discovering and viewing work items in the Deal to Delivery workflow.
 * These enable the work queue UI and task management features.
 *
 * Reference: .review/recipes/psa-platform/specs/26-api-endpoints.md
 * Pattern: examples/er/convex/workflows/er/api/workItems.ts
 */
import { v } from 'convex/values'
import { query } from '../../../_generated/server'

// TODO: Import these once implemented (PRIORITY 1 & 2)
// import { requirePsaStaffMember } from '../domain/services/authorizationService'
// import { mapWorkItemToResponse } from '../domain/services/workItemMappingService'
// import { DealToDeliveryWorkItemHelpers } from '../helpers'
// import { isHumanOffer } from '@repo/tasquencer'

/**
 * Gets all available work items for the current user.
 * Filters by user's roles and scopes.
 *
 * @returns Array of work items that the user can claim
 *
 * TODO: Full implementation requires:
 * - Schema for work item metadata table (PRIORITY 1.2)
 * - Authorization helpers (PRIORITY 2.3)
 * - Work item metadata helpers (PRIORITY 1.4)
 */
export const getMyAvailableTasks = query({
  args: {},
  handler: async (_ctx) => {
    // TODO: Implement once work item metadata table exists (PRIORITY 1.2)
    // const userId = await requirePsaStaffMember(ctx)
    // const items = await DealToDeliveryWorkItemHelpers.getAvailableWorkItemsForUser(ctx, userId)
    // return items.map((item) => mapWorkItemToResponse(item.metadata, item.workItem))

    // Stub: Return empty array until schema is implemented
    return []
  },
})

/**
 * Gets all work items claimed by the current user.
 *
 * @returns Array of work items that the user has claimed
 */
export const getMyClaimedTasks = query({
  args: {},
  handler: async (_ctx) => {
    // TODO: Implement once work item metadata table exists (PRIORITY 1.2)
    // const userId = await requirePsaStaffMember(ctx)
    // const items = await DealToDeliveryWorkItemHelpers.getClaimedWorkItemsByUser(ctx.db, userId)
    // return items.map((item) => mapWorkItemToResponse(item.metadata, item.workItem))

    // Stub: Return empty array until schema is implemented
    return []
  },
})

/**
 * Admin view: Gets ALL available work items across the system.
 * This bypasses role-based filtering for administrative dashboards.
 *
 * @returns Array of all active work items with group information
 */
export const getAllAvailableTasks = query({
  args: {},
  handler: async (_ctx) => {
    // TODO: Implement once work item metadata table exists (PRIORITY 1.2)
    // await requirePsaStaffMember(ctx)
    // const allMetadata = await ctx.db.query('dealToDeliveryWorkItems').collect()
    // ... filtering and mapping logic

    // Stub: Return empty array until schema is implemented
    return []
  },
})

/**
 * Gets all work items for a specific deal.
 *
 * @param args.dealId - The deal to get work items for
 * @returns Array of work items associated with the deal
 */
export const getTasksByDeal = query({
  args: { dealId: v.id('deals') },
  handler: async (_ctx, _args) => {
    // TODO: Implement once schema exists (PRIORITY 1.1)
    // await requirePsaStaffMember(ctx)
    // const allMetadata = await ctx.db
    //   .query('dealToDeliveryWorkItems')
    //   .withIndex('by_aggregateTableId', (q) => q.eq('aggregateTableId', args.dealId))
    //   .collect()
    // ...

    // Stub: Return empty array until schema is implemented
    return []
  },
})

/**
 * Gets detailed metadata for a specific work item.
 *
 * @param args.workItemId - The work item to get metadata for
 * @returns Work item metadata with status and authorization info
 */
export const getWorkItemMetadataByWorkItemId = query({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (ctx, args) => {
    // TODO: Implement once work item metadata table exists (PRIORITY 1.2)
    // await requirePsaStaffMember(ctx)
    // const metadata = await ctx.db
    //   .query('dealToDeliveryWorkItems')
    //   .withIndex('by_workItemId', (q) => q.eq('workItemId', args.workItemId))
    //   .first()
    // if (!metadata) return null
    // ...

    // For now, just return the core work item data
    const workItem = await ctx.db.get(args.workItemId)
    if (!workItem) return null

    return {
      workItemId: args.workItemId,
      workflowId: workItem.parent.workflowId,
      name: workItem.name,
      state: workItem.state,
      // Additional metadata will be added once schema is implemented
    }
  },
})
