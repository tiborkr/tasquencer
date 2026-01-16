import { internalMutation } from '../../_generated/server'
import { components } from '../../_generated/api'
import { authService } from '../../authorization'
import type { AppScope } from '../../authorization'
import * as db from './db'
import { AUTH_DEAL_TO_DELIVERY_ROLES } from './authSetup'

// Inline scope definitions for scaffold (duplicated from authSetup to avoid circular reference)
const ALL_SCOPES: AppScope[] = [
  'dealToDelivery:staff',
  'dealToDelivery:deals:create', 'dealToDelivery:deals:delete', 'dealToDelivery:deals:qualify',
  'dealToDelivery:deals:negotiate', 'dealToDelivery:deals:close',
  'dealToDelivery:deals:view:own', 'dealToDelivery:deals:view:team', 'dealToDelivery:deals:view:all',
  'dealToDelivery:deals:edit:own', 'dealToDelivery:deals:edit:all',
  'dealToDelivery:proposals:create', 'dealToDelivery:proposals:edit', 'dealToDelivery:proposals:send',
  'dealToDelivery:proposals:view:own', 'dealToDelivery:proposals:view:all',
  'dealToDelivery:projects:create', 'dealToDelivery:projects:delete', 'dealToDelivery:projects:close',
  'dealToDelivery:projects:view:own', 'dealToDelivery:projects:view:team', 'dealToDelivery:projects:view:all',
  'dealToDelivery:projects:edit:own', 'dealToDelivery:projects:edit:all',
  'dealToDelivery:tasks:create', 'dealToDelivery:tasks:assign', 'dealToDelivery:tasks:delete',
  'dealToDelivery:tasks:view:own', 'dealToDelivery:tasks:view:team', 'dealToDelivery:tasks:view:all',
  'dealToDelivery:tasks:edit:own', 'dealToDelivery:tasks:edit:all',
  'dealToDelivery:budgets:create', 'dealToDelivery:budgets:edit', 'dealToDelivery:budgets:approve',
  'dealToDelivery:budgets:view:own', 'dealToDelivery:budgets:view:all',
  'dealToDelivery:resources:confirm',
  'dealToDelivery:resources:view:own', 'dealToDelivery:resources:view:team', 'dealToDelivery:resources:view:all',
  'dealToDelivery:resources:book:own', 'dealToDelivery:resources:book:team', 'dealToDelivery:resources:book:all',
  'dealToDelivery:resources:timeoff:own', 'dealToDelivery:resources:timeoff:approve',
  'dealToDelivery:time:submit', 'dealToDelivery:time:approve', 'dealToDelivery:time:lock',
  'dealToDelivery:time:view:own', 'dealToDelivery:time:view:team', 'dealToDelivery:time:view:all',
  'dealToDelivery:time:create:own', 'dealToDelivery:time:edit:own', 'dealToDelivery:time:edit:all',
  'dealToDelivery:expenses:create', 'dealToDelivery:expenses:submit', 'dealToDelivery:expenses:approve',
  'dealToDelivery:expenses:view:own', 'dealToDelivery:expenses:view:team', 'dealToDelivery:expenses:view:all',
  'dealToDelivery:expenses:edit:own',
  'dealToDelivery:invoices:create', 'dealToDelivery:invoices:edit', 'dealToDelivery:invoices:finalize',
  'dealToDelivery:invoices:send', 'dealToDelivery:invoices:void',
  'dealToDelivery:invoices:view:own', 'dealToDelivery:invoices:view:all',
  'dealToDelivery:payments:view', 'dealToDelivery:payments:record',
  'dealToDelivery:reports:profitability', 'dealToDelivery:reports:forecasting',
  'dealToDelivery:reports:view:own', 'dealToDelivery:reports:view:team', 'dealToDelivery:reports:view:all',
  'dealToDelivery:admin:users', 'dealToDelivery:admin:settings', 'dealToDelivery:admin:integrations', 'dealToDelivery:admin:impersonate',
]

/**
 * Scaffold mutation for PSA Platform.
 * Sets up authorization, creates seed organization, users, and sample data.
 * Should be run once during initial setup after the first user registers.
 */
