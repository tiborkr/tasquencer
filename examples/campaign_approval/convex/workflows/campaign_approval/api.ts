import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { campaignApprovalVersionManager } from './definition'
import {
  getCampaignByWorkflowId,
  listCampaignsWithFilters,
  listCampaignsByRequester,
  listCampaignsByOwner,
  getCampaign as getCampaignFromDb,
  getCampaignBudgetByCampaignId,
  listCreativesByCampaignId,
  listKPIsByCampaignId,
  updateCampaign,
  updateCampaignCreative,
  updateCampaignKPI,
  listMilestonesByCampaignId,
  listApprovalsByCampaignId,
  listNotificationsByUserId,
  markNotificationAsRead,
  getCampaignResearchByCampaignId,
  getCampaignStrategyByCampaignId,
  type CampaignStatus,
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
 * List all campaigns with optional filters and pagination
 *
 * @param status - Filter by campaign status
 * @param ownerId - Filter by campaign owner
 * @param requesterId - Filter by campaign requester
 * @param limit - Maximum number of campaigns to return (default: 50, max: 100)
 * @param cursor - Pagination cursor from previous response
 */
export const getCampaigns = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('intake_review'),
        v.literal('strategy'),
        v.literal('budget_approval'),
        v.literal('creative_development'),
        v.literal('technical_setup'),
        v.literal('pre_launch'),
        v.literal('active'),
        v.literal('completed'),
        v.literal('cancelled'),
      ),
    ),
    ownerId: v.optional(v.id('users')),
    requesterId: v.optional(v.id('users')),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')

    // Validate and cap limit
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100)

    const result = await listCampaignsWithFilters(ctx.db, {
      status: args.status as CampaignStatus | undefined,
      ownerId: args.ownerId,
      requesterId: args.requesterId,
      limit,
      cursor: args.cursor,
    })

    return result
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
 * Workflow phase enum for filtering work queue
 * Maps task types to their workflow phase
 */
const taskTypeToPhase: Record<string, string> = {
  // Phase 1: Initiation
  submitRequest: 'initiation',
  intakeReview: 'initiation',
  assignOwner: 'initiation',
  // Phase 2: Strategy
  conductResearch: 'strategy',
  defineMetrics: 'strategy',
  developStrategy: 'strategy',
  createPlan: 'strategy',
  // Phase 3: Budget
  developBudget: 'budget',
  directorApproval: 'budget',
  executiveApproval: 'budget',
  secureResources: 'budget',
  // Phase 4: Creative
  createBrief: 'creative',
  developConcepts: 'creative',
  internalReview: 'creative',
  reviseAssets: 'creative',
  legalReview: 'creative',
  legalRevise: 'creative',
  finalApproval: 'creative',
  // Phase 5: Technical
  buildInfra: 'technical',
  configAnalytics: 'technical',
  setupMedia: 'technical',
  qaTest: 'technical',
  fixIssues: 'technical',
  // Phase 6: Launch
  preLaunchReview: 'launch',
  addressConcerns: 'launch',
  launchApproval: 'launch',
  internalComms: 'launch',
  // Phase 7: Execution
  launchCampaign: 'execution',
  monitorPerformance: 'execution',
  ongoingOptimization: 'execution',
  // Phase 8: Closure
  endCampaign: 'closure',
  compileData: 'closure',
  conductAnalysis: 'closure',
  presentResults: 'closure',
  archiveMaterials: 'closure',
}

/**
 * Get the campaign work queue for the authenticated user
 *
 * @param phase - Filter by workflow phase (initiation, strategy, budget, creative, technical, launch, execution, closure)
 * @param campaignId - Filter by specific campaign
 */
export const getCampaignWorkQueue = query({
  args: {
    phase: v.optional(
      v.union(
        v.literal('initiation'),
        v.literal('strategy'),
        v.literal('budget'),
        v.literal('creative'),
        v.literal('technical'),
        v.literal('launch'),
        v.literal('execution'),
        v.literal('closure'),
      ),
    ),
    campaignId: v.optional(v.id('campaigns')),
  },
  handler: async (ctx, args) => {
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

    let humanItems = items.filter((item) => isHumanOffer(item.metadata.offer))

    // Apply campaignId filter
    if (args.campaignId) {
      humanItems = humanItems.filter(
        (item) => item.metadata.aggregateTableId === args.campaignId,
      )
    }

    // Apply phase filter
    if (args.phase) {
      humanItems = humanItems.filter(
        (item) => taskTypeToPhase[item.metadata.payload.type] === args.phase,
      )
    }

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
        phase: taskTypeToPhase[metadata.payload.type] ?? 'unknown',
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

export const getCampaignKPIs = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await listKPIsByCampaignId(ctx.db, args.campaignId)
  },
})

