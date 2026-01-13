import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { AppScope } from '../../authorization'

/**
 * Campaign Approval Workflow Authorization Setup
 *
 * Defines all roles and groups for the 8-phase campaign approval workflow.
 * Each role has specific scopes determining what actions users can perform.
 * Groups represent organizational teams that are assigned roles.
 *
 * Scope format: campaign:<scopename> (flattened, no nested colons)
 */

/**
 * Role constants - 10 distinct roles for the campaign workflow
 * Each role represents a specific function in the campaign approval process.
 */
export const AUTH_CAMPAIGN_ROLES = {
  // Initiation phase roles
  CAMPAIGN_REQUESTER: 'campaign_requester',
  CAMPAIGN_COORDINATOR: 'campaign_coordinator',

  // Strategy & management roles
  CAMPAIGN_MANAGER: 'campaign_manager',

  // Creative roles
  CAMPAIGN_CREATIVE: 'campaign_creative',
  CAMPAIGN_CREATIVE_LEAD: 'campaign_creative_lead',

  // Compliance roles
  CAMPAIGN_LEGAL: 'campaign_legal',

  // Technical roles
  CAMPAIGN_OPS: 'campaign_ops',
  CAMPAIGN_MEDIA: 'campaign_media',

  // Approval authority roles (tiered)
  CAMPAIGN_DIRECTOR: 'campaign_director',
  CAMPAIGN_EXECUTIVE: 'campaign_executive',
} as const

/**
 * Group constants - 10 groups representing organizational teams
 * Groups are assigned roles to grant their members the appropriate scopes.
 */
export const AUTH_CAMPAIGN_GROUPS = {
  // Marketing teams
  MARKETING_REQUESTERS: 'marketing_requesters',
  MARKETING_COORDINATORS: 'marketing_coordinators',
  CAMPAIGN_MANAGERS_GROUP: 'campaign_managers_group',

  // Creative teams
  CREATIVE_TEAM: 'creative_team',
  CREATIVE_LEADS_GROUP: 'creative_leads_group',

  // Support teams
  LEGAL_TEAM: 'legal_team',
  MARKETING_OPS_TEAM: 'marketing_ops_team',
  MEDIA_TEAM: 'media_team',

  // Leadership teams
  MARKETING_DIRECTORS_GROUP: 'marketing_directors_group',
  MARKETING_EXECUTIVES_GROUP: 'marketing_executives_group',
} as const

/**
 * Role to scopes mapping
 * Defines which scopes each role is granted access to.
 * Scope names are flattened (using underscores) to work with the scope module.
 */
const ROLE_SCOPES: Record<
  (typeof AUTH_CAMPAIGN_ROLES)[keyof typeof AUTH_CAMPAIGN_ROLES],
  AppScope[]
> = {
  // Requester: Can view and submit campaign requests
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_REQUESTER]: ['campaign:read', 'campaign:request'],

  // Coordinator: Can review intake and manage campaigns
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_COORDINATOR]: [
    'campaign:read',
    'campaign:intake',
    'campaign:manage',
  ],

  // Manager: Can manage campaigns and review creatives
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_MANAGER]: [
    'campaign:read',
    'campaign:manage',
    'campaign:creative_review',
  ],

  // Creative: Can view and create/edit creative assets
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_CREATIVE]: ['campaign:read', 'campaign:creative_write'],

  // Creative Lead: Can create, edit, and review creative assets
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_CREATIVE_LEAD]: [
    'campaign:read',
    'campaign:creative_write',
    'campaign:creative_review',
  ],

  // Legal: Can view and perform legal compliance review
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_LEGAL]: ['campaign:read', 'campaign:legal_review'],

  // Ops: Can view and perform technical operations
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_OPS]: ['campaign:read', 'campaign:ops'],

  // Media: Can view and manage paid media
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_MEDIA]: ['campaign:read', 'campaign:media'],

  // Director: Can manage, approve low budgets (<$50K), and approve launch
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_DIRECTOR]: [
    'campaign:read',
    'campaign:manage',
    'campaign:budget_approve_low',
    'campaign:launch_approve',
  ],

  // Executive: Full approval authority including high budgets (>=$50K)
  [AUTH_CAMPAIGN_ROLES.CAMPAIGN_EXECUTIVE]: [
    'campaign:read',
    'campaign:manage',
    'campaign:budget_approve_low',
    'campaign:budget_approve_high',
    'campaign:launch_approve',
  ],
}

/**
 * Group to role mapping
 * Defines which role each group is assigned.
 */
