/// <reference types="vite/client" />
/**
 * Database operations unit tests for PSA Platform
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, setupAuthenticatedUser, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { Id, Doc } from '../_generated/dataModel'

describe('PSA Platform Database Operations', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // ORGANIZATION TESTS
  // ============================================================================

  describe('Organizations', () => {
    it('creates and retrieves an organization', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Corp',
          settings: { timezone: 'America/New_York' },
          createdAt: Date.now(),
        })

        const org = await db.getOrganization(ctx.db, orgId)
        return { orgId, org }
      })

      expect(result.orgId).toBeDefined()
      expect(result.org).not.toBeNull()
      expect(result.org?.name).toBe('Test Corp')
    })

    it('updates an organization', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Original Name',
          settings: {},
          createdAt: Date.now(),
        })

        await db.updateOrganization(ctx.db, orgId, { name: 'Updated Name' })
        return await db.getOrganization(ctx.db, orgId)
      })

      expect(result?.name).toBe('Updated Name')
    })
  })

  // ============================================================================
  // USER TESTS
  // ============================================================================

  describe('Users', () => {
    it('creates and retrieves users by organization', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'user1@test.com',
          name: 'User One',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: ['typescript', 'react'],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'user2@test.com',
          name: 'User Two',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: ['management'],
          department: 'Operations',
          location: 'NYC',
          isActive: true,
        })

        return await db.listUsersByOrganization(ctx.db, orgId)
      })

      expect(result).toHaveLength(2)
      expect(result.map((u) => u.email)).toContain('user1@test.com')
      expect(result.map((u) => u.email)).toContain('user2@test.com')
    })

    it('finds user by email within organization', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'unique@test.com',
          name: 'Unique User',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        return await db.getUserByEmail(ctx.db, orgId, 'unique@test.com')
      })

      expect(result).not.toBeNull()
      expect(result?.email).toBe('unique@test.com')
    })

    it('filters active users', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'active@test.com',
          name: 'Active User',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'inactive@test.com',
          name: 'Inactive User',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: false,
        })

        return await db.listActiveUsers(ctx.db, orgId)
      })

      expect(result).toHaveLength(1)
      expect(result[0].email).toBe('active@test.com')
    })
  })

  // ============================================================================
  // DEAL TESTS
  // ============================================================================

  describe('Deals', () => {
    it('creates deals with required fields', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Doe',
          email: 'john@client.com',
          phone: '555-1234',
          isPrimary: true,
        })

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'sales@test.com',
          name: 'Sales Rep',
          role: 'sales_rep',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Sales',
          location: 'Remote',
          isActive: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Website Redesign',
          value: 5000000, // $50,000 in cents
          probability: 25,
          stage: 'Lead',
          ownerId: userId,
          createdAt: Date.now(),
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Website Redesign')
      expect(result?.value).toBe(5000000)
      expect(result?.stage).toBe('Lead')
    })

    it('lists deals by stage', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Doe',
          email: 'john@client.com',
          phone: '555-1234',
          isPrimary: true,
        })

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'sales@test.com',
          name: 'Sales Rep',
          role: 'sales_rep',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Sales',
          location: 'Remote',
          isActive: true,
        })

        // Create deals in different stages
        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Lead Deal 1',
          value: 1000000,
          probability: 10,
          stage: 'Lead',
          ownerId: userId,
          createdAt: Date.now(),
        })

        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Lead Deal 2',
          value: 2000000,
          probability: 15,
          stage: 'Lead',
          ownerId: userId,
          createdAt: Date.now(),
        })

        await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Proposal Deal',
          value: 3000000,
          probability: 50,
          stage: 'Proposal',
          ownerId: userId,
          createdAt: Date.now(),
        })

        const leads = await db.listDealsByStage(ctx.db, orgId, 'Lead')
        const proposals = await db.listDealsByStage(ctx.db, orgId, 'Proposal')

        return { leads, proposals }
      })

      expect(result.leads).toHaveLength(2)
      expect(result.proposals).toHaveLength(1)
    })

    it('updates deal stage', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        const contactId = await db.insertContact(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'John Doe',
          email: 'john@client.com',
          phone: '555-1234',
          isPrimary: true,
        })

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'sales@test.com',
          name: 'Sales Rep',
          role: 'sales_rep',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Sales',
          location: 'Remote',
          isActive: true,
        })

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 1000000,
          probability: 10,
          stage: 'Lead',
          ownerId: userId,
          createdAt: Date.now(),
        })

        await db.updateDeal(ctx.db, dealId, {
          stage: 'Qualified',
          probability: 30,
          qualificationNotes: 'Good fit, budget confirmed',
        })

        return await db.getDeal(ctx.db, dealId)
      })

      expect(result?.stage).toBe('Qualified')
      expect(result?.probability).toBe(30)
      expect(result?.qualificationNotes).toBe('Good fit, budget confirmed')
    })
  })

  // ============================================================================
  // PROJECT & BUDGET TESTS
  // ============================================================================

  describe('Projects and Budgets', () => {
    it('creates project with budget', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'Project Manager',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Website Redesign Project',
          status: 'Planning',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 5000000, // $50,000
          createdAt: Date.now(),
        })

        // Update project with budget reference
        await db.updateProject(ctx.db, projectId, { budgetId })

        const project = await db.getProject(ctx.db, projectId)
        const budget = await db.getBudgetByProject(ctx.db, projectId)

        return { project, budget }
      })

      expect(result.project).not.toBeNull()
      expect(result.project?.name).toBe('Website Redesign Project')
      expect(result.budget).not.toBeNull()
      expect(result.budget?.type).toBe('TimeAndMaterials')
      expect(result.budget?.totalAmount).toBe(5000000)
    })
  })

  // ============================================================================
  // TIME ENTRY TESTS
  // ============================================================================

  describe('Time Entries', () => {
    it('creates and approves time entries', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'PM',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        const entryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Draft',
          notes: 'Feature development',
          createdAt: Date.now(),
        })

        // Submit
        await db.updateTimeEntry(ctx.db, entryId, { status: 'Submitted' })

        // Approve
        await db.updateTimeEntry(ctx.db, entryId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: Date.now(),
        })

        return await db.getTimeEntry(ctx.db, entryId)
      })

      expect(result?.status).toBe('Approved')
      expect(result?.approvedBy).toBeDefined()
    })

    it('lists approved billable entries for invoicing', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'PM',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        // Approved billable
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Approved',
          createdAt: Date.now(),
        })

        // Approved non-billable (should be excluded)
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 2,
          billable: false,
          status: 'Approved',
          createdAt: Date.now(),
        })

        // Draft billable (should be excluded)
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 4,
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        return await db.listApprovedBillableTimeEntriesForInvoicing(ctx.db, projectId)
      })

      expect(result).toHaveLength(1)
      expect(result[0].hours).toBe(8)
      expect(result[0].billable).toBe(true)
      expect(result[0].status).toBe('Approved')
    })
  })

  // ============================================================================
  // BUDGET BURN CALCULATIONS
  // ============================================================================

  describe('Budget Calculations', () => {
    it('calculates project budget burn', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const companyId = await db.insertCompany(ctx.db, {
          organizationId: orgId,
          name: 'Client Corp',
          billingAddress: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'USA',
          },
          paymentTerms: 30,
        })

        // User with $50/hr cost rate (5000 cents)
        const userId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'dev@test.com',
          name: 'Developer',
          role: 'team_member',
          costRate: 5000,
          billRate: 10000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'pm@test.com',
          name: 'PM',
          role: 'project_manager',
          costRate: 7500,
          billRate: 15000,
          skills: [],
          department: 'Operations',
          location: 'Remote',
          isActive: true,
        })

        const projectId = await db.insertProject(ctx.db, {
          organizationId: orgId,
          companyId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          managerId,
          createdAt: Date.now(),
        })

        // Budget: $10,000 (1,000,000 cents)
        const budgetId = await db.insertBudget(ctx.db, {
          projectId,
          organizationId: orgId,
          type: 'TimeAndMaterials',
          totalAmount: 1000000,
          createdAt: Date.now(),
        })

        await db.updateProject(ctx.db, projectId, { budgetId })

        // 10 hours approved = $500 cost (50,000 cents)
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 10,
          billable: true,
          status: 'Approved',
          createdAt: Date.now(),
        })

        // $200 approved expense (20,000 cents)
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 20000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: Date.now(),
          description: 'Software license',
          createdAt: Date.now(),
        })

        return await db.calculateProjectBudgetBurn(ctx.db, projectId)
      })

      // 10 hours * $50/hr = $500 (50,000 cents)
      expect(result.timeCost).toBe(50000)
      // $200 expense (20,000 cents)
      expect(result.expenseCost).toBe(20000)
      // Total: $700 (70,000 cents)
      expect(result.totalCost).toBe(70000)
      // Budget: $10,000 (1,000,000 cents)
      expect(result.budgetAmount).toBe(1000000)
      // Burn rate: 7%
      expect(result.burnRate).toBe(7)
      // Remaining: $9,300 (930,000 cents)
      expect(result.remaining).toBe(930000)
    })
  })

  // ============================================================================
  // INVOICE TESTS
  // ============================================================================

  describe('Invoices', () => {
    it('generates next invoice number', async () => {
      const result = await t.run(async (ctx) => {
        const orgId = await db.insertOrganization(ctx.db, {
          name: 'Test Org',
          settings: {},
          createdAt: Date.now(),
        })

        const firstNumber = await db.getNextInvoiceNumber(ctx.db, orgId)
        return firstNumber
      })

      const year = new Date().getFullYear()
      expect(result).toBe(`INV-${year}-00001`)
    })
  })
})