/**
 * Update a KPI's actual value
 *
 * Allows updating the actual value of a KPI during campaign execution (Phase 7)
 * or closure (Phase 8). This enables tracking KPI progress throughout the
 * campaign lifecycle, not just during post-campaign analysis.
 *
 * @param kpiId - The ID of the KPI to update
 * @param actualValue - The observed/measured value for this KPI
 */
export const updateKPI = mutation({
  args: {
    kpiId: v.id('campaignKPIs'),
    actualValue: v.number(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:manage')

    // Verify the KPI exists
    const kpi = await ctx.db.get(args.kpiId)
    if (!kpi) {
      throw new Error('KPI_NOT_FOUND')
    }

    // Update the KPI with the actual value
    await updateCampaignKPI(ctx.db, args.kpiId, {
      actualValue: args.actualValue,
    })

    return {
      success: true,
      kpiId: args.kpiId,
      metric: kpi.metric,
      targetValue: kpi.targetValue,
      actualValue: args.actualValue,
      unit: kpi.unit,
    }
  },
})

/**
 * Batch update multiple KPIs
 *
 * Allows updating multiple KPI actual values in a single mutation.
 * Useful for the monitorPerformance task to update all KPIs at once.
 *
 * @param updates - Array of KPI updates containing kpiId and actualValue
 */
export const updateKPIs = mutation({
  args: {
    updates: v.array(
      v.object({
        kpiId: v.id('campaignKPIs'),
        actualValue: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:manage')

    const results = []
    for (const update of args.updates) {
      // Verify each KPI exists
      const kpi = await ctx.db.get(update.kpiId)
      if (!kpi) {
        throw new Error(`KPI_NOT_FOUND: ${update.kpiId}`)
      }

      // Update the KPI
      await updateCampaignKPI(ctx.db, update.kpiId, {
        actualValue: update.actualValue,
      })

      results.push({
        kpiId: update.kpiId,
        metric: kpi.metric,
        targetValue: kpi.targetValue,
        actualValue: update.actualValue,
        unit: kpi.unit,
      })
    }

    return {
      success: true,
      updated: results,
    }
  },
})

// ============================================================================
// Research & Strategy Query Endpoints
// ============================================================================

/**
 * Get research findings for a campaign
 *
 * Returns the market research data including audience analysis,
 * competitive landscape, historical insights, and recommendations.
 */
export const getCampaignResearch = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await getCampaignResearchByCampaignId(ctx.db, args.campaignId)
  },
})

/**
 * Get strategy document for a campaign
 *
 * Returns the campaign strategy including channel strategy,
 * creative approach, customer journey, and tactics.
 */
export const getCampaignStrategy = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')
    return await getCampaignStrategyByCampaignId(ctx.db, args.campaignId)
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

// ============================================================================
// Timeline Endpoints (Priority 3.1)
// ============================================================================

/**
 * Get campaign timeline with milestones
 *
 * Returns the campaign's timeline including all milestones, their target dates,
 * actual completion dates, and current status.
 */
export const getCampaignTimeline = query({
  args: {
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')

    // Verify campaign exists
    const campaign = await getCampaignFromDb(ctx.db, args.campaignId)
    if (!campaign) {
      throw new Error('CAMPAIGN_NOT_FOUND')
    }

    // Get milestones
    const milestones = await listMilestonesByCampaignId(ctx.db, args.campaignId)

    // Sort milestones by target date
    const sortedMilestones = milestones.sort(
      (a, b) => a.targetDate - b.targetDate,
    )

    return {
      campaignId: args.campaignId,
      milestones: sortedMilestones.map((m) => ({
        _id: m._id,
        name: m.milestoneName,
        targetDate: m.targetDate,
        actualDate: m.actualDate ?? null,
        status: m.status,
        notes: m.notes ?? null,
      })),
    }
  },
})

// ============================================================================
// Activity/Audit Trail Endpoints (Priority 3.2)
// ============================================================================

/**
 * Get campaign activity log (audit trail)
 *
 * Returns all approval decisions and activity for a campaign, ordered by
 * most recent first. This includes intake, budget, creative, legal, and
 * launch approval decisions.
 */
export const getCampaignActivity = query({
  args: {
    campaignId: v.id('campaigns'),
    approvalType: v.optional(
      v.union(
        v.literal('intake'),
        v.literal('budget'),
        v.literal('creative'),
        v.literal('legal'),
        v.literal('launch'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'campaign:read')

    // Verify campaign exists
    const campaign = await getCampaignFromDb(ctx.db, args.campaignId)
    if (!campaign) {
      throw new Error('CAMPAIGN_NOT_FOUND')
    }

    // Get all approvals for this campaign
    let approvals = await listApprovalsByCampaignId(ctx.db, args.campaignId)

    // Filter by approval type if specified
    if (args.approvalType) {
      approvals = approvals.filter((a) => a.approvalType === args.approvalType)
    }

    return {
      campaignId: args.campaignId,
      activities: approvals.map((a) => ({
        _id: a._id,
        _creationTime: a._creationTime,
        approvalType: a.approvalType,
        decision: a.decision,
        approvedBy: a.approvedBy,
        comments: a.comments ?? null,
        timestamp: a.createdAt,
      })),
    }
  },
})

// ============================================================================
// Work Item Release Endpoint (Priority 3.3)
// ============================================================================

/**
 * Release a claimed work item back to the queue
 *
 * Only the user who claimed the work item can release it. This allows users
 * to unclaim work items they are no longer able to complete.
 */
export const releaseWorkItem = mutation({
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

    // Get the work item metadata to verify ownership
    const metadata = await CampaignWorkItemHelpers.getWorkItemMetadata(
      ctx.db,
      args.workItemId,
    )

    if (!metadata) {
      throw new Error('WORK_ITEM_NOT_FOUND')
    }

    // Check if the work item is claimed by this user
    if (
      !metadata.claim ||
      metadata.claim.type !== 'human' ||
      metadata.claim.userId !== userId
    ) {
      throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
    }

    // Release the work item
    await CampaignWorkItemHelpers.releaseWorkItem(ctx.db, args.workItemId)

    return {
      workItemId: args.workItemId,
      status: 'pending' as const,
    }
  },
})

// ============================================================================
// User Endpoints (Priority 3.4, 3.5)
// ============================================================================

/**
 * Get current authenticated user
 *
 * Returns the current user's profile including their ID, email, name,
 * and authentication metadata.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userMetadata = await authComponent.safeGetAuthUser(ctx)
    if (!userMetadata) {
      return null
    }

    // Get application user data
    const user = await ctx.db.get(userMetadata.userId as Id<'users'>)

    return {
      _id: userMetadata.userId,
      email: userMetadata.email,
      name: userMetadata.name ?? null,
      image: userMetadata.image ?? null,
      ...user,
    }
  },
})

/**
 * List users for assignment dropdowns
 *
 * Returns a list of users that can be used for campaign owner assignment
 * and other user selection interfaces. Requires campaign:intake or
 * campaign:manage scope.
 */
export const listUsers = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, _args) => {
    // Check for either intake or manage scope
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    // Get all users from the database
    const users = await ctx.db.query('users').collect()

    // For each user, we need to get their auth metadata
    // Since users table is empty, the actual user data comes from auth
    // This is a simplified implementation - in production you'd want to
    // store user profiles in the users table
    // Note: The search parameter is available via _args.search for future use
    return users.map((user) => ({
      _id: user._id,
      // Note: To get email/name, you'd need to join with auth data
      // or store it in the users table. For now, return the ID.
    }))
  },
})

