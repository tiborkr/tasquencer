/// <reference types="vite/client" />
/**
 * Expense Tracking unit tests for PSA Platform
 * Tests the expense tracking work items including expense creation,
 * different expense types, receipt attachment, billable marking, and submission
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common test data for expense tracking tests
 */
async function setupTestProject(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  const userId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'user@test.com',
    name: 'Test User',
    role: 'team_member',
    costRate: 5000,
    billRate: 10000,
    skills: ['typescript'],
    department: 'Engineering',
    location: 'Remote',
    isActive: true,
  })

  const companyId = await db.insertCompany(dbWriter, {
    organizationId: orgId,
    name: 'Test Company',
    billingAddress: {
      street: '123 Main St',
      city: 'Test City',
      state: 'TS',
      postalCode: '12345',
      country: 'USA',
    },
    paymentTerms: 30,
  })

  const contactId = await db.insertContact(dbWriter, {
    companyId,
    organizationId: orgId,
    name: 'Test Contact',
    email: 'contact@test.com',
    phone: '555-1234',
    isPrimary: true,
  })

  const dealId = await db.insertDeal(dbWriter, {
    organizationId: orgId,
    companyId,
    contactId,
    name: 'Test Deal',
    value: 100000,
    probability: 50,
    stage: 'Won',
    ownerId: userId,
    createdAt: Date.now(),
  })

  const projectId = await db.insertProject(dbWriter, {
    organizationId: orgId,
    dealId,
    companyId,
    name: 'Test Project',
    status: 'Active',
    startDate: Date.now(),
    managerId: userId,
    createdAt: Date.now(),
  })

  return { orgId, userId, companyId, contactId, dealId, projectId }
}

