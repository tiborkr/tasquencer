import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listBookingsByProject,
  updateBooking,
  updateProject,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires resources:confirm scope to confirm bookings
const confirmBookingsPolicy = authService.policies.requireScope('dealToDelivery:resources:confirm')

// Schema for selective confirmation
const selectiveConfirmationSchema = z.object({
  bookingId: z.string(),
  confirm: z.boolean(),
  reason: z.string().optional(),
})

// Schema for the complete action payload
const confirmBookingsPayloadSchema = z.object({
  confirmAll: z.boolean().default(true),
  selectiveConfirmations: z.array(selectiveConfirmationSchema).optional(),
})

const confirmBookingsActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), confirmBookingsPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - confirm tentative bookings
  .complete(
    confirmBookingsPayloadSchema,
    confirmBookingsPolicy,
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

      // Get project and its bookings
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      const bookings = await listBookingsByProject(mutationCtx.db, project._id)
      const tentativeBookings = bookings.filter((b) => b.type === 'Tentative')

      let confirmedCount = 0

      if (payload.confirmAll) {
        // Confirm all tentative bookings
        for (const booking of tentativeBookings) {
          await updateBooking(mutationCtx.db, booking._id, {
            type: 'Confirmed',
          })
          confirmedCount++
        }
      } else if (payload.selectiveConfirmations) {
        // Selective confirmation
        for (const selection of payload.selectiveConfirmations) {
          const booking = tentativeBookings.find((b) => b._id === selection.bookingId)
          if (!booking) continue

          if (selection.confirm) {
            await updateBooking(mutationCtx.db, booking._id, {
              type: 'Confirmed',
              notes: selection.reason
                ? `${booking.notes || ''}\nConfirmed: ${selection.reason}`.trim()
                : booking.notes,
            })
            confirmedCount++
          }
        }
      }

      // Update project status to Active if any bookings were confirmed
      if (confirmedCount > 0) {
        await updateProject(mutationCtx.db, project._id, {
          status: 'Active',
        })
      }

      // Bookings confirmed successfully
      // Notifications to affected users would be handled by a separate system
      console.log(`Confirmed ${confirmedCount} bookings for project ${project.name}`)
    },
  )

export const confirmBookingsWorkItem = Builder.workItem('confirmBookings')
  .withActions(confirmBookingsActions.build())

export const confirmBookingsTask = Builder.task(confirmBookingsWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item metadata
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:resources:confirm',
        payload: {
          type: 'confirmBookings',
          taskName: 'Confirm Bookings',
          projectId: project._id,
        },
      })
    },
  })
