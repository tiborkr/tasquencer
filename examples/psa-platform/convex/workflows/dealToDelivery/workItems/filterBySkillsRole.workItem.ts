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

// Policy: requires resources:view:team scope to filter team members
const filterBySkillsRolePolicy = authService.policies.requireScope('dealToDelivery:resources:view:team')

// Schema for the complete action payload
const filterBySkillsRolePayloadSchema = z.object({
  skills: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  minAvailabilityPercent: z.number().min(0).max(100).optional(),
  startDate: z.number(), // For availability calculation
  endDate: z.number(),
})

const filterBySkillsRoleActions = authService.builders.workItemActions
  // Start action - user claims the work item
  .start(z.never(), filterBySkillsRolePolicy, async ({ mutationCtx, workItem }) => {
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
  // Complete action - filter users by skills and roles
  .complete(
    filterBySkillsRolePayloadSchema,
    filterBySkillsRolePolicy,
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

      // Filter users based on criteria
      const filteredUsers = []
      for (const user of users) {
        if (!user.isActive) continue

        // Filter by skills (if specified)
        if (payload.skills && payload.skills.length > 0) {
          const userSkills = user.skills || []
          const hasMatchingSkill = payload.skills.some((skill) =>
            userSkills.includes(skill)
          )
          if (!hasMatchingSkill) continue
        }

        // Filter by roles (if specified)
        if (payload.roles && payload.roles.length > 0) {
          if (!user.role || !payload.roles.includes(user.role)) continue
        }

        // Filter by departments (if specified)
        if (payload.departments && payload.departments.length > 0) {
          if (!user.department || !payload.departments.includes(user.department)) continue
        }

        // Filter by locations (if specified)
        if (payload.locations && payload.locations.length > 0) {
          if (!user.location || !payload.locations.includes(user.location)) continue
        }

        // Calculate availability if minimum threshold specified
        if (payload.minAvailabilityPercent !== undefined) {
          const utilization = await calculateUserUtilization(
            mutationCtx.db,
            user._id,
            payload.startDate,
            payload.endDate,
          )

          const availabilityPercent = 100 - utilization.utilizationPercent
          if (availabilityPercent < payload.minAvailabilityPercent) continue
        }

        filteredUsers.push(user)
      }

      // Sort by skill match score (users with more matching skills first)
      if (payload.skills && payload.skills.length > 0) {
        filteredUsers.sort((a, b) => {
          const aSkills = a.skills || []
          const bSkills = b.skills || []
          const aMatchCount = payload.skills!.filter((s) => aSkills.includes(s)).length
          const bMatchCount = payload.skills!.filter((s) => bSkills.includes(s)).length
          return bMatchCount - aMatchCount
        })
      }

      // The filtered user list is available for the next step (createBookings)
      // In practice, this would be stored in workflow context or passed through metadata
    },
  )

export const filterBySkillsRoleWorkItem = Builder.workItem('filterBySkillsRole')
  .withActions(filterBySkillsRoleActions.build())

export const filterBySkillsRoleTask = Builder.task(filterBySkillsRoleWorkItem)
  .withJoinType('xor') // May be entered from viewTeamAvailability or reviewBookings (loop)
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
          type: 'filterBySkillsRole',
          taskName: 'Filter by Skills/Role',
          projectId: project._id,
        },
      })
    },
  })