describe('PSA Platform Expense Tracking', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // EXPENSE CREATION TESTS
  // ============================================================================

  describe('Expense Creation', () => {
    it('creates a software expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 9999, // $99.99 in cents
          currency: 'USD',
          billable: false,
          status: 'Draft',
          date: Date.now(),
          description: 'IDE license renewal',
          vendorInfo: { name: 'JetBrains' },
          createdAt: Date.now(),
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result).not.toBeNull()
      expect(result!.type).toBe('Software')
      expect(result!.amount).toBe(9999)
      expect(result!.description).toBe('IDE license renewal')
      expect(result!.vendorInfo?.name).toBe('JetBrains')
    })

    it('creates a travel expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 35000, // $350.00
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Flight to client site',
          vendorInfo: { name: 'Delta Airlines' },
          createdAt: Date.now(),
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.type).toBe('Travel')
      expect(result!.amount).toBe(35000)
      expect(result!.billable).toBe(true)
    })

    it('creates a materials expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 4500, // $45.00
          currency: 'USD',
          billable: false,
          status: 'Draft',
          date: Date.now(),
          description: 'Office supplies for workshop',
          createdAt: Date.now(),
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.type).toBe('Materials')
      expect(result!.amount).toBe(4500)
    })

    it('creates a subcontractor expense with tax ID', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Subcontractor',
          amount: 500000, // $5,000.00
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Freelance designer for UI work',
          vendorInfo: {
            name: 'Jane Smith Design LLC',
            taxId: '12-3456789',
          },
          createdAt: Date.now(),
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.type).toBe('Subcontractor')
      expect(result!.amount).toBe(500000)
      expect(result!.vendorInfo?.name).toBe('Jane Smith Design LLC')
      expect(result!.vendorInfo?.taxId).toBe('12-3456789')
    })

    it('creates an other expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Other',
          amount: 2500, // $25.00
          currency: 'USD',
          billable: false,
          status: 'Draft',
          date: Date.now(),
          description: 'Parking fee for client meeting',
          createdAt: Date.now(),
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.type).toBe('Other')
      expect(result!.description).toBe('Parking fee for client meeting')
    })
  })

  // ============================================================================
  // RECEIPT ATTACHMENT TESTS
  // ============================================================================

  describe('Receipt Attachment', () => {
    it('attaches receipt URL to expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 15000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Hotel stay',
          createdAt: Date.now(),
        })

        // Attach receipt
        await db.updateExpense(ctx.db, expenseId, {
          receiptUrl: 'https://storage.example.com/receipts/hotel-123.pdf',
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.receiptUrl).toBe('https://storage.example.com/receipts/hotel-123.pdf')
    })
  })

  // ============================================================================
  // BILLABLE MARKING TESTS
  // ============================================================================

  describe('Billable Marking', () => {
    it('marks expense as billable', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 9999,
          currency: 'USD',
          billable: false,
          status: 'Draft',
          date: Date.now(),
          description: 'Client-specific software license',
          createdAt: Date.now(),
        })

        // Mark as billable
        await db.updateExpense(ctx.db, expenseId, {
          billable: true,
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.billable).toBe(true)
    })

    it('sets markup rate on billable expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 10000, // $100.00
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Project materials',
          createdAt: Date.now(),
        })

        // Set 15% markup
        await db.updateExpense(ctx.db, expenseId, {
          markupRate: 1.15,
        })

        const expense = await db.getExpense(ctx.db, expenseId)
        const billedAmount = expense!.amount * (expense!.markupRate || 1)

        return { expense, billedAmount }
      })

      expect(result.expense!.markupRate).toBe(1.15)
      expect(result.billedAmount).toBe(11500) // $115.00 after markup
    })
  })

  // ============================================================================
  // EXPENSE SUBMISSION TESTS
  // ============================================================================

  describe('Expense Submission', () => {
    it('submits a draft expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 25000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Client visit transportation',
          createdAt: Date.now(),
        })

        // Submit the expense
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Submitted',
        })

        return await db.getExpense(ctx.db, expenseId)
      })

      expect(result!.status).toBe('Submitted')
    })

    it('cannot modify submitted expense amount', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: false,
          status: 'Submitted',
          date: Date.now(),
          description: 'Software subscription',
          createdAt: Date.now(),
        })

        const expense = await db.getExpense(ctx.db, expenseId)

        return {
          status: expense!.status,
          canEdit: expense!.status === 'Draft',
        }
      })

      expect(result.status).toBe('Submitted')
      expect(result.canEdit).toBe(false)
    })
  })

  // ============================================================================
  // EXPENSE QUERIES TESTS
  // ============================================================================

  describe('Expense Queries', () => {
    it('lists expenses by user', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create multiple expenses
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: false,
          status: 'Draft',
          date: Date.now(),
          description: 'Software 1',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 10000,
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: Date.now(),
          description: 'Travel 1',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 3000,
          currency: 'USD',
          billable: false,
          status: 'Approved',
          date: Date.now(),
          description: 'Materials 1',
          createdAt: Date.now(),
        })

        return await db.listExpensesByUser(ctx.db, userId)
      })

      expect(result.length).toBe(3)
      expect(result.map((e) => e.type).sort()).toEqual(['Materials', 'Software', 'Travel'])
    })

    it('lists expenses by project', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: Date.now(),
          description: 'Client software',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 15000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Client travel',
          createdAt: Date.now(),
        })

        return await db.listExpensesByProject(ctx.db, projectId)
      })

      expect(result.length).toBe(2)
    })

    it('lists expenses by status', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: false,
          status: 'Draft',
          date: Date.now(),
          description: 'Draft expense',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 10000,
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: Date.now(),
          description: 'Submitted expense',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 3000,
          currency: 'USD',
          billable: false,
          status: 'Submitted',
          date: Date.now(),
          description: 'Another submitted expense',
          createdAt: Date.now(),
        })

        const submitted = await db.listExpensesByStatus(ctx.db, orgId, 'Submitted')
        const draft = await db.listExpensesByStatus(ctx.db, orgId, 'Draft')

        return { submitted: submitted.length, draft: draft.length }
      })

      expect(result.submitted).toBe(2)
      expect(result.draft).toBe(1)
    })
  })

  // ============================================================================
  // BILLABLE EXPENSE CALCULATIONS TESTS
  // ============================================================================

  describe('Billable Expense Calculations', () => {
    it('calculates total billable expenses for project', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create mix of billable and non-billable expenses
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 10000, // $100
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: Date.now(),
          description: 'Billable software',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 25000, // $250
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: Date.now(),
          description: 'Billable travel',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 5000, // $50
          currency: 'USD',
          billable: false, // Non-billable
          status: 'Approved',
          date: Date.now(),
          description: 'Internal materials',
          createdAt: Date.now(),
        })

        const expenses = await db.listExpensesByProject(ctx.db, projectId)
        const totalBillable = expenses
          .filter((e) => e.billable)
          .reduce((sum, e) => sum + e.amount, 0)
        const totalNonBillable = expenses
          .filter((e) => !e.billable)
          .reduce((sum, e) => sum + e.amount, 0)

        return { totalBillable, totalNonBillable }
      })

      expect(result.totalBillable).toBe(35000) // $350 (100 + 250)
      expect(result.totalNonBillable).toBe(5000) // $50
    })

    it('gets approved billable expenses for invoicing', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create various expenses
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 15000,
          currency: 'USD',
          billable: true,
          status: 'Approved', // Ready for invoicing
          date: Date.now(),
          description: 'Approved billable',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Draft', // Not approved yet
          date: Date.now(),
          description: 'Draft billable',
          createdAt: Date.now(),
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 3000,
          currency: 'USD',
          billable: false, // Non-billable
          status: 'Approved',
          date: Date.now(),
          description: 'Approved non-billable',
          createdAt: Date.now(),
        })

        return await db.listApprovedBillableExpensesForInvoicing(ctx.db, projectId)
      })

      expect(result.length).toBe(1)
      expect(result[0].amount).toBe(15000)
      expect(result[0].billable).toBe(true)
      expect(result[0].status).toBe('Approved')
    })
  })

  // ============================================================================
  // EXPENSE STATUS WORKFLOW TESTS
  // ============================================================================

  describe('Status Workflow', () => {
    it('transitions through correct status workflow', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const managerId = await db.insertUser(ctx.db, {
          organizationId: orgId,
          email: 'manager@test.com',
          name: 'Manager',
          isActive: true,
        })

        // Create draft expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 20000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: Date.now(),
          description: 'Business trip',
          createdAt: Date.now(),
        })

        const statuses: string[] = []

        // Get initial status
        let expense = await db.getExpense(ctx.db, expenseId)
        statuses.push(expense!.status)

        // Submit
        await db.updateExpense(ctx.db, expenseId, { status: 'Submitted' })
        expense = await db.getExpense(ctx.db, expenseId)
        statuses.push(expense!.status)

        // Approve
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: Date.now(),
        })
        expense = await db.getExpense(ctx.db, expenseId)
        statuses.push(expense!.status)

        return statuses
      })

      expect(result).toEqual(['Draft', 'Submitted', 'Approved'])
    })

    it('handles rejection workflow', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create submitted expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Travel',
          amount: 50000,
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: Date.now(),
          description: 'Expensive dinner',
          createdAt: Date.now(),
        })

        // Reject with comments
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Rejected',
          rejectionComments: 'Amount exceeds policy limit. Please attach manager pre-approval.',
        })

        const expense = await db.getExpense(ctx.db, expenseId)

        return {
          status: expense!.status,
          rejectionComments: expense!.rejectionComments,
        }
      })

      expect(result.status).toBe('Rejected')
      expect(result.rejectionComments).toBe(
        'Amount exceeds policy limit. Please attach manager pre-approval.'
      )
    })

    it('handles revision after rejection', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create rejected expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          type: 'Materials',
          amount: 10000,
          currency: 'USD',
          billable: false,
          status: 'Rejected',
          date: Date.now(),
          description: 'Supplies',
          rejectionComments: 'Missing receipt',
          createdAt: Date.now(),
        })

        // Revise: attach receipt and resubmit
        await db.updateExpense(ctx.db, expenseId, {
          receiptUrl: 'https://storage.example.com/receipts/supplies.pdf',
          status: 'Draft', // Back to draft for revision
          rejectionComments: undefined, // Clear rejection comments
        })

        // Resubmit
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Submitted',
        })

        const expense = await db.getExpense(ctx.db, expenseId)

        return {
          status: expense!.status,
          hasReceipt: !!expense!.receiptUrl,
          rejectionCleared: !expense!.rejectionComments,
        }
      })

      expect(result.status).toBe('Submitted')
      expect(result.hasReceipt).toBe(true)
      expect(result.rejectionCleared).toBe(true)
    })
  })

  // ============================================================================
  // EXPENSE TYPE SPECIFIC TESTS
  // ============================================================================

  describe('Expense Type Specifics', () => {
    it('tracks different expense types correctly', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create one of each type
        const types = ['Software', 'Travel', 'Materials', 'Subcontractor', 'Other'] as const

        for (const type of types) {
          await db.insertExpense(ctx.db, {
            organizationId: orgId,
            userId,
            projectId,
            type,
            amount: 1000,
            currency: 'USD',
            billable: false,
            status: 'Draft',
            date: Date.now(),
            description: `${type} expense`,
            createdAt: Date.now(),
          })
        }

        const expenses = await db.listExpensesByProject(ctx.db, projectId)
        const typeCount = new Map<string, number>()
        for (const e of expenses) {
          typeCount.set(e.type, (typeCount.get(e.type) || 0) + 1)
        }

        return {
          total: expenses.length,
          software: typeCount.get('Software'),
          travel: typeCount.get('Travel'),
          materials: typeCount.get('Materials'),
          subcontractor: typeCount.get('Subcontractor'),
          other: typeCount.get('Other'),
        }
      })

      expect(result.total).toBe(5)
      expect(result.software).toBe(1)
      expect(result.travel).toBe(1)
      expect(result.materials).toBe(1)
      expect(result.subcontractor).toBe(1)
      expect(result.other).toBe(1)
    })
  })
})
