import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import { insertTimeEntry, getUser, getBooking, listTimeEntriesByUserAndDate } from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires time:create:own scope
const autoFromBookingsPolicy = authService.policies.requireScope('dealToDelivery:time:create:own')

// Schema for the complete action payload
const autoFromBookingsPayloadSchema = z.object({
  dateRange: z.object({
    startDate: z.number(), // Unix timestamp for start
    endDate: z.number(), // Unix timestamp for end
  }),
  includeBookings: z.array(z.string()), // Booking IDs to use
  overrideHours: z.number().optional(), // Override hours per day
})

const autoFromBookingsActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), autoFromBookingsPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - generate time entries from bookings
  .complete(
    autoFromBookingsPayloadSchema,
    autoFromBookingsPolicy,
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

      // Process each selected booking
      const timeEntryIds: Id<'timeEntries'>[] = []
      let primaryProjectId: Id<'projects'> | null = null

      for (const bookingId of payload.includeBookings) {
        const booking = await getBooking(mutationCtx.db, bookingId as Id<'bookings'>)
        if (!booking) continue
        if (booking.type === 'TimeOff') continue // Skip time off bookings
        if (!booking.projectId) continue // Skip bookings without project

        if (!primaryProjectId) {
          primaryProjectId = booking.projectId
        }

        // Iterate through each day in the date range that overlaps with booking
        const startDate = Math.max(payload.dateRange.startDate, booking.startDate)
        const endDate = Math.min(payload.dateRange.endDate, booking.endDate)

        // Generate entries day by day
        const msPerDay = 24 * 60 * 60 * 1000
        let currentDate = startDate

        while (currentDate <= endDate) {
          // Check if entry already exists for this user/project/date
          const existingEntries = await listTimeEntriesByUserAndDate(
            mutationCtx.db,
            userId as Id<'users'>,
            currentDate,
          )

          const hasExisting = existingEntries.some(
            (entry) => entry.projectId === booking.projectId &&
                       entry.date === currentDate
          )

          if (!hasExisting) {
            // Create time entry for this day
            const hours = payload.overrideHours ?? booking.hoursPerDay

            const timeEntryId = await insertTimeEntry(mutationCtx.db, {
              organizationId: user.organizationId,
              userId: userId as Id<'users'>,
              projectId: booking.projectId,
              taskId: booking.taskId,
              date: currentDate,
              hours,
              billable: true, // Booking time is billable by default
              status: 'Draft',
              notes: `Auto-generated from booking`,
              createdAt: Date.now(),
            })

            timeEntryIds.push(timeEntryId)
          }

          currentDate += msPerDay
        }
      }

      // Update metadata
      await mutationCtx.db.patch(metadata!._id, {
        payload: {
          type: 'autoFromBookings' as const,
          taskName: 'Auto-generate from Bookings',
          userId: userId as Id<'users'>,
          projectId: primaryProjectId || '' as Id<'projects'>,
        },
      })
    },
  )

export const autoFromBookingsWorkItem = Builder.workItem('autoFromBookings')
  .withActions(autoFromBookingsActions.build())

export const autoFromBookingsTask = Builder.task(autoFromBookingsWorkItem)
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
          type: 'autoFromBookings',
          taskName: 'Auto-generate from Bookings',
          userId: userId as Id<'users'>,
          projectId: '' as Id<'projects'>, // Will be set from context
        },
      })
    },
  })
