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
 * Reference: .review/recipes/psa-platform/specs/03-workflow-sales-phase.md
 * Reference: .review/recipes/psa-platform/specs/26-api-endpoints.md
 */
import { v } from 'convex/values'
import { mutation, query } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import { dealToDeliveryVersionManager } from '../definition'

const {
  helpers: { getWorkflowTaskStates },
} = dealToDeliveryVersionManager.apiForVersion('v1')

/**
 * Initializes a new Deal to Delivery workflow.
 * This is the entry point for creating a new deal in the sales pipeline.
 *
 * The workflow will create the deal entity and start the sales phase,
 * beginning with the createDeal work item.
 *
 * @param args.dealName - Name of the deal
 * @param args.clientName - Name of the client/company
 * @param args.estimatedValue - Estimated deal value in cents
 * @returns The workflow ID for the new deal workflow
 *
 * TODO: Once schema is implemented (PRIORITY 1), return the deal ID instead
 * of workflow ID, matching the ER example pattern.
 */
export const initializeDealToDelivery = mutation({
  args: {
    dealName: v.string(),
    clientName: v.string(),
    estimatedValue: v.number(),
  },

  handler: async (ctx, args): Promise<Id<'tasquencerWorkflows'>> => {
    // TODO: Add authorization check once authSetup is implemented (PRIORITY 2)
    // await requirePsaStaffMember(ctx)

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

    // TODO: Once schema is implemented (PRIORITY 1), query for the created deal
    // and return its ID instead of the workflow ID.
    // const deal = await getDealByWorkflowId(ctx.db, workflowId)
    // assertDealExists(deal, workflowId)
    // return deal._id

    return workflowId
  },
})

/**
 * Gets the workflow task states for a deal workflow.
 * Used by the UI to show workflow progress visualization.
 *
 * @param args.workflowId - The deal workflow ID
 * @returns Array of task states showing the workflow progress
 */
export const getDealWorkflowTaskStates = query({
  args: { workflowId: v.id('tasquencerWorkflows') },

  handler: async (ctx, args) => {
    // TODO: Add authorization check once authSetup is implemented (PRIORITY 2)
    // await requirePsaStaffMember(ctx)

    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'dealToDelivery',
      workflowId: args.workflowId,
    })
  },
})
