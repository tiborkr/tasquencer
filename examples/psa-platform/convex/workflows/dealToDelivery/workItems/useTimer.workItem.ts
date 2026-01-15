import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { insertTimeEntry, getUser } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:create:own scope
const useTimerPolicy = authService.policies.requireScope('dealToDelivery:time:create:own')

// Schema for the complete action payload
const useTimerPayloadSchema = z.object({
  projectId: z.string(), // Will be cast to Id<"projects">
  taskId: z.string().optional(), // Optional task reference
  serviceId: z.string().optional(), // Optional service reference
  startTime: z.number(), // When timer was started
  endTime: z.number(), // When timer was stopped (now)
  notes: z.string().optional(),
  billable: z.boolean().default(true),
})

const useTimerActions = authService.builders.workItemActions
  // Start action - user claims the work item and starts timer
  .start(z.never(), useTimerPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - stop timer and create time entry
  .complete(
    useTimerPayloadSchema,
    useTimerPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Verify the user has claimed this work item
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id,
      )
      const claimedBy = isHumanClaim(metadata?.claim)
        ? metadata.claim.userId
        : null
      if (!claimedBy || claimedBy !== userId) {
        throw new Error('WORK_ITEM_NOT_CLAIMED_BY_USER')
      }

      // Get user's organization
      const user = await getUser(mutationCtx.db, userId as Id<'users'>)
      invariant(user, 'USER_NOT_FOUND')
      invariant(user.organizationId, 'USER_NOT_IN_ORGANIZATION')

      // Calculate hours from timer duration (milliseconds to hours)
      const durationMs = payload.endTime - payload.startTime
      const hours = Math.round((durationMs / 3600000) * 100) / 100 // Round to 2 decimal places

      // Validate hours are reasonable
      if (hours <= 0) {
        throw new Error('INVALID_TIMER_DURATION_TOO_SHORT')
      }
      if (hours > 24) {
        throw new Error('INVALID_TIMER_DURATION_TOO_LONG')
      }

      // Create the time entry
      await insertTimeEntry(mutationCtx.db, {
        organizationId: user.organizationId,
        userId: userId as Id<'users'>,
        projectId: payload.projectId as Id<'projects'>,
        taskId: payload.taskId ? (payload.taskId as Id<'tasks'>) : undefined,
        serviceId: payload.serviceId ? (payload.serviceId as Id<'services'>) : undefined,
        date: payload.startTime, // Use start time as the date
        hours,
        billable: payload.billable,
        status: 'Draft',
        notes: payload.notes,
        createdAt: Date.now(),
      })

      // Update metadata with the created time entry
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'useTimer' as const,
          taskName: 'Use Timer',
          userId: userId as Id<'users'>,
          projectId: payload.projectId as Id<'projects'>,
        },
      })
    },
  )

export const useTimerWorkItem = Builder.workItem('useTimer')
  .withActions(useTimerActions.build())

export const useTimerTask = Builder.task(useTimerWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx }) => {
      const authUser = await authComponent.getAuthUser(mutationCtx)
      const userId = authUser.userId
      invariant(userId, 'USER_DOES_NOT_EXIST')

      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:time:create:own',
        payload: {
          type: 'useTimer',
          taskName: 'Use Timer',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>, // Will be set from context
        },
      })
    },
  })
