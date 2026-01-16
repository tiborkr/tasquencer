/// <reference types="vite/client" />
/**
 * Test helper utilities for workflow tests
 *
 * P3.3: Shared test helpers for PSA Platform tests
 * - Organization/Company/User/Contact creation helpers
 * - Deal/Project setup helpers
 * - Authorization setup helper
 */

import { convexTest } from 'convex-test'
import { vi, it } from 'vitest'
import schema from '../schema'
import { authComponent } from '../auth'
import type { Doc, Id } from '../_generated/dataModel'
import type { DatabaseWriter } from '../_generated/server'
import { register as registerAuthorization } from '@repo/tasquencer/components/authorization/test'
import { register as registerAudit } from '@repo/tasquencer/components/audit/test'
import * as db from '../workflows/dealToDelivery/db'
import { internal } from '../_generated/api'

export const modules = import.meta.glob('../**/*.*s')

export function setup() {
  const t = convexTest(schema, modules)
  registerAuthorization(t, 'tasquencerAuthorization')
  registerAudit(t, 'tasquencerAudit')
  return t
}

export type TestContext = ReturnType<typeof setup>

type AuthUser = Awaited<ReturnType<typeof authComponent.getAuthUser>>

function makeMockAuthUser(userId: Id<'users'>): AuthUser {
  const now = Date.now()
  return {
    _id: 'test-auth-user' as AuthUser['_id'],
    _creationTime: now,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    userId: userId as unknown as string,
  }
}

/**
 * Wait for flush (allow scheduler to process)
 */
export async function waitForFlush(t: TestContext) {
  await vi.advanceTimersByTimeAsync(1000)
  await t.finishInProgressScheduledFunctions()
}

/**
 * Create a basic authenticated user with a test organization
 */
export async function setupAuthenticatedUser(t: TestContext) {
  const { userId, organizationId } = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Test Organization',
      settings: {},
      createdAt: Date.now(),
    })
    const userId = await ctx.db.insert('users', {
      organizationId,
      email: 'test@example.com',
      name: 'Test User',
      role: 'team_member',
      costRate: 5000, // $50/hr in cents
      billRate: 10000, // $100/hr in cents
      skills: [],
      department: 'Engineering',
      location: 'Remote',
      isActive: true,
    })
    return { userId, organizationId }
  })

  const mockAuthUser = makeMockAuthUser(userId as Id<'users'>)

  const safeAuthSpy = vi
    .spyOn(authComponent, 'safeGetAuthUser')
    .mockResolvedValue(mockAuthUser)
  const authSpy = vi
    .spyOn(authComponent, 'getAuthUser')
    .mockResolvedValue(mockAuthUser)

  return { userId, organizationId, authSpies: [safeAuthSpy, authSpy] }
}

// ============================================================================
// P3.3: AUTHORIZATION SETUP HELPER
// ============================================================================

/**
 * Setup Deal To Delivery authorization (roles, groups, assignments).
 * Runs the internal mutation that creates all predefined roles and groups.
 */
export async function setupDealToDeliveryAuthorization(t: TestContext) {
  const result = await t.mutation(
    internal.workflows.dealToDelivery.authSetup.setupDealToDeliveryAuthorization,
    {},
  )
  return result
}

// ============================================================================
// P3.3: ENTITY CREATION HELPERS
// ============================================================================

type OrganizationInput = Partial<Omit<Doc<'organizations'>, '_id' | '_creationTime'>>
type CompanyInput = Partial<Omit<Doc<'companies'>, '_id' | '_creationTime' | 'organizationId'>>
type UserInput = Partial<Omit<Doc<'users'>, '_id' | '_creationTime' | 'organizationId'>>
type ContactInput = Partial<Omit<Doc<'contacts'>, '_id' | '_creationTime' | 'organizationId' | 'companyId'>>
type DealInput = Partial<Omit<Doc<'deals'>, '_id' | '_creationTime' | 'organizationId' | 'companyId' | 'contactId' | 'ownerId'>>
type ProjectInput = Partial<Omit<Doc<'projects'>, '_id' | '_creationTime' | 'organizationId' | 'companyId' | 'managerId'>>
type BudgetInput = Partial<Omit<Doc<'budgets'>, '_id' | '_creationTime' | 'organizationId' | 'projectId'>>

/**
 * Create a test organization with default values.
 */
export async function createTestOrganization(
  dbWriter: DatabaseWriter,
  overrides: OrganizationInput = {},
): Promise<Id<'organizations'>> {
  return await db.insertOrganization(dbWriter, {
    name: 'Test Organization',
    settings: {},
    createdAt: Date.now(),
    ...overrides,
  })
}

/**
 * Create a test company with default values.
 */
