import { components } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { AppScope } from '../../authorization'

// ============================================================================
// ROLE CONSTANTS
// ============================================================================

export const AUTH_DEAL_TO_DELIVERY_ROLES = {
  /** Full access to all organization features */
  ADMIN: 'admin',
  /** P&L visibility, strategic oversight, no operational tasks */
  CEO_OWNER: 'ceo_owner',
  /** Capacity planning, utilization tracking, resource oversight */
  OPERATIONS_MANAGER: 'operations_manager',
  /** Task management, budget tracking, team coordination */
  PROJECT_MANAGER: 'project_manager',
  /** Scheduling, availability management, skill-based allocation */
  RESOURCE_MANAGER: 'resource_manager',
  /** Invoicing, revenue recognition, expense tracking */
  FINANCE_ACCOUNTANT: 'finance_accountant',
  /** Deal management, proposal creation */
  SALES_REP: 'sales_rep',
  /** Time tracking, task completion, own work management */
  TEAM_MEMBER: 'team_member',
  /** Limited portal access for project visibility (external) */
  CLIENT: 'client',
} as const

// ============================================================================
// GROUP CONSTANTS
// ============================================================================

export const AUTH_DEAL_TO_DELIVERY_GROUPS = {
  /** C-level and owners */
  EXECUTIVES: 'executives',
  /** People managers (PM, Ops Manager) */
  MANAGERS: 'managers',
  /** Finance team (Accountants, Finance Director) */
  FINANCE: 'finance',
  /** Sales team (Sales Reps, Account Executives) */
  SALES: 'sales',
  /** Delivery team (Designers, Developers, Consultants) */
  DELIVERY: 'delivery',
  /** Resource planners (Resource Manager, Ops Manager) */
  RESOURCE_MANAGERS: 'resource_managers',
  /** Expense/time approvers (Managers with approval rights) */
  APPROVERS: 'approvers',
} as const

// ============================================================================
// ROLE SCOPE DEFINITIONS
// ============================================================================

const ALL_SCOPES: AppScope[] = [
  // Base staff scope
  'dealToDelivery:staff',

  // Deals
  'dealToDelivery:deals:create',
  'dealToDelivery:deals:delete',
  'dealToDelivery:deals:qualify',
  'dealToDelivery:deals:negotiate',
  'dealToDelivery:deals:close',
  'dealToDelivery:deals:view:own',
  'dealToDelivery:deals:view:team',
  'dealToDelivery:deals:view:all',
  'dealToDelivery:deals:edit:own',
  'dealToDelivery:deals:edit:all',

  // Proposals
  'dealToDelivery:proposals:create',
  'dealToDelivery:proposals:edit',
  'dealToDelivery:proposals:send',
  'dealToDelivery:proposals:view:own',
  'dealToDelivery:proposals:view:all',

  // Projects
  'dealToDelivery:projects:create',
  'dealToDelivery:projects:delete',
  'dealToDelivery:projects:close',
  'dealToDelivery:projects:view:own',
  'dealToDelivery:projects:view:team',
  'dealToDelivery:projects:view:all',
  'dealToDelivery:projects:edit:own',
  'dealToDelivery:projects:edit:all',

  // Tasks
  'dealToDelivery:tasks:create',
  'dealToDelivery:tasks:assign',
  'dealToDelivery:tasks:delete',
  'dealToDelivery:tasks:view:own',
  'dealToDelivery:tasks:view:team',
  'dealToDelivery:tasks:view:all',
  'dealToDelivery:tasks:edit:own',
  'dealToDelivery:tasks:edit:all',

  // Budgets
  'dealToDelivery:budgets:create',
  'dealToDelivery:budgets:edit',
  'dealToDelivery:budgets:approve',
  'dealToDelivery:budgets:view:own',
  'dealToDelivery:budgets:view:all',

  // Resources
  'dealToDelivery:resources:confirm',
  'dealToDelivery:resources:view:own',
  'dealToDelivery:resources:view:team',
  'dealToDelivery:resources:view:all',
  'dealToDelivery:resources:book:own',
  'dealToDelivery:resources:book:team',
  'dealToDelivery:resources:book:all',
  'dealToDelivery:resources:timeoff:own',
  'dealToDelivery:resources:timeoff:approve',

  // Time
  'dealToDelivery:time:submit',
  'dealToDelivery:time:approve',
  'dealToDelivery:time:lock',
  'dealToDelivery:time:view:own',
  'dealToDelivery:time:view:team',
  'dealToDelivery:time:view:all',
  'dealToDelivery:time:create:own',
  'dealToDelivery:time:edit:own',
  'dealToDelivery:time:edit:all',

  // Expenses
  'dealToDelivery:expenses:create',
  'dealToDelivery:expenses:submit',
  'dealToDelivery:expenses:approve',
  'dealToDelivery:expenses:view:own',
  'dealToDelivery:expenses:view:team',
  'dealToDelivery:expenses:view:all',
  'dealToDelivery:expenses:edit:own',

  // Invoices
  'dealToDelivery:invoices:create',
  'dealToDelivery:invoices:edit',
  'dealToDelivery:invoices:finalize',
  'dealToDelivery:invoices:send',
  'dealToDelivery:invoices:void',
  'dealToDelivery:invoices:view:own',
  'dealToDelivery:invoices:view:all',

  // Payments
  'dealToDelivery:payments:view',
  'dealToDelivery:payments:record',

  // Reports
  'dealToDelivery:reports:profitability',
  'dealToDelivery:reports:forecasting',
  'dealToDelivery:reports:view:own',
  'dealToDelivery:reports:view:team',
  'dealToDelivery:reports:view:all',

  // Admin
  'dealToDelivery:admin:users',
  'dealToDelivery:admin:settings',
  'dealToDelivery:admin:integrations',
  'dealToDelivery:admin:impersonate',
]

