import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { authService } from '../../../authorization'
import { authComponent } from '../../../auth'
import { isHumanClaim } from '@repo/tasquencer'
import invariant from 'tiny-invariant'
import {
  getProjectByWorkflowId,
  listUsersByOrganization,
  calculateUserUtilization,
} from '../db'
import { initializeHumanWorkItemAuth } from './authHelpers'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import type { Doc } from '../../../_generated/dataModel'

// Policy: requires resources:view:team scope to view team availability
const viewTeamAvailabilityPolicy = authService.policies.requireScope('dealToDelivery:resources:view:team')

// Schema for the complete action payload
const viewTeamAvailabilityPayloadSchema = z.object({
  startDate: z.number(), // Unix timestamp
  endDate: z.number(),   // Unix timestamp
})

// Type for user availability
export type UserAvailability = {
  userId: string
  user: Doc<'users'>
  availableHours: number
  bookedHours: number
  utilizationPercent: number
}

const viewTeamAvailabilityActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), viewTeamAvailabilityPolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - calculate team availability
  .complete(
    viewTeamAvailabilityPayloadSchema,
    viewTeamAvailabilityPolicy,
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

      // Get all users in the organization
      const users = await listUsersByOrganization(mutationCtx.db, project.organizationId)

      // Calculate availability for each user
      const teamAvailability: UserAvailability[] = []
      for (const user of users) {
        if (!user.isActive) continue

        const utilization = await calculateUserUtilization(
          mutationCtx.db,
          user._id,
          payload.startDate,
          payload.endDate,
        )

        teamAvailability.push({
          userId: user._id,
          user,
          availableHours: utilization.availableHours,
          bookedHours: utilization.bookedHours,
          utilizationPercent: utilization.utilizationPercent,
        })
      }

      // Store availability data in work item metadata for downstream tasks
      // Note: This data would typically be stored in a cache or passed through workflow context
      // For now, the complete action just calculates and validates the availability
    },
  )

export const viewTeamAvailabilityWorkItem = Builder.workItem('viewTeamAvailability')
  .withActions(viewTeamAvailabilityActions.build())

export const viewTeamAvailabilityTask = Builder.task(viewTeamAvailabilityWorkItem)
  .withActivities({
    onEnabled: async ({ workItem, mutationCtx, parent }) => {
      // Initialize the work item when the task is enabled
      const workItemId = await workItem.initialize()

      // Get project linked to this workflow
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      invariant(project, 'PROJECT_NOT_FOUND_FOR_WORKFLOW')

      // Initialize work item metadata (using human auth without aggregateTableId)
      await initializeHumanWorkItemAuth(mutationCtx, workItemId, {
        scope: 'dealToDelivery:resources:view:team',
        payload: {
          type: 'viewTeamAvailability',
          taskName: 'View Team Availability',
          projectId: project._id,
        },
      })
    },
  })
