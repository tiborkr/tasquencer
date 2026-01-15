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
  listTasksByProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires tasks:edit:own scope to complete assigned tasks
const completeTaskPolicy = authService.policies.requireScope('dealToDelivery:tasks:edit:own')

// Schema for the complete action payload
const completeTaskPayloadSchema = z.object({
  taskId: z.string(),
  notes: z.string().optional(),
  moveToReview: z.boolean().default(false), // If true, move to Review instead of Done
})

const completeTaskActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), completeTaskPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - finish the task (mark as Done or Review)
  .complete(
    completeTaskPayloadSchema,
    completeTaskPolicy,
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

      // Verify task is in progress
      invariant(task.status === 'InProgress', 'TASK_NOT_IN_PROGRESS')

      // Mark task as Done or Review
      const newStatus = payload.moveToReview ? 'Review' : 'Done'
      await updateTask(mutationCtx.db, taskId, {
        status: newStatus,
      })

      // Check if there are more tasks to execute
      const allTasks = await listTasksByProject(mutationCtx.db, task.projectId)
      const pendingTasks = allTasks.filter(
        (t) => t.status === 'Todo' || t.status === 'InProgress'
      )
      const hasMoreTasks = pendingTasks.length > 0

      // Store the routing decision in metadata
      // Note: must use explicit object to satisfy discriminated union type
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          type: 'completeTask' as const,
          taskName: metadata.payload.taskName,
          taskId: taskId,
          hasMoreTasks,
        },
      })
    },
  )

export const completeTaskWorkItem = Builder.workItem('completeTask')
  .withActions(completeTaskActions.build())

export const completeTaskTask = Builder.task(completeTaskWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Find the project linked to this workflow
      const workflowId = parent.workflow.id
      const project = await getProjectByWorkflowId(mutationCtx.db, workflowId)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Note: taskId is provided at completion time
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:tasks:edit:own',
        payload: {
          type: 'completeTask',
          taskName: 'Complete Task',
          taskId: '' as Id<'tasks'>, // Placeholder - actual taskId comes from payload
        },
      })
    },
  })
