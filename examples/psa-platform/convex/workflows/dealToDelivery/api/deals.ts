/**
 * Deals API
 *
 * Domain-specific mutations and queries for the deals pipeline.
 * These wrap the workflow engine APIs with business logic.
 *
 * WORKFLOW-FIRST: UI actions that advance deal lifecycle MUST use these
 * mutations which complete work items via workflow APIs. Do not create
 * direct CRUD mutations that bypass the workflow engine.
 *
 * TENET-AUTHZ: All queries are protected by scope-based authorization.
 * TENET-DOMAIN-BOUNDARY: All data access goes through domain functions (db.ts).
 *
 * Reference: .review/recipes/psa-platform/specs/03-workflow-sales-phase.md
 * Reference: .review/recipes/psa-platform/specs/26-api-endpoints.md
 */
import { v } from 'convex/values'
import { mutation, query } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import { dealToDeliveryVersionManager } from '../definition'
import {
  requirePsaStaffMember,
  requireDealsCreateAccess,
} from '../domain/services/authorizationService'
import {
  getDeal as getDealFromDb,
  getDealByWorkflowId as getDealByWorkflowIdFromDb,
  listDealsByOrganization,
} from '../db/deals'
import { getUser } from '../db/users'
import { getCompany } from '../db/companies'
import { authComponent } from '../../../auth'

/** Deal stages that appear as pipeline columns */
export const PIPELINE_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation'] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/** Enriched deal data for pipeline display */
export type DealWithDetails = {
  _id: Id<'deals'>
  name: string
  value: number
  stage: string
  probability: number
  createdAt: number
  workflowId: Id<'tasquencerWorkflows'> | null
  company: {
    _id: Id<'companies'>
    name: string
  } | null
  owner: {
    _id: Id<'users'>
    name: string
    email: string
  } | null
}

const {
  helpers: { getWorkflowTaskStates },
} = dealToDeliveryVersionManager.apiForVersion('v1')

/**
 * Lists deals for the current user's organization.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @returns Array of deals (limited to 50)
 */
export const listDeals = query({
  args: {},
  handler: async (ctx) => {
    await requirePsaStaffMember(ctx)

    // Get current user to determine their organization (via domain layer)
    const authUser = await authComponent.getAuthUser(ctx)
    const user = await getUser(ctx.db, authUser.userId as Id<'users'>)
    if (!user) {
      return []
    }

    // Use domain function for data access
    return await listDealsByOrganization(ctx.db, user.organizationId)
  },
})

/**
 * Lists deals with enriched company and owner details for pipeline display.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @returns Array of deals with company and owner details
 */
export const listDealsWithDetails = query({
  args: {},
  handler: async (ctx): Promise<DealWithDetails[]> => {
    await requirePsaStaffMember(ctx)

    // Get current user to determine their organization
    const authUser = await authComponent.getAuthUser(ctx)
    const user = await getUser(ctx.db, authUser.userId as Id<'users'>)
    if (!user) {
      return []
    }

    // Get raw deals
    const deals = await listDealsByOrganization(ctx.db, user.organizationId)

    // Enrich deals with company and owner details in parallel
    const enrichedDeals = await Promise.all(
      deals.map(async (deal) => {
        const [company, owner] = await Promise.all([
          getCompany(ctx.db, deal.companyId),
          getUser(ctx.db, deal.ownerId),
        ])

        return {
          _id: deal._id,
          name: deal.name,
          value: deal.value,
          stage: deal.stage,
          probability: deal.probability,
          createdAt: deal.createdAt,
          workflowId: deal.workflowId ?? null,
          company: company
            ? { _id: company._id, name: company.name }
            : null,
          owner: owner
            ? { _id: owner._id, name: owner.name, email: owner.email }
            : null,
        }
      })
    )

    return enrichedDeals
  },
})

/**
 * Gets pipeline stage summaries with total values and counts.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @returns Array of stage summaries
 */
export const getPipelineSummary = query({
  args: {},
  handler: async (ctx) => {
    await requirePsaStaffMember(ctx)

    // Get current user to determine their organization
    const authUser = await authComponent.getAuthUser(ctx)
    const user = await getUser(ctx.db, authUser.userId as Id<'users'>)
    if (!user) {
      return PIPELINE_STAGES.map((stage) => ({
        stage,
        totalValue: 0,
        dealCount: 0,
      }))
    }

    // Get raw deals
    const deals = await listDealsByOrganization(ctx.db, user.organizationId, 500)

    // Calculate summaries for each pipeline stage
    return PIPELINE_STAGES.map((stage) => {
      const stageDeals = deals.filter((deal) => deal.stage === stage)
      return {
        stage,
        totalValue: stageDeals.reduce((sum, deal) => sum + deal.value, 0),
        dealCount: stageDeals.length,
      }
    })
  },
})

