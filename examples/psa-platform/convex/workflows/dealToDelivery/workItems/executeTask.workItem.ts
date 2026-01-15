import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  getTask,
  updateTask,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires tasks:edit:own scope to work on assigned tasks
const executeTaskPolicy = authService.policies.requireScope('dealToDelivery:tasks:edit:own')

// Schema for the complete action payload
const executeTaskPayloadSchema = z.object({
  taskId: z.string(),
  notes: z.string().optional(),
})

const executeTaskActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), executeTaskPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - start executing the task (mark as InProgress)
  .complete(
    executeTaskPayloadSchema,
    executeTaskPolicy,
    async ({ mutationCtx, workItem }, payload) => {
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

      // Get the task
      const taskId = payload.taskId as Id<'tasks'>
      const task = await getTask(mutationCtx.db, taskId)
      invariant(task, 'TASK_NOT_FOUND')

      // Verify user is assigned to this task
      invariant(
        task.assigneeIds.includes(userId as Id<'users'>),
        'USER_NOT_ASSIGNED_TO_TASK'
      )

      // Mark task as InProgress
      await updateTask(mutationCtx.db, taskId, {
        status: 'InProgress',
      })
    },
  )

export const executeTaskWorkItem = Builder.workItem('executeTask')
  .withActions(executeTaskActions.build())

export const executeTaskTask = Builder.task(executeTaskWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the project linked to this workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Note: taskId is provided at completion time, not initialization
      // For initialization, we just need the project context
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:tasks:edit:own',
        payload: {
          type: 'executeTask',
          taskName: 'Execute Task',
          // taskId will be provided when user selects which task to execute
          taskId: '' as Id<'tasks'>, // Placeholder - actual taskId comes from payload
        },
      })
    },
  })
