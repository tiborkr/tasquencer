import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  insertBooking,
  calculateUserUtilization,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Id } from '../../../_generated/dataModel'

// Policy: requires resources:book:team scope to create bookings for team
const createBookingsPolicy = authService.policies.requireScope('dealToDelivery:resources:book:team')

// Schema for individual booking entry
const bookingEntrySchema = z.object({
  userId: z.string(),
  startDate: z.number(),
  endDate: z.number(),
  hoursPerDay: z.number().min(0.25).max(8).default(8),
  taskId: z.string().optional(),
  notes: z.string().optional(),
})

// Schema for the complete action payload
const createBookingsPayloadSchema = z.object({
  bookings: z.array(bookingEntrySchema).min(1),
  isConfirmed: z.boolean().default(false), // Tentative by default
})

const createBookingsActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), createBookingsPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - create bookings for team members
  .complete(
    createBookingsPayloadSchema,
    createBookingsPolicy,
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

      const bookingType = payload.isConfirmed ? 'Confirmed' : 'Tentative'
      const createdBookingIds: Id<'bookings'>[] = []
      const overallocationWarnings: string[] = []

      // Create each booking
      for (const booking of payload.bookings) {
        // Validate dates
        if (booking.endDate < booking.startDate) {
          throw new Error(`END_DATE_MUST_BE_AFTER_START_DATE for user ${booking.userId}`)
        }

        // Check for over-allocation (warning only, not blocking)
        const utilization = await calculateUserUtilization(
          mutationCtx.db,
          booking.userId as Id<'users'>,
          booking.startDate,
          booking.endDate,
        )

        if (utilization.utilizationPercent >= 100) {
          overallocationWarnings.push(
            `User ${booking.userId} is already at ${utilization.utilizationPercent.toFixed(0)}% utilization`
          )
        }

        // Create the booking
        const bookingId = await insertBooking(mutationCtx.db, {
          organizationId: project.organizationId,
          userId: booking.userId as Id<'users'>,
          projectId: project._id,
          taskId: booking.taskId as Id<'tasks'> | undefined,
          type: bookingType,
          startDate: booking.startDate,
          endDate: booking.endDate,
          hoursPerDay: booking.hoursPerDay,
          notes: booking.notes,
          createdAt: Date.now(),
        })

        createdBookingIds.push(bookingId)
      }

      // Log warnings (in practice, these would be shown to the user)
      if (overallocationWarnings.length > 0) {
        console.warn('Over-allocation warnings:', overallocationWarnings)
      }

      // Bookings created successfully
      // The IDs are available for downstream tasks (reviewBookings, confirmBookings)
    },
  )

export const createBookingsWorkItem = Builder.workItem('createBookings')
  .withActions(createBookingsActions.build())

export const createBookingsTask = Builder.task(createBookingsWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item metadata
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:resources:book:team',
        payload: {
          type: 'createBookings',
          taskName: 'Create Bookings',
          projectId: project._id,
        },
      })
    },
  })
