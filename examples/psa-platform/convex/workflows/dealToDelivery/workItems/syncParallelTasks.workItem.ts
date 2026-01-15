import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listTasksByProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires tasks:view:all scope to check task statuses
const syncParallelTasksPolicy = authService.policies.requireScope('dealToDelivery:tasks:view:all')

// Schema for the complete action payload
const syncParallelTasksPayloadSchema = z.object({
  // Task IDs that were part of the parallel execution
  taskIds: z.array(z.string()),
})

const syncParallelTasksActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), syncParallelTasksPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - verify all parallel tasks are complete
  .complete(
    syncParallelTasksPayloadSchema,
    syncParallelTasksPolicy,
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

      // Get all tasks and check if the specified ones are complete
      const tasks = await listTasksByProject(mutationCtx.db, project._id)
      const taskMap = new Map(tasks.map((t) => [t._id, t]))

      let allComplete = true
      const incompleteTasks: string[] = []

      for (const taskId of payload.taskIds) {
        const task = taskMap.get(taskId as Id<'tasks'>)
        if (!task) {
          throw new Error(`TASK_NOT_FOUND: ${taskId}`)
        }
        if (task.status !== 'Done') {
          allComplete = false
          incompleteTasks.push(task.name)
        }
      }

      // If not all complete, this work item should not complete
      // In a real scenario, this might loop or wait
      invariant(allComplete, `TASKS_NOT_COMPLETE: ${incompleteTasks.join(', ')}`)

      // All parallel tasks are synchronized (complete)
    },
  )

export const syncParallelTasksWorkItem = Builder.workItem('syncParallelTasks')
  .withActions(syncParallelTasksActions.build())

export const syncParallelTasksTask = Builder.task(syncParallelTasksWorkItem)
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
          type: 'syncParallelTasks',
          taskName: 'Sync Parallel Tasks',
          projectId: project._id,
        },
      })
    },
  })