export async function createTestCompany(
  dbWriter: DatabaseWriter,
  organizationId: Id<'organizations'>,
  overrides: CompanyInput = {},
): Promise<Id<'companies'>> {
  return await db.insertCompany(dbWriter, {
    organizationId,
    name: 'Test Company',
    billingAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'USA',
    },
    paymentTerms: 30,
    ...overrides,
  })
}

// User role type (from schema: admin, ceo_owner, operations_manager, project_manager,
// resource_manager, finance_accountant, sales_rep, team_member, client)
export type UserRole =
  | 'admin'
  | 'ceo_owner'
  | 'operations_manager'
  | 'project_manager'
  | 'resource_manager'
  | 'finance_accountant'
  | 'sales_rep'
  | 'team_member'
  | 'client'

/**
 * Create a test user with a specific role.
 */
export async function createTestUser(
  dbWriter: DatabaseWriter,
  organizationId: Id<'organizations'>,
  role: UserRole,
  overrides: UserInput = {},
): Promise<Id<'users'>> {
  const roleDefaults: Record<UserRole, Partial<UserInput>> = {
    admin: { name: 'Admin User', email: 'admin@test.com', department: 'Admin' },
    ceo_owner: { name: 'CEO', email: 'ceo@test.com', department: 'Executive' },
    operations_manager: { name: 'Operations Manager', email: 'ops@test.com', department: 'Operations' },
    project_manager: { name: 'Project Manager', email: 'pm@test.com', department: 'Operations' },
    resource_manager: { name: 'Resource Manager', email: 'rm@test.com', department: 'Operations' },
    finance_accountant: { name: 'Accountant', email: 'finance@test.com', department: 'Finance' },
    sales_rep: { name: 'Sales Rep', email: 'sales@test.com', department: 'Sales' },
    team_member: { name: 'Team Member', email: 'member@test.com', department: 'Engineering' },
    client: { name: 'Client User', email: 'client@test.com', department: 'External' },
  }

  const defaults = roleDefaults[role]

  return await db.insertUser(dbWriter, {
    organizationId,
    email: defaults.email ?? 'user@test.com',
    name: defaults.name ?? 'Test User',
    role,
    costRate: 5000, // $50/hr in cents
    billRate: 10000, // $100/hr in cents
    skills: [],
    department: defaults.department ?? 'Engineering',
    location: 'Remote',
    isActive: true,
    ...overrides,
  })
}

/**
 * Create a test contact with default values.
 */
export async function createTestContact(
  dbWriter: DatabaseWriter,
  organizationId: Id<'organizations'>,
  companyId: Id<'companies'>,
  overrides: ContactInput = {},
): Promise<Id<'contacts'>> {
  return await db.insertContact(dbWriter, {
    organizationId,
    companyId,
    name: 'Test Contact',
    email: 'contact@client.com',
    phone: '+1-555-123-4567',
    isPrimary: true,
    ...overrides,
  })
}

// ============================================================================
// P3.3: COMPOSITE SETUP HELPERS
// ============================================================================

export interface DealSetupResult {
  orgId: Id<'organizations'>
  companyId: Id<'companies'>
  ownerId: Id<'users'>
  contactId: Id<'contacts'>
  dealId: Id<'deals'>
}

/**
 * Create a complete deal test setup with all dependencies:
 * - Organization
 * - Company
 * - Sales Rep (owner)
 * - Contact
 * - Deal
 */
export async function createTestDealSetup(
  dbWriter: DatabaseWriter,
  overrides: { deal?: DealInput; organization?: OrganizationInput } = {},
): Promise<DealSetupResult> {
  const orgId = await createTestOrganization(dbWriter, overrides.organization)

  const companyId = await createTestCompany(dbWriter, orgId, {
    name: 'Client Corp',
  })

  const ownerId = await createTestUser(dbWriter, orgId, 'sales_rep', {
    skills: ['sales'],
  })

  const contactId = await createTestContact(dbWriter, orgId, companyId, {
    name: 'John Client',
    email: 'john@client.com',
  })

  const dealId = await db.insertDeal(dbWriter, {
    organizationId: orgId,
    companyId,
    contactId,
    name: 'Test Deal',
    value: 5000000, // $50,000 in cents
    ownerId,
    stage: 'Lead',
    probability: 10,
    createdAt: Date.now(),
    ...overrides.deal,
  })

  return { orgId, companyId, ownerId, contactId, dealId }
}

export interface ProjectSetupResult {
  orgId: Id<'organizations'>
  companyId: Id<'companies'>
  managerId: Id<'users'>
  developerId: Id<'users'>
  projectId: Id<'projects'>
}

/**
 * Create a complete project test setup with all dependencies:
 * - Organization
 * - Company
 * - Project Manager
 * - Team Member (developer)
 * - Project
 */