const GROUP_ROLE_MAPPING: Record<
  (typeof AUTH_CAMPAIGN_GROUPS)[keyof typeof AUTH_CAMPAIGN_GROUPS],
  (typeof AUTH_CAMPAIGN_ROLES)[keyof typeof AUTH_CAMPAIGN_ROLES]
> = {
  [AUTH_CAMPAIGN_GROUPS.MARKETING_REQUESTERS]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_REQUESTER,
  [AUTH_CAMPAIGN_GROUPS.MARKETING_COORDINATORS]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_COORDINATOR,
  [AUTH_CAMPAIGN_GROUPS.CAMPAIGN_MANAGERS_GROUP]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_MANAGER,
  [AUTH_CAMPAIGN_GROUPS.CREATIVE_TEAM]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_CREATIVE,
  [AUTH_CAMPAIGN_GROUPS.CREATIVE_LEADS_GROUP]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_CREATIVE_LEAD,
  [AUTH_CAMPAIGN_GROUPS.LEGAL_TEAM]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_LEGAL,
  [AUTH_CAMPAIGN_GROUPS.MARKETING_OPS_TEAM]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_OPS,
  [AUTH_CAMPAIGN_GROUPS.MEDIA_TEAM]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_MEDIA,
  [AUTH_CAMPAIGN_GROUPS.MARKETING_DIRECTORS_GROUP]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_DIRECTOR,
  [AUTH_CAMPAIGN_GROUPS.MARKETING_EXECUTIVES_GROUP]: AUTH_CAMPAIGN_ROLES.CAMPAIGN_EXECUTIVE,
}

/**
 * Setup campaign approval workflow authorization
 *
 * Creates all roles, groups, and role-to-group assignments needed for the
 * 8-phase campaign approval workflow. This mutation should be run once
 * during initial setup.
 *
 * @returns Object containing arrays of created role IDs and group IDs
 */
export const setupCampaignApprovalAuthorization = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Create all 10 roles with their respective scopes
    const roleEntries = Object.entries(AUTH_CAMPAIGN_ROLES) as [
      keyof typeof AUTH_CAMPAIGN_ROLES,
      (typeof AUTH_CAMPAIGN_ROLES)[keyof typeof AUTH_CAMPAIGN_ROLES],
    ][]

    const roles = roleEntries.map(([_key, roleName]) => ({
      name: roleName,
      description: `Role for ${roleName.replace(/_/g, ' ')} in campaign workflow`,
      scopes: ROLE_SCOPES[roleName],
      isActive: true,
    }))

    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      { roles },
    )

    // Create all 10 groups
    const groupEntries = Object.entries(AUTH_CAMPAIGN_GROUPS) as [
      keyof typeof AUTH_CAMPAIGN_GROUPS,
      (typeof AUTH_CAMPAIGN_GROUPS)[keyof typeof AUTH_CAMPAIGN_GROUPS],
    ][]

    const groups = groupEntries.map(([_key, groupName]) => ({
      name: groupName,
      description: `Group for ${groupName.replace(/_/g, ' ')} members`,
      isActive: true,
    }))

    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      { groups },
    )

    // Build role name to ID mapping
    const roleNameToId = new Map<string, string>()
    roleEntries.forEach(([_key, roleName], index) => {
      const roleId = roleIds[index]
      if (roleId) {
        roleNameToId.set(roleName, roleId)
      }
    })

    // Build group name to ID mapping
    const groupNameToId = new Map<string, string>()
    groupEntries.forEach(([_key, groupName], index) => {
      const groupId = groupIds[index]
      if (groupId) {
        groupNameToId.set(groupName, groupId)
      }
    })

    // Create role-to-group assignments
    const assignments = groupEntries
      .map(([_key, groupName]) => {
        const groupId = groupNameToId.get(groupName)
        const roleName = GROUP_ROLE_MAPPING[groupName]
        const roleId = roleNameToId.get(roleName)

        if (!groupId || !roleId) {
          return null
        }

        return {
          groupId,
          roleId,
          assignedAt: Date.now(),
        }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    if (assignments.length !== groupEntries.length) {
      throw new Error(
        `Failed to create all role-group assignments. Expected ${groupEntries.length}, got ${assignments.length}`,
      )
    }

    await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
      { assignments },
    )

    return {
      roleIds,
      groupIds,
      rolesCreated: roleIds.length,
      groupsCreated: groupIds.length,
      assignmentsCreated: assignments.length,
    }
  },
})
