import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { AppScope } from '../../authorization'

/**
 * Campaign approval workflow auth role and group constants
 */
export const AUTH_CAMPAIGN_ROLES = {
  CAMPAIGN_STAFF: 'campaign_approval_staff',
} as const

export const AUTH_CAMPAIGN_GROUPS = {
  CAMPAIGN_TEAM: 'campaign_approval_team',
} as const

/**
 * Setup campaign_approval workflow authorization (roles, groups, scopes)
 * Creates the necessary auth structures for campaign_approval workflow
 */
export const setupCampaignApprovalAuthorization = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scopes: AppScope[] = ['campaign_approval:staff', 'campaign_approval:write']

    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      {
        roles: [
          {
            name: AUTH_CAMPAIGN_ROLES.CAMPAIGN_STAFF,
            description: 'Role for campaign_approval workflow staff',
            scopes,
            isActive: true,
          },
        ],
      },
    )

    // Create campaign_approval_team group
    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: AUTH_CAMPAIGN_GROUPS.CAMPAIGN_TEAM,
            description: 'Campaign approval workflow team members',
            isActive: true,
          },
        ],
      },
    )

    const roleId = roleIds[0]
    const groupId = groupIds[0]

    if (!roleId || !groupId) {
      throw new Error(
        `Failed to create campaign_approval auth role/group (roles: ${roleIds.length}, groups: ${groupIds.length})`,
      )
    }

    // Assign the role to the group
    await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
      {
        assignments: [
          {
            groupId,
            roleId,
            assignedAt: Date.now(),
          },
        ],
      },
    )

    return { roleId, groupId }
  },
})