export async function createTestProjectSetup(
  dbWriter: DatabaseWriter,
  overrides: { project?: ProjectInput; organization?: OrganizationInput } = {},
): Promise<ProjectSetupResult> {
  const orgId = await createTestOrganization(dbWriter, overrides.organization)

  const companyId = await createTestCompany(dbWriter, orgId, {
    name: 'Client Corp',
  })

  const managerId = await createTestUser(dbWriter, orgId, 'project_manager', {
    costRate: 7500, // $75/hr
    billRate: 15000, // $150/hr
    skills: ['project_management'],
  })

  const developerId = await createTestUser(dbWriter, orgId, 'team_member', {
    email: 'dev@test.com',
    name: 'Developer',
    skills: ['typescript', 'react'],
    department: 'Engineering',
  })

  const projectId = await db.insertProject(dbWriter, {
    organizationId: orgId,
    companyId,
    name: 'Test Project',
    status: 'Active',
    startDate: Date.now(),
    managerId,
    createdAt: Date.now(),
    ...overrides.project,
  })

  return { orgId, companyId, managerId, developerId, projectId }
}

export interface ProjectWithBudgetResult extends ProjectSetupResult {
  budgetId: Id<'budgets'>
}

/**
 * Create a complete project test setup with budget:
 * - All project setup entities
 * - Budget linked to project
 */
export async function createTestProjectWithBudget(
  dbWriter: DatabaseWriter,
  overrides: {
    project?: ProjectInput
    organization?: OrganizationInput
    budget?: BudgetInput
  } = {},
): Promise<ProjectWithBudgetResult> {
  const { orgId, companyId, managerId, developerId, projectId } =
    await createTestProjectSetup(dbWriter, overrides)

  const budgetId = await db.insertBudget(dbWriter, {
    organizationId: orgId,
    projectId,
    type: 'TimeAndMaterials',
    totalAmount: 200000, // $2,000 in cents
    createdAt: Date.now(),
    ...overrides.budget,
  })

  // Link budget to project
  await db.updateProject(dbWriter, projectId, { budgetId })

  return { orgId, companyId, managerId, developerId, projectId, budgetId }
}

// ============================================================================
// P3.3: TEST HELPER TESTS
// ============================================================================

import { describe, expect, beforeEach } from 'vitest'

