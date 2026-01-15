import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  calculateProjectBudgetBurn,
  listTasksByProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires tasks:view:all scope to evaluate project conditions
const evaluateConditionPolicy = authService.policies.requireScope('dealToDelivery:tasks:view:all')

// Schema for the complete action payload
const evaluateConditionPayloadSchema = z.object({
  // Type of condition to evaluate
  conditionType: z.enum([
    'budgetThreshold',
    'taskCompletion',
    'milestoneReached',
    'custom',
  ]),
  // For budget threshold
  budgetThreshold: z.number().min(0).max(100).optional(),
  // For task completion percentage
  taskCompletionThreshold: z.number().min(0).max(100).optional(),
  // For custom conditions
  customCondition: z.string().optional(),
})

const evaluateConditionActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), evaluateConditionPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - evaluate the condition
  .complete(
    evaluateConditionPayloadSchema,
    evaluateConditionPolicy,
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

      // conditionMet determines routing: true = primary branch, false = alternate branch
      let conditionMet = false

      switch (payload.conditionType) {
        case 'budgetThreshold': {
          const threshold = payload.budgetThreshold ?? 90
          const burn = await calculateProjectBudgetBurn(mutationCtx.db, project._id)
          conditionMet = burn.burnRate >= threshold
          break
        }

        case 'taskCompletion': {
          const threshold = payload.taskCompletionThreshold ?? 100
          const tasks = await listTasksByProject(mutationCtx.db, project._id)
          const completedTasks = tasks.filter((t) => t.status === 'Done').length
          const completionRate = tasks.length > 0
            ? (completedTasks / tasks.length) * 100
            : 0
          conditionMet = completionRate >= threshold
          break
        }

        case 'milestoneReached': {
          // Placeholder for milestone evaluation
          // Would check if specific milestones are complete
          conditionMet = true
          break
        }

        case 'custom': {
          // Custom conditions would be evaluated based on the string
          // This is a placeholder for extensibility
          conditionMet = payload.customCondition === 'true'
          break
        }
      }

      // Store the routing decision in metadata
      // Note: must use explicit object to satisfy discriminated union type
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          type: 'evaluateCondition' as const,
          taskName: metadata.payload.taskName,
          projectId: project._id,
          conditionMet,
        },
      })
    },
  )

export const evaluateConditionWorkItem = Builder.workItem('evaluateCondition')
  .withActions(evaluateConditionActions.build())

export const evaluateConditionTask = Builder.task(evaluateConditionWorkItem)
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
        scope: 'dealToDelivery:tasks:view:all',
        payload: {
          type: 'evaluateCondition',
          taskName: 'Evaluate Condition',
          projectId: project._id,
        },
      })
    },
  })
