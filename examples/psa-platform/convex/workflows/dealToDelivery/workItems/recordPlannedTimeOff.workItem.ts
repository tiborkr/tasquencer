import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  insertBooking,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires resources:timeoff:own scope to request time off
const recordPlannedTimeOffPolicy = authService.policies.requireScope('dealToDelivery:resources:timeoff:own')

// Schema for the complete action payload
const recordPlannedTimeOffPayloadSchema = z.object({
  userId: z.string(), // User requesting time off
  startDate: z.number(), // Unix timestamp
  endDate: z.number(),   // Unix timestamp
  type: z.enum(['Vacation', 'Sick', 'Personal', 'Holiday']),
  hoursPerDay: z.number().min(0.25).max(8).optional().default(8),
  notes: z.string().optional(),
})

const recordPlannedTimeOffActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), recordPlannedTimeOffPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - record planned time off
  .complete(
    recordPlannedTimeOffPayloadSchema,
    recordPlannedTimeOffPolicy,
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

      // Get project to determine organization
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Validate dates
      if (payload.endDate < payload.startDate) {
        throw new Error('END_DATE_MUST_BE_AFTER_START_DATE')
      }

      // Create the time off booking
      // Time off bookings don't have a projectId or taskId
      await insertBooking(mutationCtx.db, {
        organizationId: project.organizationId,
        userId: payload.userId as Id<'users'>,
        type: 'TimeOff',
        startDate: payload.startDate,
        endDate: payload.endDate,
        hoursPerDay: payload.hoursPerDay,
        notes: payload.notes
          ? `${payload.type}: ${payload.notes}`
          : payload.type,
        createdAt: Date.now(),
      })

      // Time off booking created successfully
      // This will be factored into availability calculations
    },
  )

export const recordPlannedTimeOffWorkItem = Builder.workItem('recordPlannedTimeOff')
  .withActions(recordPlannedTimeOffActions.build())

export const recordPlannedTimeOffTask = Builder.task(recordPlannedTimeOffWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item metadata
      // Note: userId is the project manager - actual time off user is provided in action payload
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:resources:timeoff:own',
        payload: {
          type: 'recordPlannedTimeOff',
          taskName: 'Record Planned Time Off',
          userId: project.managerId,
        },
      })
    },
  })