describe('P3.3 Test Helpers', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  describe('createTestOrganization', () => {
    it('creates an organization with default values', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await createTestOrganization(ctx.db)
        const org = await ctx.db.get(orgId)
        return { orgId, org }
      })

      expect(result.orgId).toBeDefined()
      expect(result.org?.name).toBe('Test Organization')
      expect(result.org?.settings).toEqual({})
    })

    it('creates an organization with overrides', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await createTestOrganization(ctx.db, {
          name: 'Custom Org',
          settings: { timezone: 'UTC' },
        })
        const org = await ctx.db.get(orgId)
        return { orgId, org }
      })

      expect(result.org?.name).toBe('Custom Org')
      expect(result.org?.settings).toEqual({ timezone: 'UTC' })
    })
  })

  describe('createTestCompany', () => {
    it('creates a company with default values', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await createTestOrganization(ctx.db)
        const companyId = await createTestCompany(ctx.db, orgId)
        const company = await ctx.db.get(companyId)
        return { companyId, company }
      })

      expect(result.companyId).toBeDefined()
      expect(result.company?.name).toBe('Test Company')
      expect(result.company?.paymentTerms).toBe(30)
      expect(result.company?.billingAddress.city).toBe('New York')
    })
  })

  describe('createTestUser', () => {
    it('creates a user with role-specific defaults', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await createTestOrganization(ctx.db)
        const salesRepId = await createTestUser(ctx.db, orgId, 'sales_rep')
        const projectManagerId = await createTestUser(ctx.db, orgId, 'project_manager')
        const salesRep = await ctx.db.get(salesRepId)
        const projectManager = await ctx.db.get(projectManagerId)
        return { salesRep, projectManager }
      })

      expect(result.salesRep?.role).toBe('sales_rep')
      expect(result.salesRep?.email).toBe('sales@test.com')
      expect(result.salesRep?.department).toBe('Sales')

      expect(result.projectManager?.role).toBe('project_manager')
      expect(result.projectManager?.email).toBe('pm@test.com')
      expect(result.projectManager?.department).toBe('Operations')
    })

    it('accepts overrides', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await createTestOrganization(ctx.db)
        const userId = await createTestUser(ctx.db, orgId, 'team_member', {
          name: 'Jane Doe',
          email: 'jane@test.com',
          skills: ['typescript', 'react'],
        })
        const user = await ctx.db.get(userId)
        return { user }
      })

      expect(result.user?.name).toBe('Jane Doe')
      expect(result.user?.email).toBe('jane@test.com')
      expect(result.user?.skills).toEqual(['typescript', 'react'])
    })
  })

  describe('createTestContact', () => {
    it('creates a contact with default values', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await createTestOrganization(ctx.db)
        const companyId = await createTestCompany(ctx.db, orgId)
        const contactId = await createTestContact(ctx.db, orgId, companyId)
        const contact = await ctx.db.get(contactId)
        return { contactId, contact }
      })

      expect(result.contactId).toBeDefined()
      expect(result.contact?.name).toBe('Test Contact')
      expect(result.contact?.email).toBe('contact@client.com')
      expect(result.contact?.isPrimary).toBe(true)
    })
  })

  describe('createTestDealSetup', () => {
    it('creates a complete deal setup with all dependencies', async () => {
      const result = await t.run(async (ctx) => {
        const setup = await createTestDealSetup(ctx.db)
        const deal = await ctx.db.get(setup.dealId)
        const owner = await ctx.db.get(setup.ownerId)
        return { ...setup, deal, owner }
      })

      expect(result.orgId).toBeDefined()
      expect(result.companyId).toBeDefined()
      expect(result.ownerId).toBeDefined()
      expect(result.contactId).toBeDefined()
      expect(result.dealId).toBeDefined()

      expect(result.deal?.name).toBe('Test Deal')
      expect(result.deal?.stage).toBe('Lead')
      expect(result.deal?.value).toBe(5000000)
      expect(result.owner?.role).toBe('sales_rep')
    })

    it('accepts deal overrides', async () => {
      const result = await t.run(async (ctx) => {
        const setup = await createTestDealSetup(ctx.db, {
          deal: { name: 'Big Deal', value: 10000000, stage: 'Qualified' },
        })
        const deal = await ctx.db.get(setup.dealId)
        return { deal }
      })

      expect(result.deal?.name).toBe('Big Deal')
      expect(result.deal?.value).toBe(10000000)
      expect(result.deal?.stage).toBe('Qualified')
    })
  })

  describe('createTestProjectSetup', () => {
    it('creates a complete project setup with all dependencies', async () => {
      const result = await t.run(async (ctx) => {
        const setup = await createTestProjectSetup(ctx.db)
        const project = await ctx.db.get(setup.projectId)
        const manager = await ctx.db.get(setup.managerId)
        const developer = await ctx.db.get(setup.developerId)
        return { ...setup, project, manager, developer }
      })

      expect(result.orgId).toBeDefined()
      expect(result.companyId).toBeDefined()
      expect(result.managerId).toBeDefined()
      expect(result.developerId).toBeDefined()
      expect(result.projectId).toBeDefined()

      expect(result.project?.name).toBe('Test Project')
      expect(result.project?.status).toBe('Active')
      expect(result.manager?.role).toBe('project_manager')
      expect(result.developer?.role).toBe('team_member')
    })
  })

  describe('createTestProjectWithBudget', () => {
    it('creates a complete project setup with budget', async () => {
      const result = await t.run(async (ctx) => {
        const setup = await createTestProjectWithBudget(ctx.db)
        const project = await ctx.db.get(setup.projectId)
        const budget = await ctx.db.get(setup.budgetId)
        return { ...setup, project, budget }
      })

      expect(result.budgetId).toBeDefined()
      expect(result.budget?.type).toBe('TimeAndMaterials')
      expect(result.budget?.totalAmount).toBe(200000)
      expect(result.project?.budgetId).toBe(result.budgetId)
    })

    it('accepts budget overrides', async () => {
      const result = await t.run(async (ctx) => {
        const setup = await createTestProjectWithBudget(ctx.db, {
          budget: { type: 'FixedFee', totalAmount: 500000 },
        })
        const budget = await ctx.db.get(setup.budgetId)
        return { budget }
      })

      expect(result.budget?.type).toBe('FixedFee')
      expect(result.budget?.totalAmount).toBe(500000)
    })
  })

  describe('setupDealToDeliveryAuthorization', () => {
    it('creates roles and groups', async () => {
      const result = await setupDealToDeliveryAuthorization(t)

      // Should have created 9 roles
      expect(Object.keys(result.roleIds)).toHaveLength(9)
      expect(result.roleIds['admin']).toBeDefined()
      expect(result.roleIds['project_manager']).toBeDefined()
      expect(result.roleIds['sales_rep']).toBeDefined()
      expect(result.roleIds['team_member']).toBeDefined()

      // Should have created 7 groups
      expect(Object.keys(result.groupIds)).toHaveLength(7)
      expect(result.groupIds['executives']).toBeDefined()
      expect(result.groupIds['managers']).toBeDefined()
      expect(result.groupIds['finance']).toBeDefined()
      expect(result.groupIds['sales']).toBeDefined()

      // Should have created 7 group-role assignments
      expect(result.assignmentCount).toBe(7)
    })
  })
})
