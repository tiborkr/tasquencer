import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { AppScope } from '../../authorization'

/**
 * UcampaignUapproval workflow auth role and group constants
 */
export const AUTH_GREETING_ROLES = {
  GREETING_STAFF: 'LUcampaignUapproval_staff',
} as const

export const AUTH_GREETING_GROUPS = {
  GREETING_TEAM: 'LUcampaignUapproval_team',
} as const

/**
 * Setup LUcampaignUapproval workflow authorization (roles, groups, scopes)
 * Creates the necessary auth structures for LUcampaignUapproval workflow
 */
export const setupAuthUcampaignUapprovalAuthorization = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scopes: AppScope[] = ['LUcampaignUapproval:staff', 'LUcampaignUapproval:write']

    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      {
        roles: [
          {
            name: AUTH_GREETING_ROLES.GREETING_STAFF,
            description: 'Role for LUcampaignUapproval workflow staff',
            scopes,
            isActive: true,
          },
        ],
      },
    )

    // Create LUcampaignUapproval_team group
    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: AUTH_GREETING_GROUPS.GREETING_TEAM,
            description: 'UcampaignUapproval workflow team members',
            isActive: true,
          },
        ],
      },
    )

    const roleId = roleIds[0]
    const groupId = groupIds[0]

    if (!roleId || !groupId) {
      throw new Error(
        `Failed to create LUcampaignUapproval auth role/group (roles: ${roleIds.length}, groups: ${groupIds.length})`,
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
