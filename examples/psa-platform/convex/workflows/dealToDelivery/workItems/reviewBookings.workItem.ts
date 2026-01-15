import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listBookingsByProject,
  calculateUserUtilization,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

// Policy: requires resources:view:team scope to review bookings
const reviewBookingsPolicy = authService.policies.requireScope('dealToDelivery:resources:view:team')

// Schema for the complete action payload
const reviewBookingsPayloadSchema = z.object({
  approved: z.boolean(), // true = proceed to confirmation, false = go back to filter
})

const reviewBookingsActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), reviewBookingsPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - review bookings and decide next step
  .complete(
    reviewBookingsPayloadSchema,
    reviewBookingsPolicy,
    async ({ mutationCtx, workItem, parent }, _payload) => {
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

      // Check for conflicts (over-allocation)
      const conflicts: string[] = []
      const userIds = [...new Set(bookings.map((b) => b.userId))]

      for (const bookingUserId of userIds) {
        const userBookings = bookings.filter((b) => b.userId === bookingUserId)
        if (userBookings.length === 0) continue

        // Get date range for this project's bookings
        const startDate = Math.min(...userBookings.map((b) => b.startDate))
        const endDate = Math.max(...userBookings.map((b) => b.endDate))

        const utilization = await calculateUserUtilization(
          mutationCtx.db,
          bookingUserId,
          startDate,
          endDate,
        )

        if (utilization.utilizationPercent > 100) {
          conflicts.push(
            `User ${bookingUserId} over-allocated at ${utilization.utilizationPercent.toFixed(0)}%`
          )
        }
      }

      // Log conflicts as warnings (in practice, would be shown to user)
      if (conflicts.length > 0) {
        console.warn('Booking conflicts detected:', conflicts)
      }

      // Store the routing decision in the work item metadata
      // If not approved, workflow routes back to filterBySkillsRole
      // If approved, workflow proceeds to checkConfirmationNeeded
      // Note: must use explicit object to satisfy discriminated union type
      await mutationCtx.db.patch(metadata._id, {
        payload: {
          type: 'reviewBookings' as const,
          taskName: metadata.payload.taskName,
          projectId: project._id,
          approved: _payload.approved,
          hasConflicts: conflicts.length > 0,
          reviewedAt: Date.now(),
        },
      })
    },
  )

export const reviewBookingsWorkItem = Builder.workItem('reviewBookings')
  .withActions(reviewBookingsActions.build())

export const reviewBookingsTask = Builder.task(reviewBookingsWorkItem)
  .withSplitType('xor') // Routes to either filterBySkillsRole (revise) or checkConfirmationNeeded (proceed)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item metadata
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:resources:view:team',
        payload: {
          type: 'reviewBookings',
          taskName: 'Review Bookings',
          projectId: project._id,
        },
      })
    },
  })
