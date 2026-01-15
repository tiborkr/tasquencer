import { v } from 'convex/values'
import { mutation, query } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { dealToDeliveryVersionManager } from './definition'
import * as db from './db'
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

// ============================================================================
// DEAL MUTATIONS
// ============================================================================

/**
 * Create a new deal
 */
export const createDeal = mutation({
  args: {
    organizationId: v.id('organizations'),
    companyId: v.id('companies'),
    contactId: v.id('contacts'),
    name: v.string(),
    value: v.number(),
    ownerId: v.id('users'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:deals:create')

    const dealId = await db.insertDeal(ctx.db, {
      organizationId: args.organizationId,
      companyId: args.companyId,
      contactId: args.contactId,
      name: args.name,
      value: args.value,
      ownerId: args.ownerId,
      stage: 'Lead',
      probability: 10,
      createdAt: Date.now(),
    })

    return { dealId }
  },
})

/**
 * Update a deal
 */
export const updateDealDetails = mutation({
  args: {
    dealId: v.id('deals'),
    updates: v.object({
      name: v.optional(v.string()),
      value: v.optional(v.number()),
      ownerId: v.optional(v.id('users')),
    }),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:deals:edit:own')

    await db.updateDeal(ctx.db, args.dealId, args.updates)

    return { success: true }
  },
})

/**
 * Update deal stage with automatic probability adjustment
 */
export const updateDealStage = mutation({
  args: {
    dealId: v.id('deals'),
    stage: v.union(
      v.literal('Lead'),
      v.literal('Qualified'),
      v.literal('Disqualified'),
      v.literal('Proposal'),
      v.literal('Negotiation'),
      v.literal('Won'),
      v.literal('Lost')
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:deals:edit:own')

    // Determine probability based on stage
    const stageProbabilities: Record<string, number> = {
      Lead: 10,
      Qualified: 25,
      Disqualified: 0,
      Proposal: 50,
      Negotiation: 75,
      Won: 100,
      Lost: 0,
    }

    const newProbability = stageProbabilities[args.stage] ?? 0

    const updates: Parameters<typeof db.updateDeal>[2] = {
      stage: args.stage,
      probability: newProbability,
    }

    // Set closure fields for Won/Lost
    if (args.stage === 'Won' || args.stage === 'Lost') {
      updates.closedAt = Date.now()
      if (args.stage === 'Lost' && args.reason) {
        updates.lostReason = args.reason
      }
    }

    await db.updateDeal(ctx.db, args.dealId, updates)

    return { success: true, newProbability }
  },
})

// ============================================================================
// ESTIMATE ENDPOINTS
// ============================================================================

/**
 * Create an estimate for a deal
 */
export const createEstimate = mutation({
  args: {
    dealId: v.id('deals'),
    services: v.array(
      v.object({
        name: v.string(),
        rate: v.number(),
        hours: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:estimates:create')

    const deal = await db.getDeal(ctx.db, args.dealId)
    if (!deal) {
      throw new Error('DEAL_NOT_FOUND')
    }

    // Calculate total
    const total = args.services.reduce(
      (sum, s) => sum + s.rate * s.hours,
      0
    )

    // Create estimate
    const estimateId = await db.insertEstimate(ctx.db, {
      organizationId: deal.organizationId,
      dealId: args.dealId,
      total,
      createdAt: Date.now(),
    })

    // Create services
    for (const service of args.services) {
      await db.insertEstimateService(ctx.db, {
        estimateId,
        name: service.name,
        rate: service.rate,
        hours: service.hours,
        total: service.rate * service.hours,
      })
    }

    return { estimateId, total }
  },
})

/**
 * Get an estimate with services
 */
export const getEstimateWithServices = query({
  args: {
    estimateId: v.id('estimates'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:estimates:view')

    const estimate = await db.getEstimate(ctx.db, args.estimateId)
    if (!estimate) {
      return null
    }

    const services = await db.listEstimateServicesByEstimate(ctx.db, args.estimateId)

    return { ...estimate, services }
  },
})

// ============================================================================
// PROPOSAL ENDPOINTS
// ============================================================================

/**
 * Create a proposal
 */
export const createProposal = mutation({
  args: {
    dealId: v.id('deals'),
    documentUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:proposals:create')

    const deal = await db.getDeal(ctx.db, args.dealId)
    if (!deal) {
      throw new Error('DEAL_NOT_FOUND')
    }

    // Get version number
    const existingProposals = await db.listProposalsByDeal(ctx.db, args.dealId)
    const version = existingProposals.length + 1

    const proposalId = await db.insertProposal(ctx.db, {
      organizationId: deal.organizationId,
      dealId: args.dealId,
      version,
      status: 'Draft',
      documentUrl: args.documentUrl,
      createdAt: Date.now(),
    })

    return { proposalId }
  },
})

/**
 * Update proposal status
 */
export const updateProposalStatus = mutation({
  args: {
    proposalId: v.id('proposals'),
    status: v.union(
      v.literal('Draft'),
      v.literal('Sent'),
      v.literal('Viewed'),
      v.literal('Signed'),
      v.literal('Rejected')
    ),
  },
  handler: async (ctx, args) => {
    // Different scopes for different status transitions
    if (args.status === 'Sent') {
      await assertUserHasScope(ctx, 'dealToDelivery:proposals:send')
    } else if (args.status === 'Signed') {
      await assertUserHasScope(ctx, 'dealToDelivery:proposals:sign')
    } else {
      await assertUserHasScope(ctx, 'dealToDelivery:proposals:create')
    }

    const updates: Parameters<typeof db.updateProposal>[2] = {
      status: args.status,
    }

    if (args.status === 'Sent') {
      updates.sentAt = Date.now()
    } else if (args.status === 'Viewed') {
      updates.viewedAt = Date.now()
    } else if (args.status === 'Signed') {
      updates.signedAt = Date.now()
    } else if (args.status === 'Rejected') {
      updates.rejectedAt = Date.now()
    }

    await db.updateProposal(ctx.db, args.proposalId, updates)

    return { success: true }
  },
})

// ============================================================================
// PROJECT MUTATIONS
// ============================================================================

/**
 * Create project from a won deal
 */
export const createProjectFromDeal = mutation({
  args: {
    dealId: v.id('deals'),
    managerId: v.id('users'),
    startDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:projects:create')

    const deal = await db.getDeal(ctx.db, args.dealId)
    if (!deal) {
      throw new Error('DEAL_NOT_FOUND')
    }

    if (deal.stage !== 'Won') {
      throw new Error('DEAL_NOT_WON')
    }

    // Create project
    const projectId = await db.insertProject(ctx.db, {
      organizationId: deal.organizationId,
      companyId: deal.companyId,
      dealId: args.dealId,
      name: deal.name,
      status: 'Planning',
      startDate: args.startDate ?? Date.now(),
      managerId: args.managerId,
      createdAt: Date.now(),
    })

    // Get estimate for budget creation
    const estimate = await db.getEstimateByDeal(ctx.db, args.dealId)

    // Create budget
    const budgetId = await db.insertBudget(ctx.db, {
      organizationId: deal.organizationId,
      projectId,
      type: 'TimeAndMaterials',
      totalAmount: estimate?.total ?? deal.value,
      createdAt: Date.now(),
    })

    // Link budget to project
    await db.updateProject(ctx.db, projectId, { budgetId })

    // Create services from estimate if available
    if (estimate) {
      const estimateServices = await db.listEstimateServicesByEstimate(
        ctx.db,
        estimate._id
      )
      for (const estService of estimateServices) {
        await db.insertService(ctx.db, {
          organizationId: deal.organizationId,
          budgetId,
          name: estService.name,
          rate: estService.rate,
          estimatedHours: estService.hours,
          totalAmount: estService.total,
        })
      }
    }

    return { projectId, budgetId }
  },
})

/**
 * Update project details
 */
export const updateProjectDetails = mutation({
  args: {
    projectId: v.id('projects'),
    updates: v.object({
      name: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal('Planning'),
          v.literal('Active'),
          v.literal('OnHold'),
          v.literal('Completed'),
          v.literal('Archived')
        )
      ),
      managerId: v.optional(v.id('users')),
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:projects:edit:own')

    await db.updateProject(ctx.db, args.projectId, args.updates)

    return { success: true }
  },
})

/**
 * Close a project
 */
export const closeProject = mutation({
  args: {
    projectId: v.id('projects'),
    closeDate: v.number(),
    completionStatus: v.union(v.literal('completed'), v.literal('cancelled')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:projects:close')

    const project = await db.getProject(ctx.db, args.projectId)
    if (!project) {
      throw new Error('PROJECT_NOT_FOUND')
    }

    // Calculate final metrics
    const burnMetrics = await calculateProjectBudgetBurn(ctx.db, args.projectId)

    await db.updateProject(ctx.db, args.projectId, {
      status: args.completionStatus === 'completed' ? 'Completed' : 'Archived',
      endDate: args.closeDate,
    })

    return {
      closed: true,
      metrics: {
        totalCost: burnMetrics.totalCost,
        budgetAmount: burnMetrics.budgetAmount,
        burnRate: burnMetrics.burnRate,
        remaining: burnMetrics.remaining,
      },
    }
  },
})

// ============================================================================
// BUDGET ENDPOINTS
// ============================================================================

/**
 * Get project budget with services
 */
export const getProjectBudget = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:budgets:view:own')

    const budget = await db.getBudgetByProject(ctx.db, args.projectId)
    if (!budget) {
      return null
    }

    const services = await db.listServicesByBudget(ctx.db, budget._id)
    const milestones = await db.listMilestonesByProject(ctx.db, args.projectId)
    const burnMetrics = await calculateProjectBudgetBurn(ctx.db, args.projectId)

    return {
      ...budget,
      services,
      milestones,
      burnRate: burnMetrics.burnRate,
      totalCost: burnMetrics.totalCost,
      remaining: burnMetrics.remaining,
    }
  },
})

/**
 * Update budget
 */
export const updateBudgetDetails = mutation({
  args: {
    budgetId: v.id('budgets'),
    type: v.optional(
      v.union(
        v.literal('TimeAndMaterials'),
        v.literal('FixedFee'),
        v.literal('Retainer')
      )
    ),
    totalAmount: v.optional(v.number()),
    services: v.optional(
      v.array(
        v.object({
          name: v.string(),
          rate: v.number(),
          estimatedHours: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:budgets:create')

    const budget = await db.getBudget(ctx.db, args.budgetId)
    if (!budget) {
      throw new Error('BUDGET_NOT_FOUND')
    }

    // Update budget fields
    const updates: Parameters<typeof db.updateBudget>[2] = {}
    if (args.type) updates.type = args.type

    let totalAmount = args.totalAmount

    // Replace services if provided
    if (args.services) {
      // Delete existing services
      const existingServices = await db.listServicesByBudget(ctx.db, args.budgetId)
      for (const service of existingServices) {
        await db.deleteService(ctx.db, service._id)
      }

      // Create new services
      totalAmount = 0
      for (const service of args.services) {
        const serviceTotal = service.rate * service.estimatedHours
        await db.insertService(ctx.db, {
          organizationId: budget.organizationId,
          budgetId: args.budgetId,
          name: service.name,
          rate: service.rate,
          estimatedHours: service.estimatedHours,
          totalAmount: serviceTotal,
        })
        totalAmount += serviceTotal
      }
    }

    if (totalAmount !== undefined) {
      updates.totalAmount = totalAmount
    }

    await db.updateBudget(ctx.db, args.budgetId, updates)

    return { success: true, totalAmount: totalAmount ?? budget.totalAmount }
  },
})

// ============================================================================
// TASK ENDPOINTS
// ============================================================================

/**
 * List tasks for a project
 */
export const listTasks = query({
  args: {
    projectId: v.id('projects'),
    status: v.optional(
      v.array(
        v.union(
          v.literal('Todo'),
          v.literal('InProgress'),
          v.literal('Review'),
          v.literal('Done')
        )
      )
    ),
    assigneeId: v.optional(v.id('users')),
    parentTaskId: v.optional(v.id('tasks')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:tasks:view:own')

    let tasks = await db.listTasksByProject(ctx.db, args.projectId)

    // Filter by status
    if (args.status && args.status.length > 0) {
      tasks = tasks.filter((t) => args.status!.includes(t.status))
    }

    // Filter by assignee
    if (args.assigneeId) {
      tasks = tasks.filter((t) => t.assigneeIds.includes(args.assigneeId!))
    }

    // Filter by parent
    if (args.parentTaskId !== undefined) {
      tasks = tasks.filter((t) => t.parentTaskId === args.parentTaskId)
    }

    return tasks
  },
})

/**
 * Create a task
 */
export const createTask = mutation({
  args: {
    projectId: v.id('projects'),
    name: v.string(),
    description: v.string(),
    assigneeIds: v.optional(v.array(v.id('users'))),
    dueDate: v.optional(v.number()),
    estimatedHours: v.optional(v.number()),
    priority: v.optional(
      v.union(
        v.literal('Low'),
        v.literal('Medium'),
        v.literal('High'),
        v.literal('Urgent')
      )
    ),
    parentTaskId: v.optional(v.id('tasks')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:tasks:create')

    const project = await db.getProject(ctx.db, args.projectId)
    if (!project) {
      throw new Error('PROJECT_NOT_FOUND')
    }

    // Get sort order
    const existingTasks = await db.listTasksByProject(ctx.db, args.projectId)
    const sortOrder = existingTasks.length

    const taskId = await db.insertTask(ctx.db, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      status: 'Todo',
      priority: args.priority ?? 'Medium',
      assigneeIds: args.assigneeIds ?? [],
      dependencies: [],
      sortOrder,
      dueDate: args.dueDate,
      estimatedHours: args.estimatedHours,
      parentTaskId: args.parentTaskId,
      createdAt: Date.now(),
    })

    return { taskId }
  },
})

/**
 * Update a task
 */
export const updateTaskDetails = mutation({
  args: {
    taskId: v.id('tasks'),
    updates: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      status: v.optional(
        v.union(
          v.literal('Todo'),
          v.literal('InProgress'),
          v.literal('Review'),
          v.literal('Done')
        )
      ),
      priority: v.optional(
        v.union(
          v.literal('Low'),
          v.literal('Medium'),
          v.literal('High'),
          v.literal('Urgent')
        )
      ),
      assigneeIds: v.optional(v.array(v.id('users'))),
      dueDate: v.optional(v.number()),
      estimatedHours: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:tasks:edit:own')

    await db.updateTask(ctx.db, args.taskId, args.updates)

    return { success: true }
  },
})

// ============================================================================
// RESOURCE PLANNING ENDPOINTS
// ============================================================================

/**
 * Get team availability
 */
export const getTeamAvailability = query({
  args: {
    organizationId: v.id('organizations'),
    startDate: v.number(),
    endDate: v.number(),
    skills: v.optional(v.array(v.string())),
    roles: v.optional(v.array(v.string())),
    departments: v.optional(v.array(v.string())),
    onlyAvailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:view:team')

    let users = await db.listActiveUsers(ctx.db, args.organizationId)

    // Filter by skills
    if (args.skills && args.skills.length > 0) {
      users = users.filter((u) =>
        args.skills!.some((skill) => u.skills?.includes(skill))
      )
    }

    // Filter by roles
    if (args.roles && args.roles.length > 0) {
      users = users.filter((u) => u.role && args.roles!.includes(u.role))
    }

    // Filter by departments
    if (args.departments && args.departments.length > 0) {
      users = users.filter((u) =>
        u.department ? args.departments!.includes(u.department) : false
      )
    }

    const people = await Promise.all(
      users.map(async (user) => {
        const utilization = await calculateUserUtilization(
          ctx.db,
          user._id,
          args.startDate,
          args.endDate
        )

        return {
          id: user._id,
          name: user.name ?? '',
          role: user.role ?? '',
          skills: user.skills ?? [],
          utilization: utilization.utilizationPercent,
          bookedHours: utilization.bookedHours,
          availableHours: utilization.availableHours,
        }
      })
    )

    // Filter by availability
    if (args.onlyAvailable) {
      return { people: people.filter((p) => p.utilization < 100) }
    }

    return { people }
  },
})

/**
 * Get user bookings
 */
export const getUserBookings = query({
  args: {
    userId: v.id('users'),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:view:own')

    let bookings = await db.listBookingsByUser(ctx.db, args.userId)

    // Filter by date range
    if (args.startDate && args.endDate) {
      bookings = bookings.filter(
        (b) => b.endDate >= args.startDate! && b.startDate <= args.endDate!
      )
    }

    return bookings
  },
})

/**
 * Create a booking
 */
export const createBooking = mutation({
  args: {
    userId: v.id('users'),
    projectId: v.optional(v.id('projects')),
    taskId: v.optional(v.id('tasks')),
    startDate: v.number(),
    endDate: v.number(),
    hoursPerDay: v.number(),
    type: v.union(
      v.literal('Tentative'),
      v.literal('Confirmed'),
      v.literal('TimeOff')
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:book:team')

    const user = await db.getUser(ctx.db, args.userId)
    if (!user) {
      throw new Error('USER_NOT_FOUND')
    }

    if (!user.organizationId) {
      throw new Error('USER_HAS_NO_ORGANIZATION')
    }

    // Validate projectId for non-TimeOff bookings
    if (args.type !== 'TimeOff' && !args.projectId) {
      throw new Error('PROJECT_REQUIRED_FOR_BOOKING')
    }

    const bookingId = await db.insertBooking(ctx.db, {
      organizationId: user.organizationId,
      userId: args.userId,
      projectId: args.projectId,
      taskId: args.taskId,
      startDate: args.startDate,
      endDate: args.endDate,
      hoursPerDay: args.hoursPerDay,
      type: args.type,
      notes: args.notes,
      createdAt: Date.now(),
    })

    return { bookingId }
  },
})

/**
 * Update a booking
 */
export const updateBookingDetails = mutation({
  args: {
    bookingId: v.id('bookings'),
    updates: v.object({
      startDate: v.optional(v.number()),
      endDate: v.optional(v.number()),
      hoursPerDay: v.optional(v.number()),
      type: v.optional(
        v.union(
          v.literal('Tentative'),
          v.literal('Confirmed'),
          v.literal('TimeOff')
        )
      ),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:book:team')

    await db.updateBooking(ctx.db, args.bookingId, args.updates)

    return { success: true }
  },
})

/**
 * Confirm multiple bookings
 */
export const confirmBookings = mutation({
  args: {
    bookingIds: v.array(v.id('bookings')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:confirm')

    let confirmedCount = 0
    for (const bookingId of args.bookingIds) {
      const booking = await db.getBooking(ctx.db, bookingId)
      if (booking && booking.type === 'Tentative') {
        await db.updateBooking(ctx.db, bookingId, { type: 'Confirmed' })
        confirmedCount++
      }
    }

    return { confirmedCount }
  },
})

/**
 * Delete a booking
 */
export const deleteBookingMutation = mutation({
  args: {
    bookingId: v.id('bookings'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:resources:book:team')

    await db.deleteBooking(ctx.db, args.bookingId)

    return { success: true }
  },
})

// ============================================================================
// TIME TRACKING ENDPOINTS
// ============================================================================

/**
 * Get timesheet data for a user and week
 */
export const getTimesheet = query({
  args: {
    userId: v.id('users'),
    weekStart: v.number(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:view:own')

    const weekEnd = args.weekStart + 7 * 24 * 60 * 60 * 1000

    const entries = await db.listTimeEntriesByUserAndDateRange(
      ctx.db,
      args.userId,
      args.weekStart,
      weekEnd
    )

    // Calculate summary
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = entries
      .filter((e) => e.billable)
      .reduce((sum, e) => sum + e.hours, 0)

    const byStatus = {
      draft: entries.filter((e) => e.status === 'Draft').length,
      submitted: entries.filter((e) => e.status === 'Submitted').length,
      approved: entries.filter((e) => e.status === 'Approved').length,
      rejected: entries.filter((e) => e.status === 'Rejected').length,
    }

    return {
      entries,
      summary: { totalHours, billableHours, byStatus },
    }
  },
})

/**
 * Get time entries for a project
 */
export const getProjectTimeEntries = query({
  args: {
    projectId: v.id('projects'),
    userId: v.optional(v.id('users')),
    status: v.optional(
      v.array(
        v.union(
          v.literal('Draft'),
          v.literal('Submitted'),
          v.literal('Approved'),
          v.literal('Rejected'),
          v.literal('Locked')
        )
      )
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:view:team')

    let entries = await db.listTimeEntriesByProject(ctx.db, args.projectId)

    if (args.userId) {
      entries = entries.filter((e) => e.userId === args.userId)
    }

    if (args.status && args.status.length > 0) {
      entries = entries.filter((e) => args.status!.includes(e.status))
    }

    if (args.startDate && args.endDate) {
      entries = entries.filter(
        (e) => e.date >= args.startDate! && e.date <= args.endDate!
      )
    }

    return entries
  },
})

/**
 * Create a time entry
 */
export const createTimeEntry = mutation({
  args: {
    projectId: v.id('projects'),
    taskId: v.optional(v.id('tasks')),
    serviceId: v.optional(v.id('services')),
    date: v.number(),
    hours: v.number(),
    billable: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:create:own')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const project = await db.getProject(ctx.db, args.projectId)
    if (!project) {
      throw new Error('PROJECT_NOT_FOUND')
    }

    const timeEntryId = await db.insertTimeEntry(ctx.db, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: authUser.userId as Id<'users'>,
      taskId: args.taskId,
      serviceId: args.serviceId,
      date: args.date,
      hours: args.hours,
      billable: args.billable,
      notes: args.notes,
      status: 'Draft',
      createdAt: Date.now(),
    })

    return { timeEntryId }
  },
})

/**
 * Update a time entry
 */
export const updateTimeEntryDetails = mutation({
  args: {
    timeEntryId: v.id('timeEntries'),
    updates: v.object({
      taskId: v.optional(v.id('tasks')),
      serviceId: v.optional(v.id('services')),
      date: v.optional(v.number()),
      hours: v.optional(v.number()),
      billable: v.optional(v.boolean()),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:edit:own')

    const entry = await db.getTimeEntry(ctx.db, args.timeEntryId)
    if (!entry) {
      throw new Error('TIME_ENTRY_NOT_FOUND')
    }

    if (entry.status !== 'Draft' && entry.status !== 'Rejected') {
      throw new Error('CANNOT_EDIT_SUBMITTED_ENTRY')
    }

    await db.updateTimeEntry(ctx.db, args.timeEntryId, args.updates)

    return { success: true }
  },
})

/**
 * Submit a time entry
 */
export const submitTimeEntryMutation = mutation({
  args: {
    timeEntryId: v.id('timeEntries'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:submit')

    const entry = await db.getTimeEntry(ctx.db, args.timeEntryId)
    if (!entry) {
      throw new Error('TIME_ENTRY_NOT_FOUND')
    }

    if (entry.status !== 'Draft' && entry.status !== 'Rejected') {
      throw new Error('CANNOT_SUBMIT_ENTRY')
    }

    await db.updateTimeEntry(ctx.db, args.timeEntryId, {
      status: 'Submitted',
    })

    return { submitted: true }
  },
})

/**
 * Approve time entries
 */
export const approveTimesheet = mutation({
  args: {
    timeEntryIds: v.array(v.id('timeEntries')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:approve')
    const authUser = await authComponent.getAuthUser(ctx)

    let approvedCount = 0
    for (const entryId of args.timeEntryIds) {
      const entry = await db.getTimeEntry(ctx.db, entryId)
      if (entry && entry.status === 'Submitted') {
        await db.updateTimeEntry(ctx.db, entryId, {
          status: 'Approved',
          approvedAt: Date.now(),
          approvedBy: authUser.userId as Id<'users'>,
        })
        approvedCount++
      }
    }

    return { approvedCount }
  },
})

/**
 * Reject time entries
 */
export const rejectTimesheet = mutation({
  args: {
    timeEntryIds: v.array(v.id('timeEntries')),
    comments: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:time:approve')

    let rejectedCount = 0
    for (const entryId of args.timeEntryIds) {
      const entry = await db.getTimeEntry(ctx.db, entryId)
      if (entry && entry.status === 'Submitted') {
        await db.updateTimeEntry(ctx.db, entryId, {
          status: 'Rejected',
          rejectionComments: args.comments,
        })
        rejectedCount++
      }
    }

    return { rejectedCount }
  },
})

// ============================================================================
// EXPENSE ENDPOINTS
// ============================================================================

/**
 * List expenses
 */
export const listExpenses = query({
  args: {
    projectId: v.optional(v.id('projects')),
    userId: v.optional(v.id('users')),
    status: v.optional(
      v.array(
        v.union(
          v.literal('Draft'),
          v.literal('Submitted'),
          v.literal('Approved'),
          v.literal('Rejected')
        )
      )
    ),
    type: v.optional(
      v.array(
        v.union(
          v.literal('Software'),
          v.literal('Travel'),
          v.literal('Materials'),
          v.literal('Subcontractor'),
          v.literal('Other')
        )
      )
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:expenses:view:own')

    let expenses: Doc<'expenses'>[] = []

    if (args.projectId) {
      expenses = await db.listExpensesByProject(ctx.db, args.projectId)
    } else if (args.userId) {
      expenses = await db.listExpensesByUser(ctx.db, args.userId)
    } else {
      // Need either projectId or userId
      return []
    }

    if (args.status && args.status.length > 0) {
      expenses = expenses.filter((e) => args.status!.includes(e.status))
    }

    if (args.type && args.type.length > 0) {
      expenses = expenses.filter((e) => args.type!.includes(e.type))
    }

    if (args.startDate && args.endDate) {
      expenses = expenses.filter(
        (e) => e.date >= args.startDate! && e.date <= args.endDate!
      )
    }

    return expenses
  },
})

/**
 * Create an expense
 */
export const createExpense = mutation({
  args: {
    projectId: v.id('projects'),
    type: v.union(
      v.literal('Software'),
      v.literal('Travel'),
      v.literal('Materials'),
      v.literal('Subcontractor'),
      v.literal('Other')
    ),
    description: v.string(),
    amount: v.number(),
    currency: v.string(),
    date: v.number(),
    receiptUrl: v.optional(v.string()),
    billable: v.boolean(),
    markupRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:expenses:create')
    const authUser = await authComponent.getAuthUser(ctx)

    if (!authUser.userId) {
      throw new Error('USER_NOT_AUTHENTICATED')
    }

    const project = await db.getProject(ctx.db, args.projectId)
    if (!project) {
      throw new Error('PROJECT_NOT_FOUND')
    }

    const expenseId = await db.insertExpense(ctx.db, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: authUser.userId as Id<'users'>,
      type: args.type,
      description: args.description,
      amount: args.amount,
      currency: args.currency,
      date: args.date,
      receiptUrl: args.receiptUrl,
      billable: args.billable,
      markupRate: args.markupRate,
      status: 'Draft',
      createdAt: Date.now(),
    })

    return { expenseId }
  },
})

/**
 * Submit an expense
 */
export const submitExpenseMutation = mutation({
  args: {
    expenseId: v.id('expenses'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:expenses:submit')

    const expense = await db.getExpense(ctx.db, args.expenseId)
    if (!expense) {
      throw new Error('EXPENSE_NOT_FOUND')
    }

    if (expense.status !== 'Draft' && expense.status !== 'Rejected') {
      throw new Error('CANNOT_SUBMIT_EXPENSE')
    }

    await db.updateExpense(ctx.db, args.expenseId, {
      status: 'Submitted',
    })

    return { success: true }
  },
})

/**
 * Approve an expense
 */
export const approveExpenseMutation = mutation({
  args: {
    expenseId: v.id('expenses'),
    finalBillable: v.optional(v.boolean()),
    finalMarkup: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:expenses:approve')
    const authUser = await authComponent.getAuthUser(ctx)

    const expense = await db.getExpense(ctx.db, args.expenseId)
    if (!expense) {
      throw new Error('EXPENSE_NOT_FOUND')
    }

    if (expense.status !== 'Submitted') {
      throw new Error('CANNOT_APPROVE_EXPENSE')
    }

    const updates: Parameters<typeof db.updateExpense>[2] = {
      status: 'Approved',
      approvedAt: Date.now(),
      approvedBy: authUser.userId as Id<'users'>,
    }

    if (args.finalBillable !== undefined) {
      updates.billable = args.finalBillable
    }
    if (args.finalMarkup !== undefined) {
      updates.markupRate = args.finalMarkup
    }

    await db.updateExpense(ctx.db, args.expenseId, updates)

    return { success: true }
  },
})

/**
 * Reject an expense
 */
export const rejectExpenseMutation = mutation({
  args: {
    expenseId: v.id('expenses'),
    rejectionReason: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:expenses:approve')

    const expense = await db.getExpense(ctx.db, args.expenseId)
    if (!expense) {
      throw new Error('EXPENSE_NOT_FOUND')
    }

    if (expense.status !== 'Submitted') {
      throw new Error('CANNOT_REJECT_EXPENSE')
    }

    await db.updateExpense(ctx.db, args.expenseId, {
      status: 'Rejected',
      rejectionComments: args.rejectionReason,
    })

    return { success: true }
  },
})

// ============================================================================
// INVOICE ENDPOINTS
// ============================================================================

/**
 * List invoices
 */
export const listInvoices = query({
  args: {
    projectId: v.optional(v.id('projects')),
    companyId: v.optional(v.id('companies')),
    status: v.optional(
      v.array(
        v.union(
          v.literal('Draft'),
          v.literal('Finalized'),
          v.literal('Sent'),
          v.literal('Viewed'),
          v.literal('Paid'),
          v.literal('Void')
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:invoices:view:own')

    let invoices: Doc<'invoices'>[] = []

    if (args.projectId) {
      invoices = await db.listInvoicesByProject(ctx.db, args.projectId)
    } else if (args.companyId) {
      invoices = await db.listInvoicesByCompany(ctx.db, args.companyId)
    } else {
      return []
    }

    if (args.status && args.status.length > 0) {
      invoices = invoices.filter((i) => args.status!.includes(i.status))
    }

    return invoices
  },
})

/**
 * Get invoice with details
 */
export const getInvoiceWithDetails = query({
  args: {
    invoiceId: v.id('invoices'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:invoices:view:own')

    const invoice = await db.getInvoice(ctx.db, args.invoiceId)
    if (!invoice) {
      return null
    }

    const lineItems = await db.listInvoiceLineItemsByInvoice(
      ctx.db,
      args.invoiceId
    )
    const payments = await db.listPaymentsByInvoice(ctx.db, args.invoiceId)

    return { ...invoice, lineItems, payments }
  },
})

/**
 * Get uninvoiced items
 */
export const getUninvoicedItems = query({
  args: {
    projectId: v.id('projects'),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:invoices:create')

    let timeEntries = await db.listApprovedBillableTimeEntriesForInvoicing(
      ctx.db,
      args.projectId
    )
    let expenses = await db.listApprovedBillableExpensesForInvoicing(
      ctx.db,
      args.projectId
    )

    // Filter by date range if provided
    if (args.startDate && args.endDate) {
      timeEntries = timeEntries.filter(
        (e) => e.date >= args.startDate! && e.date <= args.endDate!
      )
      expenses = expenses.filter(
        (e) => e.date >= args.startDate! && e.date <= args.endDate!
      )
    }

    // Calculate totals (simplified - would need to look up service rates)
    const timeTotal = timeEntries.reduce((sum, e) => {
      return sum + e.hours * 10000 // placeholder rate in cents
    }, 0)

    const expenseTotal = expenses.reduce((sum, e) => {
      const markup = e.markupRate ? e.amount * (e.markupRate / 100) : 0
      return sum + e.amount + markup
    }, 0)

    return {
      timeEntries,
      expenses,
      totals: { time: timeTotal, expenses: expenseTotal },
    }
  },
})

/**
 * Create invoice
 */
export const createInvoice = mutation({
  args: {
    projectId: v.id('projects'),
    method: v.union(
      v.literal('TimeAndMaterials'),
      v.literal('FixedFee'),
      v.literal('Milestone'),
      v.literal('Recurring')
    ),
    dateRange: v.optional(
      v.object({
        start: v.number(),
        end: v.number(),
      })
    ),
    includeExpenses: v.optional(v.boolean()),
    invoiceAmount: v.optional(v.number()),
    milestoneId: v.optional(v.id('milestones')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:invoices:create')

    const project = await db.getProject(ctx.db, args.projectId)
    if (!project) {
      throw new Error('PROJECT_NOT_FOUND')
    }

    let totalAmount = 0
    let lineItemCount = 0

    // Create invoice
    const invoiceId = await db.insertInvoice(ctx.db, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      companyId: project.companyId,
      method: args.method,
      status: 'Draft',
      subtotal: 0,
      tax: 0,
      total: 0,
      dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days default
      createdAt: Date.now(),
    })

    if (args.method === 'TimeAndMaterials') {
      // Get uninvoiced time entries
      let timeEntries = await db.listApprovedBillableTimeEntriesForInvoicing(
        ctx.db,
        args.projectId
      )

      if (args.dateRange) {
        timeEntries = timeEntries.filter(
          (e) =>
            e.date >= args.dateRange!.start && e.date <= args.dateRange!.end
        )
      }

      // Group by service
      const serviceGroups = new Map<
        string,
        { hours: number; rate: number; name: string }
      >()
      for (const entry of timeEntries) {
        if (entry.serviceId) {
          const service = await db.getService(ctx.db, entry.serviceId)
          if (service) {
            const group = serviceGroups.get(service._id) ?? {
              hours: 0,
              rate: service.rate,
              name: service.name,
            }
            group.hours += entry.hours
            serviceGroups.set(service._id, group)
          }
        }
      }

      // Create line items
      let sortOrder = 0
      for (const [_serviceId, group] of serviceGroups) {
        const amount = group.hours * group.rate
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: group.name,
          quantity: group.hours,
          rate: group.rate,
          amount,
          sortOrder: sortOrder++,
        })
        totalAmount += amount
        lineItemCount++
      }

      // Link time entries to invoice
      for (const entry of timeEntries) {
        await db.updateTimeEntry(ctx.db, entry._id, { invoiceId })
      }

      // Add expenses if requested
      if (args.includeExpenses) {
        let expenses = await db.listApprovedBillableExpensesForInvoicing(
          ctx.db,
          args.projectId
        )

        if (args.dateRange) {
          expenses = expenses.filter(
            (e) =>
              e.date >= args.dateRange!.start && e.date <= args.dateRange!.end
          )
        }

        for (const expense of expenses) {
          const markup = expense.markupRate
            ? expense.amount * (expense.markupRate / 100)
            : 0
          const amount = expense.amount + markup

          await db.insertInvoiceLineItem(ctx.db, {
            invoiceId,
            description: expense.description,
            quantity: 1,
            rate: amount,
            amount,
            sortOrder: sortOrder++,
          })
          totalAmount += amount
          lineItemCount++

          await db.updateExpense(ctx.db, expense._id, { invoiceId })
        }
      }
    } else if (args.method === 'FixedFee' && args.invoiceAmount) {
      await db.insertInvoiceLineItem(ctx.db, {
        invoiceId,
        description: 'Fixed Fee Services',
        quantity: 1,
        rate: args.invoiceAmount,
        amount: args.invoiceAmount,
        sortOrder: 0,
      })
      totalAmount = args.invoiceAmount
      lineItemCount = 1
    } else if (args.method === 'Milestone' && args.milestoneId) {
      const milestone = await db.getMilestone(ctx.db, args.milestoneId)
      if (milestone) {
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: `Milestone: ${milestone.name}`,
          quantity: 1,
          rate: milestone.amount,
          amount: milestone.amount,
          sortOrder: 0,
        })
        totalAmount = milestone.amount
        lineItemCount = 1

        // Mark milestone as invoiced
        await db.updateMilestone(ctx.db, args.milestoneId, { invoiceId })
      }
    } else if (args.method === 'Recurring' && args.invoiceAmount) {
      const budget = await db.getBudgetByProject(ctx.db, args.projectId)
      await db.insertInvoiceLineItem(ctx.db, {
        invoiceId,
        description: `Retainer - ${budget?.type ?? 'Services'}`,
        quantity: 1,
        rate: args.invoiceAmount,
        amount: args.invoiceAmount,
        sortOrder: 0,
      })
      totalAmount = args.invoiceAmount
      lineItemCount = 1
    }

    // Update invoice totals
    await db.updateInvoice(ctx.db, invoiceId, {
      subtotal: totalAmount,
      total: totalAmount,
    })

    return { invoiceId, lineItemCount, total: totalAmount }
  },
})

/**
 * Finalize invoice
 */
export const finalizeInvoiceMutation = mutation({
  args: {
    invoiceId: v.id('invoices'),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:invoices:finalize')

    const invoice = await db.getInvoice(ctx.db, args.invoiceId)
    if (!invoice) {
      throw new Error('INVOICE_NOT_FOUND')
    }

    if (invoice.status !== 'Draft') {
      throw new Error('INVOICE_ALREADY_FINALIZED')
    }

    // Generate invoice number
    const invoiceNumber = await db.getNextInvoiceNumber(
      ctx.db,
      invoice.organizationId
    )

    // Default due date to 30 days
    const dueDate = args.dueDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000

    await db.updateInvoice(ctx.db, args.invoiceId, {
      number: invoiceNumber,
      status: 'Finalized',
      dueDate,
      finalizedAt: Date.now(),
    })

    // Lock associated time entries
    const timeEntries = await db.listTimeEntriesByProject(
      ctx.db,
      invoice.projectId
    )
    for (const entry of timeEntries) {
      if (entry.invoiceId === args.invoiceId) {
        await db.updateTimeEntry(ctx.db, entry._id, { status: 'Locked' })
      }
    }

    return { invoiceNumber, finalized: true }
  },
})

/**
 * Send invoice
 */
export const sendInvoiceMutation = mutation({
  args: {
    invoiceId: v.id('invoices'),
    method: v.union(v.literal('email'), v.literal('pdf'), v.literal('portal')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:invoices:send')

    const invoice = await db.getInvoice(ctx.db, args.invoiceId)
    if (!invoice) {
      throw new Error('INVOICE_NOT_FOUND')
    }

    if (!invoice.number) {
      throw new Error('INVOICE_NOT_FINALIZED')
    }

    // In a real implementation, this would send the invoice via the chosen method
    await db.updateInvoice(ctx.db, args.invoiceId, {
      status: 'Sent',
      sentAt: Date.now(),
    })

    return { sent: true, trackingId: `track-${args.invoiceId}` }
  },
})

// ============================================================================
// PAYMENT ENDPOINTS
// ============================================================================

/**
 * Record a payment
 */
export const recordPayment = mutation({
  args: {
    invoiceId: v.id('invoices'),
    amount: v.number(),
    date: v.number(),
    method: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:payments:record')

    const invoice = await db.getInvoice(ctx.db, args.invoiceId)
    if (!invoice) {
      throw new Error('INVOICE_NOT_FOUND')
    }

    const paymentId = await db.insertPayment(ctx.db, {
      organizationId: invoice.organizationId,
      invoiceId: args.invoiceId,
      amount: args.amount,
      date: args.date,
      method: args.method,
      reference: args.reference,
      syncedToAccounting: false,
      createdAt: Date.now(),
    })

    // Calculate remaining balance
    const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, args.invoiceId)
    const remaining = invoice.total - totalPaid

    // Update invoice status if fully paid
    const fullyPaid = remaining <= 0
    if (fullyPaid) {
      await db.updateInvoice(ctx.db, args.invoiceId, {
        status: 'Paid',
        paidAt: Date.now(),
      })
    }

    return { paymentId, fullyPaid, remaining: Math.max(0, remaining) }
  },
})

/**
 * Get payments for an invoice
 */
export const getInvoicePayments = query({
  args: {
    invoiceId: v.id('invoices'),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:payments:view')

    return await db.listPaymentsByInvoice(ctx.db, args.invoiceId)
  },
})

// ============================================================================
// REPORT ENDPOINTS
// ============================================================================

/**
 * Get utilization report
 */
export const getUtilizationReport = query({
  args: {
    organizationId: v.id('organizations'),
    startDate: v.number(),
    endDate: v.number(),
    groupBy: v.optional(
      v.union(v.literal('person'), v.literal('department'))
    ),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:reports:view:all')

    const users = await db.listActiveUsers(ctx.db, args.organizationId)

    const data = await Promise.all(
      users.map(async (user) => {
        const util = await calculateUserUtilization(
          ctx.db,
          user._id,
          args.startDate,
          args.endDate
        )

        return {
          entity: { id: user._id, name: user.name ?? '' },
          department: user.department,
          availableHours: util.availableHours,
          bookedHours: util.bookedHours,
          actualHours: util.bookedHours, // Would be actual logged hours
          utilizationPercent: util.utilizationPercent,
        }
      })
    )

    if (args.groupBy === 'department') {
      // Group by department
      const deptGroups = new Map<
        string,
        {
          available: number
          booked: number
          actual: number
        }
      >()

      for (const item of data) {
        const dept = item.department ?? 'Unassigned'
        const group = deptGroups.get(dept) ?? {
          available: 0,
          booked: 0,
          actual: 0,
        }
        group.available += item.availableHours
        group.booked += item.bookedHours
        group.actual += item.actualHours
        deptGroups.set(dept, group)
      }

      return {
        data: Array.from(deptGroups.entries()).map(([dept, group]) => ({
          entity: { id: dept, name: dept },
          availableHours: group.available,
          bookedHours: group.booked,
          actualHours: group.actual,
          utilizationPercent:
            group.available > 0 ? (group.booked / group.available) * 100 : 0,
        })),
      }
    }

    return { data }
  },
})

/**
 * Get budget burn report
 */
export const getBudgetBurnReport = query({
  args: {
    projectId: v.optional(v.id('projects')),
    organizationId: v.optional(v.id('organizations')),
  },
  handler: async (ctx, args) => {
    await assertUserHasScope(ctx, 'dealToDelivery:reports:view:all')

    const projects: Doc<'projects'>[] = []

    if (args.projectId) {
      const project = await db.getProject(ctx.db, args.projectId)
      if (project) projects.push(project)
    } else if (args.organizationId) {
      const orgProjects = await listProjectsByOrganization(
        ctx.db,
        args.organizationId
      )
      projects.push(...orgProjects)
    }

    const data = await Promise.all(
      projects.map(async (project) => {
        const burn = await calculateProjectBudgetBurn(ctx.db, project._id)

        // Determine status
        let status: 'on_track' | 'at_risk' | 'overrun' = 'on_track'
        if (burn.burnRate >= 100) {
          status = 'overrun'
        } else if (burn.burnRate >= 80) {
          status = 'at_risk'
        }

        return {
          id: project._id,
          name: project.name,
          budget: burn.budgetAmount,
          burned: burn.totalCost,
          burnRate: burn.burnRate,
          projected: burn.totalCost, // Would calculate projection
          status,
        }
      })
    )

    return { projects: data }
  },
})
