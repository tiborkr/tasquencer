import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  updateProject,
  listTasksByProject,
  updateTask,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires projects:edit:own scope
const pauseWorkPolicy = authService.policies.requireScope('dealToDelivery:projects:edit:own')

// Schema for the complete action payload
const pauseWorkPayloadSchema = z.object({
  reason: z.string().min(1),
  notifyTeam: z.boolean().default(true),
  pausedTaskIds: z.array(z.string()).optional(), // Specific tasks to pause, or all if not provided
  updateProjectStatus: z.boolean().default(true), // Whether to set project to OnHold
})

const pauseWorkActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), pauseWorkPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - pause project work
  .complete(
    pauseWorkPayloadSchema,
    pauseWorkPolicy,
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

      // Optionally update project status to OnHold
      if (payload.updateProjectStatus) {
        await updateProject(mutationCtx.db, project._id, {
          status: 'OnHold',
        })
      }

      // Pause tasks
      let pausedTaskCount = 0
      if (payload.pausedTaskIds && payload.pausedTaskIds.length > 0) {
        // Pause specific tasks
        for (const taskId of payload.pausedTaskIds) {
          await updateTask(mutationCtx.db, taskId as Id<'tasks'>, {
            status: 'Todo', // Reset to Todo (OnHold equivalent - no explicit OnHold status)
          })
          pausedTaskCount++
        }
      } else {
        // Pause all non-done tasks
        const tasks = await listTasksByProject(mutationCtx.db, project._id)
        for (const task of tasks) {
          if (task.status !== 'Done') {
            await updateTask(mutationCtx.db, task._id, {
              status: 'Todo', // Reset to Todo
            })
            pausedTaskCount++
          }
        }
      }

      // Note: Team notification would be handled by an external service
      // (e.g., email, Slack) in a production implementation
      // The notifyTeam flag indicates the intent
    },
  )

export const pauseWorkWorkItem = Builder.workItem('pauseWork')
  .withActions(pauseWorkActions.build())

export const pauseWorkTask = Builder.task(pauseWorkWorkItem)
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
        scope: 'dealToDelivery:projects:edit:own',
        payload: {
          type: 'pauseWork',
          taskName: 'Pause Work',
          projectId: project._id,
        },
      })
    },
  })
