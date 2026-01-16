import { v } from 'convex/values'
import { mutation } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import type { FunctionReference } from 'convex/server'
import { getDealByWorkflowId } from '../db'
import { internalInitializeRootWorkflow } from './workflow'

/**
 * Create a new deal by initializing the dealToDelivery workflow.
 * This follows the workflow-first pattern - the deal is created during
 * workflow initialization, which enables audit trails and tracing.
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
  handler: async (ctx, args): Promise<{ dealId: Id<'deals'>; workflowId: Id<'tasquencerWorkflows'> }> => {
    // Authorization is checked in the workflow initialization action
    // (dealToDelivery.workflow.ts), so we don't duplicate it here

    // Initialize the workflow - this creates the deal with workflowId
    // Cast through unknown to avoid type depth issues from complex workflow types
    const workflowId = await ctx.runMutation(
      internalInitializeRootWorkflow as unknown as FunctionReference<
        'mutation',
        'internal',
        {
          payload: {
            organizationId: string
            companyId: string
            contactId: string
            name: string
            value: number
            ownerId: string
          }
        },
        Id<'tasquencerWorkflows'>
      >,
      {
        payload: {
          organizationId: args.organizationId,
          companyId: args.companyId,
          contactId: args.contactId,
          name: args.name,
          value: args.value,
          ownerId: args.ownerId,
        },
      },
    )

    // Fetch the deal that was created during workflow initialization
    const deal = await getDealByWorkflowId(ctx.db, workflowId)
    if (!deal) {
      throw new Error('Deal not found after workflow initialization')
    }

    return { dealId: deal._id, workflowId }
  },
})
