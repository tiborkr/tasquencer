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
const manualEntryPolicy = authService.policies.requireScope('dealToDelivery:time:create:own')

// Schema for the complete action payload
const manualEntryPayloadSchema = z.object({
  projectId: z.string(), // Will be cast to Id<"projects">
  taskId: z.string().optional(), // Optional task reference
  serviceId: z.string().optional(), // Optional service reference
  date: z.number(), // Entry date as Unix timestamp
  hours: z.number().min(0.25, 'Minimum entry is 15 minutes').max(24, 'Maximum entry is 24 hours'),
  notes: z.string().optional(),
  billable: z.boolean().default(true),
})

const manualEntryActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), manualEntryPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create time entry with manual hours
  .complete(
    manualEntryPayloadSchema,
    manualEntryPolicy,
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

      // Validate date is not in the future
      const todayStart = new Date().setHours(0, 0, 0, 0)
      if (payload.date > todayStart + 24 * 60 * 60 * 1000) {
        throw new Error('CANNOT_ENTER_TIME_FOR_FUTURE_DATES')
      }

      // Create the time entry
      await insertTimeEntry(mutationCtx.db, {
        organizationId: user.organizationId,
        userId: userId as Id<'users'>,
        projectId: payload.projectId as Id<'projects'>,
        taskId: payload.taskId ? (payload.taskId as Id<'tasks'>) : undefined,
        serviceId: payload.serviceId ? (payload.serviceId as Id<'services'>) : undefined,
        date: payload.date,
        hours: payload.hours,
        billable: payload.billable,
        status: 'Draft',
        notes: payload.notes,
        createdAt: Date.now(),
      })

      // Update metadata
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'manualEntry' as const,
          taskName: 'Manual Time Entry',
          userId: userId as Id<'users'>,
          projectId: payload.projectId as Id<'projects'>,
        },
      })
    },
  )

export const manualEntryWorkItem = Builder.workItem('manualEntry')
  .withActions(manualEntryActions.build())

export const manualEntryTask = Builder.task(manualEntryWorkItem)
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
          type: 'manualEntry',
          taskName: 'Manual Time Entry',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>, // Will be set from context
        },
      })
    },
  })
