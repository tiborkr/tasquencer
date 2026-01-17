/**
 * Work Items API
 *
 * Queries for discovering and viewing work items in the Deal to Delivery workflow.
 * These enable the work queue UI and task management features.
 *
 * TENET-AUTHZ: All queries are protected by scope-based authorization.
 * TENET-DOMAIN-BOUNDARY: Uses work item helpers for metadata access.
 *
 * Reference: .review/recipes/psa-platform/specs/26-api-endpoints.md
 * Pattern: examples/er/convex/workflows/er/api/workItems.ts
 */
import { v } from 'convex/values'
import { query } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { requirePsaStaffMember } from '../domain/services/authorizationService'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import { authComponent } from '../../../auth'
import { isHumanOffer, isHumanClaim } from '@repo/tasquencer'
import { getProject } from '../db/projects'

/**
 * Maps work item metadata to a standardized response format.
 */
function mapWorkItemToResponse(
  metadata: NonNullable<
    Awaited<
      ReturnType<typeof DealToDeliveryWorkItemHelpers.getWorkItemMetadata>
    >
  >,
  workItem: { state: string; name: string } | null,
  options: { includeGroupName?: boolean; includeWorkItemState?: boolean } = {},
) {
  const payload = metadata.payload as { type?: string; taskName?: string }
  const taskName = payload.taskName ?? workItem?.name ?? 'Task'
  const taskType = payload.type ?? 'unknown'

  const baseResponse = {
    _id: metadata._id,
    _creationTime: metadata._creationTime,
    workItemId: metadata.workItemId,
    aggregateTableId: metadata.aggregateTableId,
    taskName,
    taskType,
    status: deriveWorkItemStatus(workItem, metadata),
    requiredScope: isHumanOffer(metadata.offer)
      ? metadata.offer.requiredScope
      : undefined,
    requiredGroupId: isHumanOffer(metadata.offer)
      ? metadata.offer.requiredGroupId
      : undefined,
    claimedBy: isHumanClaim(metadata.claim) ? metadata.claim.userId : undefined,
    payload: metadata.payload,
  }

  return {
    ...baseResponse,
    ...(options.includeWorkItemState && { workItemState: workItem?.state }),
  }
}

/**
 * Derives work item status from state and claim.
 */
function deriveWorkItemStatus(
  workItem: { state: string } | null,
  metadata: { claim?: unknown },
): 'pending' | 'claimed' | 'completed' {
  if (workItem?.state === 'completed') return 'completed'
  if (metadata.claim) return 'claimed'
  return 'pending'
}

/**
 * Gets all available work items for the current user.
 * Filters by user's roles and scopes.
 *
 * @returns Array of work items that the user can claim
 */
export const getMyAvailableTasks = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser || !authUser.userId) {
      return []
    }

    await requirePsaStaffMember(ctx)

    const userId = authUser.userId as Id<'users'>
    const items =
      await DealToDeliveryWorkItemHelpers.getAvailableWorkItemsForUser(
        ctx,
        userId,
      )

    return items.map((item) =>
      mapWorkItemToResponse(item.metadata, item.workItem),
    )
  },
})

/**
 * Gets all work items claimed by the current user.
 *
 * @returns Array of work items that the user has claimed
 */
export const getMyClaimedTasks = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser || !authUser.userId) {
      return []
    }

    await requirePsaStaffMember(ctx)

    const userId = authUser.userId as Id<'users'>

    // Query work items where the claim has this userId
    const allMetadata = await ctx.db
      .query('dealToDeliveryWorkItems')
      .collect()

    // Filter for claimed by this user and load work items
    const claimedItems = allMetadata.filter(
      (m) => isHumanClaim(m.claim) && m.claim.userId === userId,
    )

    const workItems = await Promise.all(
      claimedItems.map((m) => ctx.db.get(m.workItemId)),
    )

    // Filter for active (not completed/failed/canceled)
    const activeItems = claimedItems
      .map((metadata, idx) => ({ metadata, workItem: workItems[idx] }))
      .filter(
        ({ workItem }) =>
          workItem?.state === 'initialized' || workItem?.state === 'started',
      )

    return activeItems.map(({ metadata, workItem }) =>
      mapWorkItemToResponse(metadata, workItem, { includeWorkItemState: true }),
    )
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
  handler: async (ctx) => {
    await requirePsaStaffMember(ctx)

    const allMetadata = await ctx.db
      .query('dealToDeliveryWorkItems')
      .collect()

    // Load all work items in parallel
    const workItems = await Promise.all(
      allMetadata.map((metadata) => ctx.db.get(metadata.workItemId)),
    )

    // Filter active work items with human offers
    const activeItems = allMetadata
      .map((metadata, idx) => ({ metadata, workItem: workItems[idx] }))
      .filter(
        ({ workItem }) =>
          workItem?.state === 'initialized' || workItem?.state === 'started',
      )
      .filter(({ metadata }) => isHumanOffer(metadata.offer))

    return activeItems.map(({ metadata, workItem }) =>
      mapWorkItemToResponse(metadata, workItem, {
        includeWorkItemState: true,
      }),
    )
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
  handler: async (ctx, args) => {
    await requirePsaStaffMember(ctx)

    const allMetadata = await ctx.db
      .query('dealToDeliveryWorkItems')
      .withIndex('by_aggregateTableId', (q) =>
        q.eq('aggregateTableId', args.dealId),
      )
      .collect()

    // Load work items
    const workItems = await Promise.all(
      allMetadata.map((m) => ctx.db.get(m.workItemId)),
    )

    // Filter human-offered items
    const humanItems = allMetadata
      .map((metadata, idx) => ({ metadata, workItem: workItems[idx] }))
      .filter(({ metadata }) => isHumanOffer(metadata.offer))

    return humanItems.map(({ metadata, workItem }) =>
      mapWorkItemToResponse(metadata, workItem, { includeWorkItemState: true }),
    )
  },
})

/**
 * Gets all work items for a specific project.
 * Since work items are keyed by deal, this first looks up the project's deal.
 *
 * @param args.projectId - The project to get work items for
 * @returns Array of work items associated with the project (via its source deal)
 */
export const getTasksByProject = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    await requirePsaStaffMember(ctx)

    // Projects are linked to deals; work items are keyed by deal
    const project = await getProject(ctx.db, args.projectId)
    if (!project || !project.dealId) {
      return []
    }

    const dealId = project.dealId
    const allMetadata = await ctx.db
      .query('dealToDeliveryWorkItems')
      .withIndex('by_aggregateTableId', (q) =>
        q.eq('aggregateTableId', dealId),
      )
      .collect()

    // Load work items
    const workItems = await Promise.all(
      allMetadata.map((m) => ctx.db.get(m.workItemId)),
    )

    // Filter human-offered items
    const humanItems = allMetadata
      .map((metadata, idx) => ({ metadata, workItem: workItems[idx] }))
      .filter(({ metadata }) => isHumanOffer(metadata.offer))

    return humanItems.map(({ metadata, workItem }) =>
      mapWorkItemToResponse(metadata, workItem, { includeWorkItemState: true }),
    )
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
    await requirePsaStaffMember(ctx)

    const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
      ctx.db,
      args.workItemId,
    )
    if (!metadata) return null

    const workItem = await ctx.db.get(args.workItemId)

    return mapWorkItemToResponse(metadata, workItem, {
      includeWorkItemState: true,
    })
  },
})