/**
 * Gets a deal by ID.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @param args.dealId - The deal ID
 * @returns The deal document or null
 */
export const getDeal = query({
  args: { dealId: v.id('deals') },
  handler: async (ctx, args) => {
    await requirePsaStaffMember(ctx)

    // Use domain function for data access
    return await getDealFromDb(ctx.db, args.dealId)
  },
})

/**
 * Gets a deal by workflow ID.
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @param args.workflowId - The workflow ID
 * @returns The deal document or null
 */
export const getDealByWorkflowId = query({
  args: { workflowId: v.id('tasquencerWorkflows') },
  handler: async (ctx, args) => {
    await requirePsaStaffMember(ctx)

    // Use domain function for data access
    return await getDealByWorkflowIdFromDb(ctx.db, args.workflowId)
  },
})

/**
 * Creates a new deal by initializing the Deal to Delivery workflow.
 * This is the entry point for creating a new deal in the sales pipeline.
 *
 * The mutation:
 * 1. Initializes the workflow
 * 2. Initializes, starts, and completes the createDeal work item
 * 3. Creates the deal record in Lead stage
 *
 * Authorization: Requires dealToDelivery:deals:create scope.
 *
 * @param args.companyId - The company associated with this deal
 * @param args.contactId - The contact at the company
 * @param args.name - Name of the deal
 * @param args.value - Deal value in cents
 * @param args.ownerId - The user who owns this deal
 * @returns The workflow ID for the new deal workflow
 */
export const initializeDealToDelivery = mutation({
  args: {
    companyId: v.id('companies'),
    contactId: v.id('contacts'),
    name: v.string(),
    value: v.number(),
    ownerId: v.id('users'),
  },

  handler: async (ctx, args): Promise<Id<'tasquencerWorkflows'>> => {
    await requireDealsCreateAccess(ctx)

    // Get the user to determine the organization
    const authUser = await authComponent.getAuthUser(ctx)
    const user = await getUser(ctx.db, authUser.userId as Id<'users'>)
    if (!user) {
      throw new Error('User not found')
    }

    // Step 1: Initialize the root workflow
    const workflowId = await ctx.runMutation(
      internal.workflows.dealToDelivery.api.workflow.internalInitializeRootWorkflow,
      {
        payload: {},
      },
    )

    // Step 2: Initialize the createDeal work item
    const workItemId = await ctx.runMutation(
      internal.workflows.dealToDelivery.api.workflow.internalInitializeWorkItem,
      {
        target: {
          path: ['dealToDelivery', 'sales', 'salesPhase', 'createDeal', 'createDeal'],
          parentWorkflowId: workflowId,
          parentTaskName: 'createDeal',
        },
        args: { name: 'createDeal' as const, payload: {} },
      },
    )

    // Step 3: Start the createDeal work item
    await ctx.runMutation(
      internal.workflows.dealToDelivery.api.workflow.internalStartWorkItem,
      {
        workItemId,
        args: { name: 'createDeal' as const },
      },
    )

    // Step 4: Complete the createDeal work item with full payload
    await ctx.runMutation(
      internal.workflows.dealToDelivery.api.workflow.internalCompleteWorkItem,
      {
        workItemId,
        args: {
          name: 'createDeal' as const,
          payload: {
            organizationId: user.organizationId,
            companyId: args.companyId,
            contactId: args.contactId,
            name: args.name,
            value: args.value,
            ownerId: args.ownerId,
          },
        },
      },
    )

    return workflowId
  },
})

/**
 * Gets the workflow task states for a deal workflow.
 * Used by the UI to show workflow progress visualization.
 *
 * Authorization: Requires dealToDelivery:staff scope.
 *
 * @param args.workflowId - The deal workflow ID
 * @returns Array of task states showing the workflow progress
 */
export const getDealWorkflowTaskStates = query({
  args: { workflowId: v.id('tasquencerWorkflows') },

  handler: async (ctx, args) => {
    await requirePsaStaffMember(ctx)

    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'dealToDelivery',
      workflowId: args.workflowId,
    })
  },
})
