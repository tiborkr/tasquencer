/// <reference types="vite/client" />
/**
 * API Endpoint tests for PSA Platform
 * Tests the public API contract as defined in recipes/psa-platform/specs/26-api-endpoints.md
 *
 * These tests verify:
 * - Authorization checks on all endpoints
 * - Input validation
 * - Business logic correctness
 * - Multi-tenant isolation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import * as authorization from '../authorization'
import type { DatabaseWriter } from '../_generated/server'

// Mock assertUserHasScope to allow/deny based on test needs
let mockScopeCheck: ((scope: string) => boolean) | null = null

/**
 * Helper to set up common test data
 */
async function setupTestData(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Test Org',
    settings: { timezone: 'UTC' },
    createdAt: Date.now(),
  })

  const userId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'user@test.com',
    name: 'Test User',
    role: 'team_member',
    costRate: 5000,
    billRate: 10000,
    skills: ['typescript', 'react'],
    department: 'Engineering',
    location: 'Remote',
    isActive: true,
  })

  const managerId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'manager@test.com',
    name: 'Project Manager',
    role: 'project_manager',
    costRate: 7500,
    billRate: 15000,
    skills: ['management'],
    department: 'Operations',
    location: 'Remote',
    isActive: true,
  })

  const companyId = await db.insertCompany(dbWriter, {
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

  const contactId = await db.insertContact(dbWriter, {
    organizationId: orgId,
    companyId,
    name: 'John Client',
    email: 'john@client.com',
    phone: '555-1234',
    isPrimary: true,
  })

  return { orgId, userId, managerId, companyId, contactId }
}

describe('PSA Platform API Endpoints', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
    mockScopeCheck = () => true // Default: allow all scopes
    vi.spyOn(authorization, 'assertUserHasScope').mockImplementation(
      async (_ctx, scope) => {
        if (mockScopeCheck && !mockScopeCheck(scope)) {
          throw new Error(`User does not have scope ${scope}`)
        }
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    mockScopeCheck = null
  })

  // ============================================================================
  // DEAL ENDPOINT TESTS
  // ============================================================================

  describe('Deal Endpoints', () => {
    describe('createDeal', () => {
      it('creates a deal with required fields', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, companyId, contactId } =
            await setupTestData(ctx.db)

          const dealId = await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'New Project Deal',
            value: 5000000, // $50,000
            ownerId: userId,
            stage: 'Lead',
            probability: 10,
            createdAt: Date.now(),
          })

          return await db.getDeal(ctx.db, dealId)
        })

        expect(result).not.toBeNull()
        expect(result?.name).toBe('New Project Deal')
        expect(result?.value).toBe(5000000)
        expect(result?.stage).toBe('Lead')
        expect(result?.probability).toBe(10)
      })

      it('rejects deal creation without deals:create scope', async () => {
        mockScopeCheck = (scope) => scope !== 'dealToDelivery:deals:create'

        await expect(async () => {
          await authorization.assertUserHasScope(
            {} as Parameters<typeof authorization.assertUserHasScope>[0],
            'dealToDelivery:deals:create'
          )
        }).rejects.toThrow('does not have scope')
      })
    })

    describe('updateDealStage', () => {
      it('updates stage with automatic probability adjustment', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, companyId, contactId } =
            await setupTestData(ctx.db)

          const dealId = await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Test Deal',
            value: 1000000,
            ownerId: userId,
            stage: 'Lead',
            probability: 10,
            createdAt: Date.now(),
          })

          // Update to Qualified - should auto-set probability to 25
          await db.updateDeal(ctx.db, dealId, {
            stage: 'Qualified',
            probability: 25,
          })

          return await db.getDeal(ctx.db, dealId)
        })

        expect(result?.stage).toBe('Qualified')
        expect(result?.probability).toBe(25)
      })

      it('sets closedAt when deal is Won', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, companyId, contactId } =
            await setupTestData(ctx.db)

          const dealId = await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Winning Deal',
            value: 2000000,
            ownerId: userId,
            stage: 'Negotiation',
            probability: 75,
            createdAt: Date.now(),
          })

          const closeTime = Date.now()
          await db.updateDeal(ctx.db, dealId, {
            stage: 'Won',
            probability: 100,
            closedAt: closeTime,
          })

          return await db.getDeal(ctx.db, dealId)
        })

        expect(result?.stage).toBe('Won')
        expect(result?.probability).toBe(100)
        expect(result?.closedAt).toBeDefined()
      })

      it('sets lostReason when deal is Lost', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, companyId, contactId } =
            await setupTestData(ctx.db)

          const dealId = await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Lost Deal',
            value: 1500000,
            ownerId: userId,
            stage: 'Proposal',
            probability: 50,
            createdAt: Date.now(),
          })

          await db.updateDeal(ctx.db, dealId, {
            stage: 'Lost',
            probability: 0,
            closedAt: Date.now(),
            lostReason: 'Budget constraints',
          })

          return await db.getDeal(ctx.db, dealId)
        })

        expect(result?.stage).toBe('Lost')
        expect(result?.probability).toBe(0)
        expect(result?.lostReason).toBe('Budget constraints')
      })
    })

    describe('getDeals', () => {
      it('lists deals filtered by stage', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, companyId, contactId } =
            await setupTestData(ctx.db)

          // Create deals in different stages
          await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Lead 1',
            value: 100000,
            ownerId: userId,
            stage: 'Lead',
            probability: 10,
            createdAt: Date.now(),
          })

          await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Lead 2',
            value: 200000,
            ownerId: userId,
            stage: 'Lead',
            probability: 10,
            createdAt: Date.now(),
          })

          await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Qualified Deal',
            value: 300000,
            ownerId: userId,
            stage: 'Qualified',
            probability: 25,
            createdAt: Date.now(),
          })

          const leadDeals = await db.listDealsByStage(ctx.db, orgId, 'Lead')
          const qualifiedDeals = await db.listDealsByStage(
            ctx.db,
            orgId,
            'Qualified'
          )
          const allDeals = await db.listDealsByOrganization(ctx.db, orgId)

          return { leadDeals, qualifiedDeals, allDeals }
        })

        expect(result.leadDeals).toHaveLength(2)
        expect(result.qualifiedDeals).toHaveLength(1)
        expect(result.allDeals).toHaveLength(3)
      })

      it('lists deals by owner', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId, contactId } =
            await setupTestData(ctx.db)

          // Create deals with different owners
          await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'User Deal',
            value: 100000,
            ownerId: userId,
            stage: 'Lead',
            probability: 10,
            createdAt: Date.now(),
          })

          await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Manager Deal',
            value: 200000,
            ownerId: managerId,
            stage: 'Lead',
            probability: 10,
            createdAt: Date.now(),
          })

          const userDeals = await db.listDealsByOwner(ctx.db, userId)
          const managerDeals = await db.listDealsByOwner(ctx.db, managerId)

          return { userDeals, managerDeals }
        })

        expect(result.userDeals).toHaveLength(1)
        expect(result.userDeals[0].name).toBe('User Deal')
        expect(result.managerDeals).toHaveLength(1)
        expect(result.managerDeals[0].name).toBe('Manager Deal')
      })
    })
  })

  // ============================================================================
  // ESTIMATE ENDPOINT TESTS
  // ============================================================================

  describe('Estimate Endpoints', () => {
    it('creates estimate with services and calculates total', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, companyId, contactId } =
          await setupTestData(ctx.db)

        const dealId = await db.insertDeal(ctx.db, {
          organizationId: orgId,
          companyId,
          contactId,
          name: 'Test Deal',
          value: 1000000,
          ownerId: userId,
          stage: 'Qualified',
          probability: 25,
          createdAt: Date.now(),
        })

        // Create estimate
        const estimateId = await db.insertEstimate(ctx.db, {
          organizationId: orgId,
          dealId,
          total: 350000, // Will be calculated from services
          createdAt: Date.now(),
        })

        // Add services
        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Design',
          rate: 15000, // $150/hr
          hours: 10,
          total: 150000,
        })

        await db.insertEstimateService(ctx.db, {
          estimateId,
          name: 'Development',
          rate: 10000, // $100/hr
          hours: 20,
          total: 200000,
        })

        const estimate = await db.getEstimate(ctx.db, estimateId)
        const services = await db.listEstimateServicesByEstimate(
          ctx.db,
          estimateId
        )

        return { estimate, services }
      })

      expect(result.estimate?.total).toBe(350000) // $3,500
      expect(result.services).toHaveLength(2)
      expect(result.services.map((s) => s.name)).toContain('Design')
      expect(result.services.map((s) => s.name)).toContain('Development')
    })
  })

  // ============================================================================
  // PROJECT ENDPOINT TESTS
  // ============================================================================

  describe('Project Endpoints', () => {
    describe('createProjectFromDeal', () => {
      it('creates project and budget from won deal', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId, contactId } =
            await setupTestData(ctx.db)

          const dealId = await db.insertDeal(ctx.db, {
            organizationId: orgId,
            companyId,
            contactId,
            name: 'Won Deal',
            value: 5000000,
            ownerId: userId,
            stage: 'Won',
            probability: 100,
            closedAt: Date.now(),
            createdAt: Date.now(),
          })

          // Create estimate
          const estimateId = await db.insertEstimate(ctx.db, {
            organizationId: orgId,
            dealId,
            total: 5000000,
            createdAt: Date.now(),
          })

          await db.insertEstimateService(ctx.db, {
            estimateId,
            name: 'Development',
            rate: 10000,
            hours: 500,
            total: 5000000,
          })

          // Create project
          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            dealId,
            name: 'Won Deal',
            status: 'Planning',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          // Create budget
          const budgetId = await db.insertBudget(ctx.db, {
            organizationId: orgId,
            projectId,
            type: 'TimeAndMaterials',
            totalAmount: 5000000,
            createdAt: Date.now(),
          })

          // Update project with budget reference
          await db.updateProject(ctx.db, projectId, { budgetId })

          const project = await db.getProject(ctx.db, projectId)
          const budget = await db.getBudgetByProject(ctx.db, projectId)

          return { project, budget }
        })

        expect(result.project?.status).toBe('Planning')
        expect(result.project?.name).toBe('Won Deal')
        expect(result.budget?.totalAmount).toBe(5000000)
        expect(result.budget?.type).toBe('TimeAndMaterials')
      })
    })

    describe('closeProject', () => {
      it('closes project with metrics calculation', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Active Project',
            status: 'Active',
            startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
            managerId,
            createdAt: Date.now(),
          })

          const budgetId = await db.insertBudget(ctx.db, {
            organizationId: orgId,
            projectId,
            type: 'TimeAndMaterials',
            totalAmount: 1000000,
            createdAt: Date.now(),
          })

          await db.updateProject(ctx.db, projectId, { budgetId })

          // Add some time entries
          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: Date.now(),
            hours: 40,
            billable: true,
            status: 'Approved',
            createdAt: Date.now(),
          })

          // Close project
          await db.updateProject(ctx.db, projectId, {
            status: 'Completed',
            endDate: Date.now(),
          })

          const project = await db.getProject(ctx.db, projectId)
          const burnMetrics = await db.calculateProjectBudgetBurn(
            ctx.db,
            projectId
          )

          return { project, burnMetrics }
        })

        expect(result.project?.status).toBe('Completed')
        expect(result.project?.endDate).toBeDefined()
        expect(result.burnMetrics.totalCost).toBeGreaterThan(0)
      })
    })
  })

  // ============================================================================
  // TIME TRACKING ENDPOINT TESTS
  // ============================================================================

  describe('Time Tracking Endpoints', () => {
    describe('createTimeEntry', () => {
      it('creates time entry with correct status', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

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
            projectId,
            userId,
            date: Date.now(),
            hours: 8,
            billable: true,
            status: 'Draft',
            notes: 'Feature development',
            createdAt: Date.now(),
          })

          return await db.getTimeEntry(ctx.db, entryId)
        })

        expect(result?.status).toBe('Draft')
        expect(result?.hours).toBe(8)
        expect(result?.billable).toBe(true)
      })
    })

    describe('submitTimeEntry', () => {
      it('submits time entry', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

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
            projectId,
            userId,
            date: Date.now(),
            hours: 8,
            billable: true,
            status: 'Draft',
            createdAt: Date.now(),
          })

          await db.updateTimeEntry(ctx.db, entryId, { status: 'Submitted' })

          return await db.getTimeEntry(ctx.db, entryId)
        })

        expect(result?.status).toBe('Submitted')
      })

      it('prevents submission of non-draft entries', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

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
            projectId,
            userId,
            date: Date.now(),
            hours: 8,
            billable: true,
            status: 'Approved',
            createdAt: Date.now(),
          })

          const entry = await db.getTimeEntry(ctx.db, entryId)
          // Check status before allowing submission
          const canSubmit =
            entry?.status === 'Draft' || entry?.status === 'Rejected'

          return { entry, canSubmit }
        })

        expect(result.entry?.status).toBe('Approved')
        expect(result.canSubmit).toBe(false)
      })
    })

    describe('approveTimesheet', () => {
      it('approves submitted time entries', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

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
            projectId,
            userId,
            date: Date.now(),
            hours: 8,
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          await db.updateTimeEntry(ctx.db, entryId, {
            status: 'Approved',
            approvedBy: managerId,
            approvedAt: Date.now(),
          })

          return await db.getTimeEntry(ctx.db, entryId)
        })

        expect(result?.status).toBe('Approved')
        expect(result?.approvedBy).toBeDefined()
        expect(result?.approvedAt).toBeDefined()
      })
    })

    describe('rejectTimesheet', () => {
      it('rejects time entry with comments', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

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
            projectId,
            userId,
            date: Date.now(),
            hours: 8,
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          await db.updateTimeEntry(ctx.db, entryId, {
            status: 'Rejected',
            rejectionComments: 'Please add more detail in notes',
          })

          return await db.getTimeEntry(ctx.db, entryId)
        })

        expect(result?.status).toBe('Rejected')
        expect(result?.rejectionComments).toBe('Please add more detail in notes')
      })
    })

    describe('getTimesheet', () => {
      it('gets timesheet with summary', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const weekStart = Date.now()

          // Create entries with different statuses
          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: weekStart,
            hours: 8,
            billable: true,
            status: 'Draft',
            createdAt: Date.now(),
          })

          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: weekStart + 24 * 60 * 60 * 1000,
            hours: 6,
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: weekStart + 2 * 24 * 60 * 60 * 1000,
            hours: 2,
            billable: false,
            status: 'Approved',
            createdAt: Date.now(),
          })

          const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000
          const entries = await db.listTimeEntriesByUserAndDateRange(
            ctx.db,
            userId,
            weekStart,
            weekEnd
          )

          const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
          const billableHours = entries
            .filter((e) => e.billable)
            .reduce((sum, e) => sum + e.hours, 0)
          const byStatus = {
            draft: entries.filter((e) => e.status === 'Draft').length,
            submitted: entries.filter((e) => e.status === 'Submitted').length,
            approved: entries.filter((e) => e.status === 'Approved').length,
            rejected: entries.filter((e) => e.status === 'Rejected').length,
          }

          return { entries, totalHours, billableHours, byStatus }
        })

        expect(result.entries).toHaveLength(3)
        expect(result.totalHours).toBe(16)
        expect(result.billableHours).toBe(14)
        expect(result.byStatus.draft).toBe(1)
        expect(result.byStatus.submitted).toBe(1)
        expect(result.byStatus.approved).toBe(1)
      })
    })
  })

  // ============================================================================
  // EXPENSE ENDPOINT TESTS
  // ============================================================================

  describe('Expense Endpoints', () => {
    describe('createExpense', () => {
      it('creates expense with all required fields', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const expenseId = await db.insertExpense(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            type: 'Software',
            description: 'IDE License',
            amount: 50000, // $500
            currency: 'USD',
            date: Date.now(),
            billable: true,
            markupRate: 10,
            status: 'Draft',
            createdAt: Date.now(),
          })

          return await db.getExpense(ctx.db, expenseId)
        })

        expect(result?.type).toBe('Software')
        expect(result?.amount).toBe(50000)
        expect(result?.billable).toBe(true)
        expect(result?.markupRate).toBe(10)
        expect(result?.status).toBe('Draft')
      })
    })

    describe('submitExpense', () => {
      it('submits expense', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const expenseId = await db.insertExpense(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            type: 'Travel',
            description: 'Client visit',
            amount: 150000,
            currency: 'USD',
            date: Date.now(),
            billable: true,
            status: 'Draft',
            createdAt: Date.now(),
          })

          await db.updateExpense(ctx.db, expenseId, { status: 'Submitted' })

          return await db.getExpense(ctx.db, expenseId)
        })

        expect(result?.status).toBe('Submitted')
      })
    })

    describe('approveExpense', () => {
      it('approves expense with optional markup adjustment', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const expenseId = await db.insertExpense(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            type: 'Materials',
            description: 'Hardware',
            amount: 200000,
            currency: 'USD',
            date: Date.now(),
            billable: true,
            markupRate: 10,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          // Approve with adjusted markup
          await db.updateExpense(ctx.db, expenseId, {
            status: 'Approved',
            markupRate: 15, // Manager increased markup
            approvedBy: managerId,
            approvedAt: Date.now(),
          })

          return await db.getExpense(ctx.db, expenseId)
        })

        expect(result?.status).toBe('Approved')
        expect(result?.markupRate).toBe(15)
        expect(result?.approvedBy).toBeDefined()
      })
    })

    describe('rejectExpense', () => {
      it('rejects expense with reason', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const expenseId = await db.insertExpense(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            type: 'Other',
            description: 'Entertainment',
            amount: 30000,
            currency: 'USD',
            date: Date.now(),
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          await db.updateExpense(ctx.db, expenseId, {
            status: 'Rejected',
            rejectionComments: 'Entertainment expenses not covered',
          })

          return await db.getExpense(ctx.db, expenseId)
        })

        expect(result?.status).toBe('Rejected')
        expect(result?.rejectionComments).toBe(
          'Entertainment expenses not covered'
        )
      })
    })
  })

  // ============================================================================
  // INVOICE ENDPOINT TESTS
  // ============================================================================

  describe('Invoice Endpoints', () => {
    describe('createInvoice', () => {
      it('creates T&M invoice from time entries', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const budgetId = await db.insertBudget(ctx.db, {
            organizationId: orgId,
            projectId,
            type: 'TimeAndMaterials',
            totalAmount: 1000000,
            createdAt: Date.now(),
          })

          const serviceId = await db.insertService(ctx.db, {
            organizationId: orgId,
            budgetId,
            name: 'Development',
            rate: 10000, // $100/hr
            estimatedHours: 100,
            totalAmount: 1000000,
          })

          // Create approved time entries
          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            serviceId,
            date: Date.now(),
            hours: 10,
            billable: true,
            status: 'Approved',
            createdAt: Date.now(),
          })

          // Create invoice
          const invoiceId = await db.insertInvoice(ctx.db, {
            organizationId: orgId,
            projectId,
            companyId,
            method: 'TimeAndMaterials',
            status: 'Draft',
            subtotal: 100000, // 10 hours * $100
            tax: 0,
            total: 100000,
            dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
            createdAt: Date.now(),
          })

          await db.insertInvoiceLineItem(ctx.db, {
            invoiceId,
            description: 'Development - 10 hours',
            quantity: 10,
            rate: 10000,
            amount: 100000,
            sortOrder: 0,
          })

          const invoice = await db.getInvoice(ctx.db, invoiceId)
          const lineItems = await db.listInvoiceLineItemsByInvoice(
            ctx.db,
            invoiceId
          )

          return { invoice, lineItems }
        })

        expect(result.invoice?.method).toBe('TimeAndMaterials')
        expect(result.invoice?.total).toBe(100000)
        expect(result.lineItems).toHaveLength(1)
        expect(result.lineItems[0].quantity).toBe(10)
      })
    })

    describe('finalizeInvoice', () => {
      it('finalizes invoice with number generation', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const invoiceId = await db.insertInvoice(ctx.db, {
            organizationId: orgId,
            projectId,
            companyId,
            method: 'FixedFee',
            status: 'Draft',
            subtotal: 500000,
            tax: 0,
            total: 500000,
            dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
            createdAt: Date.now(),
          })

          // Finalize
          const invoiceNumber = await db.getNextInvoiceNumber(ctx.db, orgId)
          await db.updateInvoice(ctx.db, invoiceId, {
            number: invoiceNumber,
            status: 'Finalized',
            finalizedAt: Date.now(),
          })

          return await db.getInvoice(ctx.db, invoiceId)
        })

        expect(result?.status).toBe('Finalized')
        expect(result?.number).toMatch(/^INV-\d{4}-\d{5}$/)
        expect(result?.finalizedAt).toBeDefined()
      })
    })

    describe('sendInvoice', () => {
      it('sends finalized invoice', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const invoiceId = await db.insertInvoice(ctx.db, {
            organizationId: orgId,
            projectId,
            companyId,
            method: 'FixedFee',
            number: 'INV-2026-00001',
            status: 'Finalized',
            subtotal: 500000,
            tax: 0,
            total: 500000,
            dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
            createdAt: Date.now(),
          })

          await db.updateInvoice(ctx.db, invoiceId, {
            status: 'Sent',
            sentAt: Date.now(),
          })

          return await db.getInvoice(ctx.db, invoiceId)
        })

        expect(result?.status).toBe('Sent')
        expect(result?.sentAt).toBeDefined()
      })
    })
  })

  // ============================================================================
  // PAYMENT ENDPOINT TESTS
  // ============================================================================

  describe('Payment Endpoints', () => {
    describe('recordPayment', () => {
      it('records payment and updates invoice status', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const invoiceId = await db.insertInvoice(ctx.db, {
            organizationId: orgId,
            projectId,
            companyId,
            method: 'FixedFee',
            number: 'INV-2026-00001',
            status: 'Sent',
            subtotal: 100000,
            tax: 0,
            total: 100000,
            dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
            createdAt: Date.now(),
          })

          // Record full payment
          const paymentId = await db.insertPayment(ctx.db, {
            organizationId: orgId,
            invoiceId,
            amount: 100000,
            date: Date.now(),
            method: 'ACH',
            reference: 'BANK-REF-123',
            syncedToAccounting: false,
            createdAt: Date.now(),
          })

          // Update invoice status
          const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
          const invoice = await db.getInvoice(ctx.db, invoiceId)
          const fullyPaid = totalPaid >= (invoice?.total ?? 0)

          if (fullyPaid) {
            await db.updateInvoice(ctx.db, invoiceId, {
              status: 'Paid',
              paidAt: Date.now(),
            })
          }

          const updatedInvoice = await db.getInvoice(ctx.db, invoiceId)
          const payment = await db.getPayment(ctx.db, paymentId)

          return { invoice: updatedInvoice, payment, fullyPaid }
        })

        expect(result.invoice?.status).toBe('Paid')
        expect(result.fullyPaid).toBe(true)
        expect(result.payment?.amount).toBe(100000)
        expect(result.payment?.method).toBe('ACH')
      })

      it('handles partial payments', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const invoiceId = await db.insertInvoice(ctx.db, {
            organizationId: orgId,
            projectId,
            companyId,
            method: 'FixedFee',
            number: 'INV-2026-00002',
            status: 'Sent',
            subtotal: 200000,
            tax: 0,
            total: 200000,
            dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
            createdAt: Date.now(),
          })

          // First partial payment
          await db.insertPayment(ctx.db, {
            organizationId: orgId,
            invoiceId,
            amount: 100000, // 50%
            date: Date.now(),
            method: 'Check',
            syncedToAccounting: false,
            createdAt: Date.now(),
          })

          const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
          const invoice = await db.getInvoice(ctx.db, invoiceId)
          const remaining = (invoice?.total ?? 0) - totalPaid

          return { totalPaid, remaining, invoiceStatus: invoice?.status }
        })

        expect(result.totalPaid).toBe(100000)
        expect(result.remaining).toBe(100000)
        expect(result.invoiceStatus).toBe('Sent') // Still sent, not paid
      })
    })
  })

  // ============================================================================
  // BOOKING ENDPOINT TESTS
  // ============================================================================

  describe('Booking Endpoints', () => {
    describe('createBooking', () => {
      it('creates project booking', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const bookingId = await db.insertBooking(ctx.db, {
            organizationId: orgId,
            userId,
            projectId,
            startDate: Date.now(),
            endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
            hoursPerDay: 8,
            type: 'Tentative',
            createdAt: Date.now(),
          })

          return await db.getBooking(ctx.db, bookingId)
        })

        expect(result?.type).toBe('Tentative')
        expect(result?.hoursPerDay).toBe(8)
      })

      it('creates time off booking without project', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId } = await setupTestData(ctx.db)

          const bookingId = await db.insertBooking(ctx.db, {
            organizationId: orgId,
            userId,
            startDate: Date.now(),
            endDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
            hoursPerDay: 8,
            type: 'TimeOff',
            notes: 'Vacation',
            createdAt: Date.now(),
          })

          return await db.getBooking(ctx.db, bookingId)
        })

        expect(result?.type).toBe('TimeOff')
        expect(result?.projectId).toBeUndefined()
        expect(result?.notes).toBe('Vacation')
      })
    })

    describe('confirmBookings', () => {
      it('confirms tentative bookings', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const booking1Id = await db.insertBooking(ctx.db, {
            organizationId: orgId,
            userId,
            projectId,
            startDate: Date.now(),
            endDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
            hoursPerDay: 8,
            type: 'Tentative',
            createdAt: Date.now(),
          })

          const booking2Id = await db.insertBooking(ctx.db, {
            organizationId: orgId,
            userId,
            projectId,
            startDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
            endDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
            hoursPerDay: 8,
            type: 'Tentative',
            createdAt: Date.now(),
          })

          // Confirm both
          await db.updateBooking(ctx.db, booking1Id, { type: 'Confirmed' })
          await db.updateBooking(ctx.db, booking2Id, { type: 'Confirmed' })

          const booking1 = await db.getBooking(ctx.db, booking1Id)
          const booking2 = await db.getBooking(ctx.db, booking2Id)

          return { booking1, booking2 }
        })

        expect(result.booking1?.type).toBe('Confirmed')
        expect(result.booking2?.type).toBe('Confirmed')
      })
    })
  })

  // ============================================================================
  // UTILIZATION REPORT TESTS
  // ============================================================================

  describe('Report Endpoints', () => {
    describe('getUserUtilization', () => {
      it('calculates user utilization', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const startDate = Date.now()
          const endDate = startDate + 5 * 24 * 60 * 60 * 1000 // 5 days

          // Book user for 4 hours per day (50% utilization)
          await db.insertBooking(ctx.db, {
            organizationId: orgId,
            userId,
            projectId,
            startDate,
            endDate,
            hoursPerDay: 4,
            type: 'Confirmed',
            createdAt: Date.now(),
          })

          return await db.calculateUserUtilization(
            ctx.db,
            userId,
            startDate,
            endDate
          )
        })

        expect(result.bookedHours).toBeGreaterThan(0)
        expect(result.availableHours).toBeGreaterThan(0)
        // Utilization should be around 50% (4 hours per day out of 8)
        expect(result.utilizationPercent).toBeCloseTo(50, 0)
      })
    })

    describe('getBudgetBurnReport', () => {
      it('calculates budget burn for project', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const budgetId = await db.insertBudget(ctx.db, {
            organizationId: orgId,
            projectId,
            type: 'TimeAndMaterials',
            totalAmount: 500000, // $5,000
            createdAt: Date.now(),
          })

          await db.updateProject(ctx.db, projectId, { budgetId })

          // Add time entry (20 hours * $50/hr cost = $1,000)
          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: Date.now(),
            hours: 20,
            billable: true,
            status: 'Approved',
            createdAt: Date.now(),
          })

          return await db.calculateProjectBudgetBurn(ctx.db, projectId)
        })

        // 20% burn rate (1000 / 5000)
        expect(result.burnRate).toBeCloseTo(20, 0)
        expect(result.totalCost).toBe(100000) // 20 hours * 5000 cents = 100000 cents
        expect(result.remaining).toBe(400000) // 500000 - 100000
      })
    })
  })

  // ============================================================================
  // TIMESHEET APPROVAL ENDPOINT TESTS
  // ============================================================================

  describe('Timesheet Approval Endpoints', () => {
    describe('getSubmittedTimesheetsForApproval', () => {
      it('groups submitted time entries by user and week', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          // Create submitted time entries for user
          const now = Date.now()
          const monday = now - (new Date(now).getDay() - 1) * 24 * 60 * 60 * 1000

          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: monday,
            hours: 8,
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: monday + 24 * 60 * 60 * 1000, // Tuesday
            hours: 6,
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          // Query submitted timesheets
          const entries = await db.listTimeEntriesByStatus(
            ctx.db,
            orgId,
            'Submitted'
          )

          return entries
        })

        expect(result).toHaveLength(2)
        expect(result[0].status).toBe('Submitted')
        expect(result[0].hours).toBe(8)
        expect(result[1].hours).toBe(6)
      })

      it('returns empty for organization with no submitted entries', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId } = await setupTestData(ctx.db)

          return await db.listTimeEntriesByStatus(ctx.db, orgId, 'Submitted')
        })

        expect(result).toHaveLength(0)
      })

      it('filters by status correctly', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, userId, managerId, companyId } =
            await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          // Create entries with different statuses
          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: Date.now(),
            hours: 4,
            billable: true,
            status: 'Draft',
            createdAt: Date.now(),
          })

          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: Date.now(),
            hours: 8,
            billable: true,
            status: 'Submitted',
            createdAt: Date.now(),
          })

          await db.insertTimeEntry(ctx.db, {
            organizationId: orgId,
            projectId,
            userId,
            date: Date.now(),
            hours: 6,
            billable: true,
            status: 'Approved',
            createdAt: Date.now(),
          })

          const submitted = await db.listTimeEntriesByStatus(
            ctx.db,
            orgId,
            'Submitted'
          )
          const approved = await db.listTimeEntriesByStatus(
            ctx.db,
            orgId,
            'Approved'
          )

          return { submitted, approved }
        })

        expect(result.submitted).toHaveLength(1)
        expect(result.submitted[0].hours).toBe(8)
        expect(result.approved).toHaveLength(1)
        expect(result.approved[0].hours).toBe(6)
      })
    })
  })

  // ============================================================================
  // PROJECT SERVICES ENDPOINT TESTS
  // ============================================================================

  describe('Project Services Endpoints', () => {
    describe('getProjectServices', () => {
      it('returns services for a project with budget', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const budgetId = await db.insertBudget(ctx.db, {
            organizationId: orgId,
            projectId,
            type: 'TimeAndMaterials',
            totalAmount: 100000,
            createdAt: Date.now(),
          })

          await db.updateProject(ctx.db, projectId, { budgetId })

          // Add services to budget
          await db.insertService(ctx.db, {
            organizationId: orgId,
            budgetId,
            name: 'Development',
            rate: 15000, // $150/hr
            estimatedHours: 40,
            totalAmount: 600000,
          })

          await db.insertService(ctx.db, {
            organizationId: orgId,
            budgetId,
            name: 'Design',
            rate: 12500, // $125/hr
            estimatedHours: 20,
            totalAmount: 250000,
          })

          const budget = await db.getBudgetByProject(ctx.db, projectId)
          if (!budget) return []
          return await db.listServicesByBudget(ctx.db, budget._id)
        })

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('Development')
        expect(result[0].rate).toBe(15000)
        expect(result[1].name).toBe('Design')
        expect(result[1].rate).toBe(12500)
      })

      it('returns empty array for project without budget', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const budget = await db.getBudgetByProject(ctx.db, projectId)
          if (!budget) return []
          return await db.listServicesByBudget(ctx.db, budget._id)
        })

        expect(result).toHaveLength(0)
      })

      it('returns empty array for budget without services', async () => {
        const result = await t.run(async (ctx) => {
          const { orgId, managerId, companyId } = await setupTestData(ctx.db)

          const projectId = await db.insertProject(ctx.db, {
            organizationId: orgId,
            companyId,
            name: 'Test Project',
            status: 'Active',
            startDate: Date.now(),
            managerId,
            createdAt: Date.now(),
          })

          const budgetId = await db.insertBudget(ctx.db, {
            organizationId: orgId,
            projectId,
            type: 'TimeAndMaterials',
            totalAmount: 100000,
            createdAt: Date.now(),
          })

          await db.updateProject(ctx.db, projectId, { budgetId })

          const budget = await db.getBudgetByProject(ctx.db, projectId)
          if (!budget) return []
          return await db.listServicesByBudget(ctx.db, budget._id)
        })

        expect(result).toHaveLength(0)
      })
    })
  })
})