const CEO_OWNER_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:deals:view:all',
  'dealToDelivery:projects:view:all',
  'dealToDelivery:budgets:view:all',
  'dealToDelivery:invoices:view:all',
  'dealToDelivery:payments:view',
  'dealToDelivery:reports:profitability',
  'dealToDelivery:reports:forecasting',
  'dealToDelivery:reports:view:all',
]

const OPERATIONS_MANAGER_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:projects:view:all',
  'dealToDelivery:tasks:view:all',
  'dealToDelivery:resources:view:all',
  'dealToDelivery:resources:book:all',
  'dealToDelivery:resources:confirm',
  'dealToDelivery:resources:timeoff:approve',
  'dealToDelivery:time:view:all',
  'dealToDelivery:time:edit:all',
  'dealToDelivery:time:approve',
  'dealToDelivery:expenses:view:all',
  'dealToDelivery:expenses:approve',
  'dealToDelivery:reports:view:all',
  'dealToDelivery:budgets:view:all',
]

const PROJECT_MANAGER_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:deals:view:own',
  'dealToDelivery:projects:view:own',
  'dealToDelivery:projects:edit:own',
  'dealToDelivery:projects:close',
  'dealToDelivery:tasks:view:all',
  'dealToDelivery:tasks:create',
  'dealToDelivery:tasks:edit:all',
  'dealToDelivery:tasks:assign',
  'dealToDelivery:tasks:delete',
  'dealToDelivery:budgets:view:own',
  'dealToDelivery:resources:view:team',
  'dealToDelivery:resources:book:team',
  'dealToDelivery:time:view:team',
  'dealToDelivery:time:edit:all',
  'dealToDelivery:time:approve',
  'dealToDelivery:expenses:view:team',
  'dealToDelivery:expenses:approve',
  'dealToDelivery:reports:view:team',
]

const RESOURCE_MANAGER_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:projects:view:all',
  'dealToDelivery:tasks:view:all',
  'dealToDelivery:resources:view:all',
  'dealToDelivery:resources:book:all',
  'dealToDelivery:resources:confirm',
  'dealToDelivery:resources:timeoff:approve',
  'dealToDelivery:time:view:all',
  'dealToDelivery:reports:view:all',
]

const FINANCE_ACCOUNTANT_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:projects:view:all',
  'dealToDelivery:budgets:view:all',
  'dealToDelivery:time:view:all',
  'dealToDelivery:expenses:view:all',
  'dealToDelivery:invoices:view:all',
  'dealToDelivery:invoices:create',
  'dealToDelivery:invoices:edit',
  'dealToDelivery:invoices:finalize',
  'dealToDelivery:invoices:send',
  'dealToDelivery:invoices:void',
  'dealToDelivery:payments:view',
  'dealToDelivery:payments:record',
  'dealToDelivery:reports:profitability',
  'dealToDelivery:reports:view:all',
]

const SALES_REP_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:deals:view:own',
  'dealToDelivery:deals:create',
  'dealToDelivery:deals:edit:own',
  'dealToDelivery:deals:qualify',
  'dealToDelivery:proposals:view:own',
  'dealToDelivery:proposals:create',
  'dealToDelivery:proposals:edit',
  'dealToDelivery:proposals:send',
  'dealToDelivery:reports:forecasting',
]

const TEAM_MEMBER_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:projects:view:own',
  'dealToDelivery:tasks:view:own',
  'dealToDelivery:resources:view:own',
  'dealToDelivery:resources:timeoff:own',
  'dealToDelivery:time:view:own',
  'dealToDelivery:time:create:own',
  'dealToDelivery:time:edit:own',
  'dealToDelivery:time:submit',
  'dealToDelivery:expenses:view:own',
  'dealToDelivery:expenses:create',
  'dealToDelivery:expenses:edit:own',
  'dealToDelivery:expenses:submit',
]

