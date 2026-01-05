import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { AppScope } from '../../authorization'

/**
 * Greeting workflow auth role and group constants
 */
export const AUTH_GREETING_ROLES = {
  GREETING_STAFF: 'greeting_staff',
} as const

export const AUTH_GREETING_GROUPS = {
  GREETING_TEAM: 'greeting_team',
} as const

/**
 * Setup greeting workflow authorization (roles, groups, scopes)
 * Creates the necessary auth structures for greeting workflow
 */
export const setupAuthGreetingAuthorization = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scopes: AppScope[] = ['greeting:staff', 'greeting:write']

    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      {
        roles: [
          {
            name: AUTH_GREETING_ROLES.GREETING_STAFF,
            description: 'Role for greeting workflow staff',
            scopes,
            isActive: true,
          },
        ],
      },
    )

    // Create greeting_team group
    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: AUTH_GREETING_GROUPS.GREETING_TEAM,
            description: 'Greeting workflow team members',
            isActive: true,
          },
        ],
      },
    )

    const roleId = roleIds[0]
    const groupId = groupIds[0]

    if (!roleId || !groupId) {
      throw new Error(
        `Failed to create greeting auth role/group (roles: ${roleIds.length}, groups: ${groupIds.length})`,
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
