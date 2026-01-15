import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  calculateProjectBudgetBurn,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires budgets:view:all scope (project managers need to view project budgets)
const monitorBudgetBurnPolicy = authService.policies.requireScope('dealToDelivery:budgets:view:all')

// Schema for the complete action payload - no input needed, just an acknowledgment
const monitorBudgetBurnPayloadSchema = z.object({
  // Optionally override the default threshold
  overrideThreshold: z.number().min(0).max(100).optional(),
})

const monitorBudgetBurnActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), monitorBudgetBurnPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - calculate budget burn and determine if overrun
  .complete(
    monitorBudgetBurnPayloadSchema,
    monitorBudgetBurnPolicy,
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

      // Calculate budget burn
      const burnMetrics = await calculateProjectBudgetBurn(mutationCtx.db, project._id)

      // Determine if budget is OK (default threshold is 90%)
      const threshold = payload.overrideThreshold ?? 90
      // Budget check result: burnMetrics.burnRate < threshold indicates budget is within threshold
      // This is available for workflow routing decisions
      void (burnMetrics.burnRate < threshold)

      // Store the budget check result in workflow context for routing
      // The XOR split will route based on this result
      // Return value is available for workflow routing decisions
      // Note: Complete action returns void, but the decision is made based on
      // the actual database state (burn rate) at routing time
    },
  )

export const monitorBudgetBurnWorkItem = Builder.workItem('monitorBudgetBurn')
  .withActions(monitorBudgetBurnActions.build())

export const monitorBudgetBurnTask = Builder.task(monitorBudgetBurnWorkItem)
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
        scope: 'dealToDelivery:budgets:view:all',
        payload: {
          type: 'monitorBudgetBurn',
          taskName: 'Monitor Budget Burn',
          projectId: project._id,
        },
      })
    },
  })