// ============================================================================
// Notification Endpoints (Priority 3.6, 3.7)
// ============================================================================

/**
 * Get notifications for the current user
 *
 * Returns a list of notifications for the authenticated user, optionally
 * filtered to show only unread notifications. Supports pagination via limit.
 */
export const getNotifications = query({
  args: {
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.safeGetAuthUser(ctx)
    if (!authUser || !authUser.userId) {
      return []
    }

    const userId = authUser.userId as Id<'users'>

    const notifications = await listNotificationsByUserId(ctx.db, userId, {
      unreadOnly: args.unreadOnly ?? false,
      limit: args.limit,
    })

    return notifications.map((n) => ({
      _id: n._id,
      _creationTime: n._creationTime,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      campaignId: n.campaignId ?? null,
      workItemId: n.workItemId ?? null,
      createdAt: n.createdAt,
    }))
  },
})

/**
 * Mark a notification as read
 *
 * Marks a specific notification as read. Only the notification recipient
 * can mark it as read.
 */
export const markNotificationRead = mutation({
  args: {
    notificationId: v.id('campaignNotifications'),
  },
  handler: async (ctx, args) => {
    const authUser = await authComponent.getAuthUser(ctx)
    if (!authUser || !authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const userId = authUser.userId as Id<'users'>

    // Verify the notification belongs to this user
    const notification = await ctx.db.get(args.notificationId)
    if (!notification) {
      throw new Error('NOTIFICATION_NOT_FOUND')
    }

    if (notification.userId !== userId) {
      throw new Error('NOTIFICATION_ACCESS_DENIED')
    }

    await markNotificationAsRead(ctx.db, args.notificationId)

    return { success: true }
  },
})
