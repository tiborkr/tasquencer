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
import { authComponent } from '../../../auth'

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

    // Get current user to determine their organization
    const authUser = await authComponent.getAuthUser(ctx)
    const user = await ctx.db.get(authUser.userId as Id<'users'>)
    if (!user) {
      return []
    }

    // Use domain function for data access
    return await listDealsByOrganization(ctx.db, user.organizationId)
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
 * Initializes a new Deal to Delivery workflow.
 * This is the entry point for creating a new deal in the sales pipeline.
 *
 * The workflow will create the deal entity and start the sales phase,
 * beginning with the createDeal work item.
 *
 * Authorization: Requires dealToDelivery:deals:create scope.
 *
 * @param args.dealName - Name of the deal
 * @param args.clientName - Name of the client/company
 * @param args.estimatedValue - Estimated deal value in cents
 * @returns The workflow ID for the new deal workflow
 */
export const initializeDealToDelivery = mutation({
  args: {
    dealName: v.string(),
    clientName: v.string(),
    estimatedValue: v.number(),
  },

  handler: async (ctx, args): Promise<Id<'tasquencerWorkflows'>> => {
    await requireDealsCreateAccess(ctx)

    // Use internal API to avoid circular type dependency
    const workflowId = await ctx.runMutation(
      internal.workflows.dealToDelivery.api.workflow.internalInitializeRootWorkflow,
      {
        payload: {
          dealName: args.dealName,
          clientName: args.clientName,
          estimatedValue: args.estimatedValue,
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
