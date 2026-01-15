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

// Policy: requires tasks:view:all scope to see all tasks
const getNextTaskPolicy = authService.policies.requireScope('dealToDelivery:tasks:view:all')

// Schema for the complete action payload
const getNextTaskPayloadSchema = z.object({
  // Optional filter by assignee
  assigneeId: z.string().optional(),
  // Optional filter by priority
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
})

const getNextTaskActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), getNextTaskPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - find the next task to execute
  .complete(
    getNextTaskPayloadSchema,
    getNextTaskPolicy,
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

      // Get all tasks for the project
      const tasks = await listTasksByProject(mutationCtx.db, project._id)

      // Filter to find eligible tasks (Todo status, dependencies satisfied)
      const eligibleTasks = tasks.filter((task) => {
        // Must be in Todo status
        if (task.status !== 'Todo') return false

        // Check if assignee filter matches (if specified)
        if (payload.assigneeId && !task.assigneeIds.includes(payload.assigneeId as Id<'users'>)) {
          return false
        }

        // Check if priority filter matches (if specified)
        if (payload.priority && task.priority !== payload.priority) {
          return false
        }

        // Check if all dependencies are complete
        for (const depId of task.dependencies) {
          const depTask = tasks.find((t) => t._id === depId)
          if (depTask && depTask.status !== 'Done') {
            return false // Dependency not complete
          }
        }

        return true
      })

      // Sort by priority (Urgent > High > Medium > Low) then by sortOrder
      const priorityOrder = { Urgent: 0, High: 1, Medium: 2, Low: 3 }
      eligibleTasks.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        return a.sortOrder - b.sortOrder
      })

      // The next task is the first eligible one (or null if none)
      // The downstream workflow will handle the case of no eligible tasks
    },
  )

export const getNextTaskWorkItem = Builder.workItem('getNextTask')
  .withActions(getNextTaskActions.build())

export const getNextTaskTask = Builder.task(getNextTaskWorkItem)
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
          type: 'getNextTask',
          taskName: 'Get Next Task',
          projectId: project._id,
        },
      })
    },
  })
