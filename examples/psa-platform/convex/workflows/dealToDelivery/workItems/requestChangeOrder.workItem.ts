import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  getBudgetByProject,
  insertChangeOrder,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires changeOrders:request scope
const requestChangeOrderPolicy = authService.policies.requireScope('dealToDelivery:changeOrders:request')

// Schema for additional services in the change order
const additionalServiceSchema = z.object({
  name: z.string().min(1),
  rate: z.number().int().min(0), // Rate in cents
  hours: z.number().min(0),
})

// Schema for the complete action payload
const requestChangeOrderPayloadSchema = z.object({
  description: z.string().min(1),
  budgetImpact: z.number().int().min(0), // Additional amount in cents
  justification: z.string().min(1),
  additionalServices: z.array(additionalServiceSchema).optional(),
  scopeChanges: z.string().optional(),
})

const requestChangeOrderActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), requestChangeOrderPolicy, async ({ mutationCtx, workItem }) => {
    const authUser = await authComponent.getAuthUser(mutationCtx)
    const userId = authUser.userId
    invariant(userId, 'USER_DOES_NOT_EXIST')

    // Claim the work item for this user
    await DealToDeliveryWorkItemHelpers.claimWorkItem(
      mutationCtx,
      workItem.id,
      userId,
    )
    await workItem.start()
  })
  // Complete action - create change order request
  .complete(
    requestChangeOrderPayloadSchema,
    requestChangeOrderPolicy,
    async ({ mutationCtx, workItem, parent }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      invariant(metadata, 'WORK_ITEM_METADATA_NOT_FOUND')

      const claimedBy = isHumanClaim(metadata.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get the project from the workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Get current budget for reference
      const budget = await getBudgetByProject(mutationCtx.db, project._id)
      invariant(budget, 'BUDGET_NOT_FOUND_FOR_PROJECT')

      // Create the change order
      await insertChangeOrder(mutationCtx.db, {
        organizationId: project.organizationId,
        projectId: project._id,
        requestedBy: userId as Id<'users'>,
        description: payload.description,
        budgetImpact: payload.budgetImpact,
        status: 'Pending',
        createdAt: Date.now(),
      })

      // Note: The change order document preparation would be handled
      // by an external service in production. The changeOrderId is stored
      // in the workflow context for the approval step.
    },
  )

export const requestChangeOrderWorkItem = Builder.workItem('requestChangeOrder')
  .withActions(requestChangeOrderActions.build())

export const requestChangeOrderTask = Builder.task(requestChangeOrderWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the project linked to this workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item with human auth
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:changeOrders:request',
        payload: {
          type: 'requestChangeOrder',
          taskName: 'Request Change Order',
          projectId: project._id,
        },
      })
    },
  })
