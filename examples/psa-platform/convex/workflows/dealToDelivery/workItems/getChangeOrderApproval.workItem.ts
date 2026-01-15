import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listPendingChangeOrdersByProject,
  getChangeOrder,
  updateChangeOrder,
  getBudgetByProject,
  updateBudget,
  updateProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires changeOrders:approve scope
const getChangeOrderApprovalPolicy = authService.policies.requireScope('dealToDelivery:changeOrders:approve')

// Schema for the complete action payload
const getChangeOrderApprovalPayloadSchema = z.object({
  changeOrderId: z.string(),
  approved: z.boolean(),
  approverName: z.string().optional(),
  approverEmail: z.string().email().optional(),
  comments: z.string().optional(),
  approvedAmount: z.number().int().min(0).optional(), // For partial approval
})

const getChangeOrderApprovalActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), getChangeOrderApprovalPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - process change order approval/rejection
  .complete(
    getChangeOrderApprovalPayloadSchema,
    getChangeOrderApprovalPolicy,
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

      // Get the change order
      const changeOrderId = payload.changeOrderId as Id<'changeOrders'>
      const changeOrder = await getChangeOrder(mutationCtx.db, changeOrderId)
      invariant(changeOrder, 'CHANGE_ORDER_NOT_FOUND')
      invariant(changeOrder.status === 'Pending', 'CHANGE_ORDER_NOT_PENDING')

      // Get the project from the workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      if (payload.approved) {
        // Determine approved amount (full or partial)
        const approvedAmount = payload.approvedAmount ?? changeOrder.budgetImpact

        // Update change order status to Approved
        await updateChangeOrder(mutationCtx.db, changeOrderId, {
          status: 'Approved',
          approvedBy: userId as Id<'users'>,
          approvedAt: Date.now(),
        })

        // Update budget with approved amount
        const budget = await getBudgetByProject(mutationCtx.db, project._id)
        if (budget) {
          await updateBudget(mutationCtx.db, budget._id, {
            totalAmount: budget.totalAmount + approvedAmount,
          })
        }

        // Update project status back to Active
        await updateProject(mutationCtx.db, project._id, {
          status: 'Active',
        })

        // Resume paused tasks (set back to Todo if they were paused)
        // In production, would track which tasks were specifically paused
        // For now, we just ensure project is active
      } else {
        // Update change order status to Rejected
        await updateChangeOrder(mutationCtx.db, changeOrderId, {
          status: 'Rejected',
          approvedBy: userId as Id<'users'>,
          approvedAt: Date.now(),
        })

        // Note: Rejection triggers escalation or project closure discussion
        // This is handled by the workflow routing to 'completeExecution' or escalation path
      }

      // The XOR split in the workflow will route based on the approval decision
      // The routing decision is made based on the change order status
    },
  )

export const getChangeOrderApprovalWorkItem = Builder.workItem('getChangeOrderApproval')
  .withActions(getChangeOrderApprovalActions.build())

export const getChangeOrderApprovalTask = Builder.task(getChangeOrderApprovalWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the project linked to this workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Get the most recent pending change order for the project
      const pendingChangeOrders = await listPendingChangeOrdersByProject(mutationCtx.db, project._id)
      const changeOrder = pendingChangeOrders.sort((a, b) => b.createdAt - a.createdAt)[0]
      invariant(changeOrder, 'NO_PENDING_CHANGE_ORDER_FOUND')

      // Initialize work item with human auth
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:changeOrders:approve',
        payload: {
          type: 'getChangeOrderApproval',
          taskName: 'Get Change Order Approval',
          changeOrderId: changeOrder._id,
        },
      })
    },
  })