export const scaffold = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Create admin role with all scopes
    const adminRoleId = await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthRole,
      {
        name: AUTH_DEAL_TO_DELIVERY_ROLES.ADMIN,
        description: 'Full access to all organization features',
        scopes: ALL_SCOPES,
      },
    )

    // 2. Check if there's exactly one user (the initial admin who registered)
    const users = await ctx.db.query('users').collect()
    if (users.length !== 1) {
      throw new Error(
        `Expected exactly 1 user for scaffold, found ${users.length}. ` +
        `Run this mutation after the first user registers.`
      )
    }
    const firstUser = users[0]

    // 3. Create seed organization
    const organizationId = await db.insertOrganization(ctx.db, {
      name: 'Acme Consulting',
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
        fiscalYearStart: 1, // January
        weekStartDay: 1, // Monday
        defaultPaymentTerms: 30,
        timeEntryRounding: 15, // 15-minute increments
        requireApprovals: true,
        allowFutureTimeEntries: false,
      },
      createdAt: Date.now(),
    })

    // 4. Update the first user with organization and admin role
    await db.updateUser(ctx.db, firstUser._id, {
      organizationId,
      name: firstUser.name ?? 'Admin User',
      role: AUTH_DEAL_TO_DELIVERY_ROLES.ADMIN,
      costRate: 7500, // $75/hr internal cost
      billRate: 15000, // $150/hr billing rate
      skills: ['management', 'strategy'],
      department: 'Leadership',
      location: 'Headquarters',
      isActive: true,
    })

    // 5. Assign admin role to first user
    await ctx.runMutation(
      components.tasquencerAuthorization.api.assignAuthRoleToUser,
      { userId: firstUser._id, roleId: adminRoleId },
    )

    // 6. Create sample rate card
    const rateCardId = await db.insertRateCard(ctx.db, {
      organizationId,
      name: 'Standard Rates',
      isDefault: true,
      createdAt: Date.now(),
    })

    // 7. Create rate card items
    const standardRates = [
      { serviceName: 'Strategy Consulting', rate: 25000 }, // $250/hr
      { serviceName: 'Project Management', rate: 17500 }, // $175/hr
      { serviceName: 'Development', rate: 15000 }, // $150/hr
      { serviceName: 'Design', rate: 12500 }, // $125/hr
      { serviceName: 'Quality Assurance', rate: 10000 }, // $100/hr
      { serviceName: 'Support', rate: 7500 }, // $75/hr
    ]

    for (const item of standardRates) {
      await db.insertRateCardItem(ctx.db, {
        rateCardId,
        serviceName: item.serviceName,
        rate: item.rate,
      })
    }

    return {
      organizationId,
      adminUserId: firstUser._id,
      adminRoleId,
      rateCardId,
      rateCardItemCount: standardRates.length,
    }
  },
})

/**
 * Scaffold superadmin for initial user.
 * Creates a superadmin role with all registered scopes and assigns to first user.
 * This is a simpler scaffold for quick setup without full organization data.
 */
export const scaffoldSuperadmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Check if there's exactly one user
    const users = await ctx.db.query('users').collect()
    if (users.length !== 1) {
      throw new Error(`Expected exactly 1 user, found ${users.length}`)
    }
    const user = users[0]

    // 2. Get all registered scopes from authService
    const allScopes = Object.keys(authService.scopes)

    const existingRole = await ctx.runQuery(
      components.tasquencerAuthorization.api.getAuthRoleByName,
      { name: 'superadmin' },
    )

    let roleId: string

    if (existingRole) {
      // Sync scopes if role exists - update to match code-defined scopes
      await ctx.runMutation(
        components.tasquencerAuthorization.api.updateAuthRole,
        { roleId: existingRole._id, scopes: allScopes },
      )
      roleId = existingRole._id
    } else {
      roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: 'superadmin',
          description: 'Full access to all PSA Platform scopes',
          scopes: allScopes,
        },
      )
    }

    // 4. Check if user already has this role assigned
    const existingAssignment = await ctx.runQuery(
      components.tasquencerAuthorization.api.getUserAuthRoleAssignments,
      { userId: user._id },
    )

    const hasSuperadminRole = existingAssignment.some(
      (assignment) => assignment.roleId === roleId,
    )

    if (!hasSuperadminRole) {
      // Assign role directly to user
      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        { userId: user._id, roleId: roleId },
      )
    }

    return {
      userId: user._id,
      roleId,
      scopeCount: allScopes.length,
      created: !existingRole,
      synced: !!existingRole,
    }
  },
})

/**
 * Scaffold organization only.
 * Creates organization and links to first user without touching roles.
 * Use when scaffoldSuperadmin was already run.
 */
export const scaffoldOrganization = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Check if there's exactly one user
    const users = await ctx.db.query('users').collect()
    if (users.length !== 1) {
      throw new Error(`Expected exactly 1 user, found ${users.length}`)
    }
    const user = users[0]

    // 2. Check if user already has an organization
    if (user.organizationId) {
      return {
        organizationId: user.organizationId,
        userId: user._id,
        alreadyExists: true,
      }
    }

    // 3. Create seed organization
    const organizationId = await db.insertOrganization(ctx.db, {
      name: 'Acme Consulting',
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
        fiscalYearStart: 1,
        weekStartDay: 1,
        defaultPaymentTerms: 30,
        timeEntryRounding: 15,
        requireApprovals: true,
        allowFutureTimeEntries: false,
      },
      createdAt: Date.now(),
    })

    // 4. Update user with organization
    await db.updateUser(ctx.db, user._id, {
      organizationId,
      name: user.name ?? 'Admin User',
      costRate: 7500,
      billRate: 15000,
      skills: ['management', 'strategy'],
      department: 'Leadership',
      location: 'Headquarters',
      isActive: true,
    })

    // 5. Create sample rate card
    const rateCardId = await db.insertRateCard(ctx.db, {
      organizationId,
      name: 'Standard Rates',
      isDefault: true,
      createdAt: Date.now(),
    })

    // 6. Create rate card items
    const standardRates = [
      { serviceName: 'Strategy Consulting', rate: 25000 },
      { serviceName: 'Project Management', rate: 17500 },
      { serviceName: 'Development', rate: 15000 },
      { serviceName: 'Design', rate: 12500 },
      { serviceName: 'Quality Assurance', rate: 10000 },
      { serviceName: 'Support', rate: 7500 },
    ]

    for (const item of standardRates) {
      await db.insertRateCardItem(ctx.db, {
        rateCardId,
        serviceName: item.serviceName,
        rate: item.rate,
      })
    }

    return {
      organizationId,
      userId: user._id,
      rateCardId,
      rateCardItemCount: standardRates.length,
      alreadyExists: false,
    }
  },
})