const CLIENT_SCOPES: AppScope[] = [
  'dealToDelivery:projects:view:own',
  'dealToDelivery:tasks:view:own',
  'dealToDelivery:budgets:view:own',
  'dealToDelivery:invoices:view:own',
]

// ============================================================================
// SETUP MUTATIONS
// ============================================================================

/**
 * Setup Deal To Delivery workflow authorization (roles, groups, assignments).
 * Creates all predefined roles with their scope bundles and groups.
 * Should be run once during initial setup.
 */
export const setupDealToDeliveryAuthorization = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Create all roles
    const roleIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthRoles,
      {
        roles: [
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.ADMIN,
            description: 'Full access to all organization features',
            scopes: ALL_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.CEO_OWNER,
            description: 'P&L visibility, strategic oversight, no operational tasks',
            scopes: CEO_OWNER_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.OPERATIONS_MANAGER,
            description: 'Capacity planning, utilization tracking, resource oversight',
            scopes: OPERATIONS_MANAGER_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.PROJECT_MANAGER,
            description: 'Task management, budget tracking, team coordination',
            scopes: PROJECT_MANAGER_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.RESOURCE_MANAGER,
            description: 'Scheduling, availability management, skill-based allocation',
            scopes: RESOURCE_MANAGER_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.FINANCE_ACCOUNTANT,
            description: 'Invoicing, revenue recognition, expense tracking',
            scopes: FINANCE_ACCOUNTANT_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.SALES_REP,
            description: 'Deal management, proposal creation',
            scopes: SALES_REP_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.TEAM_MEMBER,
            description: 'Time tracking, task completion, own work management',
            scopes: TEAM_MEMBER_SCOPES,
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_ROLES.CLIENT,
            description: 'Limited portal access for project visibility (external)',
            scopes: CLIENT_SCOPES,
            isActive: true,
          },
        ],
      },
    )

    // Create all groups
    const groupIds = await ctx.runMutation(
      components.tasquencerAuthorization.api.insertAuthGroups,
      {
        groups: [
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.EXECUTIVES,
            description: 'C-level and owners',
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.MANAGERS,
            description: 'People managers (PM, Ops Manager)',
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.FINANCE,
            description: 'Finance team (Accountants, Finance Director)',
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.SALES,
            description: 'Sales team (Sales Reps, Account Executives)',
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.DELIVERY,
            description: 'Delivery team (Designers, Developers, Consultants)',
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.RESOURCE_MANAGERS,
            description: 'Resource planners (Resource Manager, Ops Manager)',
            isActive: true,
          },
          {
            name: AUTH_DEAL_TO_DELIVERY_GROUPS.APPROVERS,
            description: 'Expense/time approvers (Managers with approval rights)',
            isActive: true,
          },
        ],
      },
    )

    // Map role names to IDs
    const roleNameToId: Record<string, string> = {}
    const roleNames = Object.values(AUTH_DEAL_TO_DELIVERY_ROLES)
    roleNames.forEach((name, index) => {
      if (roleIds[index]) {
        roleNameToId[name] = roleIds[index]
      }
    })

    // Map group names to IDs
    const groupNameToId: Record<string, string> = {}
    const groupNames = Object.values(AUTH_DEAL_TO_DELIVERY_GROUPS)
    groupNames.forEach((name, index) => {
      if (groupIds[index]) {
        groupNameToId[name] = groupIds[index]
      }
    })

    const now = Date.now()

    // Default group-role assignments
    const assignments = [
      // Executives get CEO/Owner role
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.EXECUTIVES],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.CEO_OWNER],
        assignedAt: now,
      },
      // Managers get Project Manager role
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.MANAGERS],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.PROJECT_MANAGER],
        assignedAt: now,
      },
      // Finance gets Finance/Accountant role
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.FINANCE],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.FINANCE_ACCOUNTANT],
        assignedAt: now,
      },
      // Sales gets Sales Rep role
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.SALES],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.SALES_REP],
        assignedAt: now,
      },
      // Delivery gets Team Member role
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.DELIVERY],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.TEAM_MEMBER],
        assignedAt: now,
      },
      // Resource Managers get Resource Manager role
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.RESOURCE_MANAGERS],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.RESOURCE_MANAGER],
        assignedAt: now,
      },
      // Approvers get Operations Manager role (includes approval scopes)
      {
        groupId: groupNameToId[AUTH_DEAL_TO_DELIVERY_GROUPS.APPROVERS],
        roleId: roleNameToId[AUTH_DEAL_TO_DELIVERY_ROLES.OPERATIONS_MANAGER],
        assignedAt: now,
      },
    ].filter((a) => a.groupId && a.roleId)

    if (assignments.length > 0) {
      await ctx.runMutation(
        components.tasquencerAuthorization.api.insertAuthGroupRoleAssignments,
        { assignments },
      )
    }

    return {
      roleIds: roleNameToId,
      groupIds: groupNameToId,
      assignmentCount: assignments.length,
    }
  },
})
