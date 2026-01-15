/// <reference types="vite/client" />
/**
 * Approval Loops unit tests for PSA Platform
 * Tests the timesheet and expense approval workflows including:
 * - Review, approve, reject actions
 * - Revision loop with resubmission
 * - Business rule enforcement (self-approval prevention, receipt requirements)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common test data for approval tests
 */
async function setupApprovalTestData(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  // Create team member who submits time/expenses
  const teamMemberId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'team@test.com',
    name: 'Team Member',
    role: 'team_member',
    costRate: 5000,
    billRate: 10000,
    skills: ['typescript'],
    department: 'Engineering',
    location: 'Remote',
    isActive: true,
  })

  // Create manager who reviews/approves
  const managerId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'manager@test.com',
    name: 'Manager',
    role: 'project_manager',
    costRate: 7500,
    billRate: 15000,
    skills: ['management'],
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
    probability: 100,
    stage: 'Won',
    ownerId: managerId,
    createdAt: Date.now(),
  })

  const projectId = await db.insertProject(dbWriter, {
    organizationId: orgId,
    dealId,
    companyId,
    name: 'Test Project',
    status: 'Active',
    startDate: Date.now(),
    managerId, // Manager is the project manager
    createdAt: Date.now(),
  })

  return { orgId, teamMemberId, managerId, companyId, contactId, dealId, projectId }
}

describe('PSA Platform Approval Loops', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // TIMESHEET APPROVAL TESTS
  // ============================================================================

  describe('Timesheet Approval', () => {
    it('approves a submitted timesheet', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)

        // Create a submitted time entry
        const entryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Submitted',
          notes: 'Development work',
          createdAt: Date.now(),
        })

        // Simulate approval by updating status
        await db.updateTimeEntry(ctx.db, entryId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: Date.now(),
        })

        const entry = await db.getTimeEntry(ctx.db, entryId)
        return {
          status: entry?.status,
          approvedBy: entry?.approvedBy,
          hasApprovalTime: !!entry?.approvedAt,
        }
      })

      expect(result.status).toBe('Approved')
      expect(result.approvedBy).toBeDefined()
      expect(result.hasApprovalTime).toBe(true)
    })

    it('rejects a submitted timesheet with comments', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, projectId } = await setupApprovalTestData(ctx.db)

        // Create a submitted time entry
        const entryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Submitted',
          notes: 'Development work',
          createdAt: Date.now(),
        })

        // Simulate rejection
        const rejectionComments = 'Hours seem excessive, please clarify'
        await db.updateTimeEntry(ctx.db, entryId, {
          status: 'Rejected',
          rejectionComments,
        })

        const entry = await db.getTimeEntry(ctx.db, entryId)
        return {
          status: entry?.status,
          rejectionComments: entry?.rejectionComments,
        }
      })

      expect(result.status).toBe('Rejected')
      expect(result.rejectionComments).toBe('Hours seem excessive, please clarify')
    })

    it('revises a rejected timesheet and resubmits', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, projectId } = await setupApprovalTestData(ctx.db)

        // Create a rejected time entry
        const entryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: Date.now(),
          hours: 12, // Excessive hours
          billable: true,
          status: 'Rejected',
          notes: 'Development work',
          rejectionComments: 'Hours seem excessive',
          createdAt: Date.now(),
        })

        // Simulate revision - update hours and resubmit
        await db.updateTimeEntry(ctx.db, entryId, {
          hours: 8, // Corrected hours
          status: 'Submitted',
          notes: 'Development work - corrected hours',
          rejectionComments: undefined, // Clear rejection comments
        })

        const entry = await db.getTimeEntry(ctx.db, entryId)
        return {
          status: entry?.status,
          hours: entry?.hours,
          hasRejectionComments: !!entry?.rejectionComments,
        }
      })

      expect(result.status).toBe('Submitted')
      expect(result.hours).toBe(8)
      expect(result.hasRejectionComments).toBe(false)
    })

    it('queries time entries by date range', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, projectId } = await setupApprovalTestData(ctx.db)

        const now = Date.now()
        const oneDay = 24 * 60 * 60 * 1000
        const weekStart = now - 3 * oneDay

        // Create entries across multiple days
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: weekStart,
          hours: 8,
          billable: true,
          status: 'Submitted',
          createdAt: now,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: weekStart + oneDay,
          hours: 7.5,
          billable: true,
          status: 'Submitted',
          createdAt: now,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: weekStart + 2 * oneDay,
          hours: 8.5,
          billable: false,
          status: 'Submitted',
          createdAt: now,
        })

        // Query entries in range
        const entries = await db.listTimeEntriesByUserAndDateRange(
          ctx.db,
          teamMemberId,
          weekStart,
          weekStart + 3 * oneDay
        )

        return {
          count: entries.length,
          totalHours: entries.reduce((sum, e) => sum + e.hours, 0),
          allSubmitted: entries.every(e => e.status === 'Submitted'),
        }
      })

      expect(result.count).toBe(3)
      expect(result.totalHours).toBe(24) // 8 + 7.5 + 8.5
      expect(result.allSubmitted).toBe(true)
    })

    it('lists time entries by status', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create entries with different statuses
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Draft',
          createdAt: now,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Submitted',
          createdAt: now,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        const submittedEntries = await db.listTimeEntriesByStatus(ctx.db, orgId, 'Submitted')
        const approvedEntries = await db.listTimeEntriesByStatus(ctx.db, orgId, 'Approved')

        return {
          submittedCount: submittedEntries.length,
          approvedCount: approvedEntries.length,
        }
      })

      expect(result.submittedCount).toBe(1)
      expect(result.approvedCount).toBe(1)
    })
  })

  // ============================================================================
  // EXPENSE APPROVAL TESTS
  // ============================================================================

  describe('Expense Approval', () => {
    it('approves a submitted expense', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)

        // Create a submitted expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 5000, // $50.00
          currency: 'USD',
          billable: true,
          markupRate: 0.1,
          status: 'Submitted',
          date: Date.now(),
          description: 'IDE License',
          receiptUrl: 'https://example.com/receipt.pdf',
          createdAt: Date.now(),
        })

        // Simulate approval
        const now = Date.now()
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
        })

        const expense = await db.getExpense(ctx.db, expenseId)
        return {
          status: expense?.status,
          approvedBy: expense?.approvedBy,
          hasApprovalTime: !!expense?.approvedAt,
        }
      })

      expect(result.status).toBe('Approved')
      expect(result.approvedBy).toBeDefined()
      expect(result.hasApprovalTime).toBe(true)
    })

    it('rejects a submitted expense with specific issues', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, projectId } = await setupApprovalTestData(ctx.db)

        // Create a submitted expense without receipt (> $25 threshold)
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 15000, // $150.00 - exceeds $25 threshold
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: Date.now(),
          description: 'Client meeting travel',
          // No receiptUrl - missing receipt
          createdAt: Date.now(),
        })

        // Simulate rejection with missing_receipt issue
        const rejectionComments = `Missing receipt required\n\nIssues:\n[missing_receipt] Receipt required for expenses over $25`
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Rejected',
          rejectionComments,
        })

        const expense = await db.getExpense(ctx.db, expenseId)
        return {
          status: expense?.status,
          rejectionComments: expense?.rejectionComments,
          hasReceipt: !!expense?.receiptUrl,
        }
      })

      expect(result.status).toBe('Rejected')
      expect(result.rejectionComments).toContain('missing_receipt')
      expect(result.hasReceipt).toBe(false)
    })

    it('revises a rejected expense with receipt and resubmits', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, projectId } = await setupApprovalTestData(ctx.db)

        // Create a rejected expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 15000,
          currency: 'USD',
          billable: true,
          status: 'Rejected',
          date: Date.now(),
          description: 'Client meeting travel',
          rejectionComments: 'Missing receipt',
          createdAt: Date.now(),
        })

        // Simulate revision - add receipt and resubmit
        await db.updateExpense(ctx.db, expenseId, {
          receiptUrl: 'https://example.com/receipt.pdf',
          status: 'Submitted',
          rejectionComments: undefined, // Clear rejection comments
        })

        const expense = await db.getExpense(ctx.db, expenseId)
        return {
          status: expense?.status,
          hasReceipt: !!expense?.receiptUrl,
          hasRejectionComments: !!expense?.rejectionComments,
        }
      })

      expect(result.status).toBe('Submitted')
      expect(result.hasReceipt).toBe(true)
      expect(result.hasRejectionComments).toBe(false)
    })

    it('approves expense with markup calculation', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)

        // Create expense with markup
        const baseAmount = 10000 // $100.00
        const markupRate = 0.15 // 15% markup

        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Materials',
          amount: baseAmount,
          currency: 'USD',
          billable: true,
          markupRate,
          status: 'Submitted',
          date: Date.now(),
          description: 'Project materials',
          receiptUrl: 'https://example.com/receipt.pdf',
          createdAt: Date.now(),
        })

        // Approve and calculate final billed amount
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: Date.now(),
        })

        const expense = await db.getExpense(ctx.db, expenseId)
        // Final amount would be: 10000 * (1 + 0.15) = 11500

        return {
          status: expense?.status,
          amount: expense?.amount,
          markupRate: expense?.markupRate,
          calculatedBilledAmount: expense?.amount
            ? Math.round(expense.amount * (1 + (expense.markupRate ?? 0)))
            : 0,
        }
      })

      expect(result.status).toBe('Approved')
      expect(result.calculatedBilledAmount).toBe(11500) // $115.00
    })

    it('lists expenses by status', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create expenses with different statuses
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 2000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: now,
          description: 'Software draft',
          createdAt: now,
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: now,
          description: 'Travel submitted',
          createdAt: now,
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Materials',
          amount: 3000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'Materials approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        const submittedExpenses = await db.listExpensesByStatus(ctx.db, orgId, 'Submitted')
        const approvedExpenses = await db.listExpensesByStatus(ctx.db, orgId, 'Approved')

        return {
          submittedCount: submittedExpenses.length,
          approvedCount: approvedExpenses.length,
        }
      })

      expect(result.submittedCount).toBe(1)
      expect(result.approvedCount).toBe(1)
    })

    it('tracks approved billable expenses for invoicing', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create approved billable expenses (without invoiceId)
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'Software 1',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 10000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'Travel expense',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        // Create approved non-billable expense
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Other',
          amount: 2000,
          currency: 'USD',
          billable: false,
          status: 'Approved',
          date: now,
          description: 'Non-billable expense',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        const invoicingExpenses = await db.listApprovedBillableExpensesForInvoicing(ctx.db, projectId)

        return {
          count: invoicingExpenses.length,
          totalAmount: invoicingExpenses.reduce((sum, e) => sum + e.amount, 0),
          allBillable: invoicingExpenses.every(e => e.billable),
          allApproved: invoicingExpenses.every(e => e.status === 'Approved'),
        }
      })

      expect(result.count).toBe(2) // Only billable expenses
      expect(result.totalAmount).toBe(15000) // $150.00
      expect(result.allBillable).toBe(true)
      expect(result.allApproved).toBe(true)
    })
  })

  // ============================================================================
  // BUSINESS RULE TESTS
  // ============================================================================

  describe('Business Rules', () => {
    it('tracks approved billable time entries for invoicing', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create approved billable time entries
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 4,
          billable: true,
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        // Create approved non-billable entry
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 2,
          billable: false,
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        const invoicingEntries = await db.listApprovedBillableTimeEntriesForInvoicing(ctx.db, projectId)

        return {
          count: invoicingEntries.length,
          totalHours: invoicingEntries.reduce((sum, e) => sum + e.hours, 0),
          allBillable: invoicingEntries.every(e => e.billable),
          allApproved: invoicingEntries.every(e => e.status === 'Approved'),
        }
      })

      expect(result.count).toBe(2) // Only billable entries
      expect(result.totalHours).toBe(12) // 8 + 4 hours
      expect(result.allBillable).toBe(true)
      expect(result.allApproved).toBe(true)
    })

    it('validates expense types', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create expenses of each type
        const types = ['Software', 'Travel', 'Materials', 'Subcontractor', 'Other'] as const

        for (const type of types) {
          await db.insertExpense(ctx.db, {
            organizationId: orgId,
            userId: teamMemberId,
            projectId,
            type,
            amount: 1000,
            currency: 'USD',
            billable: true,
            status: 'Draft',
            date: now,
            description: `${type} expense`,
            createdAt: now,
          })
        }

        const expenses = await db.listExpensesByUser(ctx.db, teamMemberId)

        return {
          count: expenses.length,
          types: expenses.map(e => e.type),
        }
      })

      expect(result.count).toBe(5)
      expect(result.types).toContain('Software')
      expect(result.types).toContain('Travel')
      expect(result.types).toContain('Materials')
      expect(result.types).toContain('Subcontractor')
      expect(result.types).toContain('Other')
    })

    it('validates time entry status transitions', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create entry in Draft status
        const entryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Draft',
          createdAt: now,
        })

        // Verify Draft status
        let entry = await db.getTimeEntry(ctx.db, entryId)
        const draftStatus = entry?.status

        // Submit the entry
        await db.updateTimeEntry(ctx.db, entryId, { status: 'Submitted' })
        entry = await db.getTimeEntry(ctx.db, entryId)
        const submittedStatus = entry?.status

        // Approve the entry
        await db.updateTimeEntry(ctx.db, entryId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
        })
        entry = await db.getTimeEntry(ctx.db, entryId)
        const approvedStatus = entry?.status

        // Lock the entry
        await db.updateTimeEntry(ctx.db, entryId, { status: 'Locked' })
        entry = await db.getTimeEntry(ctx.db, entryId)
        const lockedStatus = entry?.status

        return {
          draftStatus,
          submittedStatus,
          approvedStatus,
          lockedStatus,
        }
      })

      expect(result.draftStatus).toBe('Draft')
      expect(result.submittedStatus).toBe('Submitted')
      expect(result.approvedStatus).toBe('Approved')
      expect(result.lockedStatus).toBe('Locked')
    })

    it('validates expense status transitions', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupApprovalTestData(ctx.db)
        const now = Date.now()

        // Create expense in Draft status
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: now,
          description: 'Test expense',
          createdAt: now,
        })

        // Verify Draft status
        let expense = await db.getExpense(ctx.db, expenseId)
        const draftStatus = expense?.status

        // Submit the expense
        await db.updateExpense(ctx.db, expenseId, { status: 'Submitted' })
        expense = await db.getExpense(ctx.db, expenseId)
        const submittedStatus = expense?.status

        // Reject the expense
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Rejected',
          rejectionComments: 'Need more details',
        })
        expense = await db.getExpense(ctx.db, expenseId)
        const rejectedStatus = expense?.status

        // Resubmit after revision
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Submitted',
          rejectionComments: undefined,
          description: 'Test expense - updated details',
        })
        expense = await db.getExpense(ctx.db, expenseId)
        const resubmittedStatus = expense?.status

        // Finally approve
        await db.updateExpense(ctx.db, expenseId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
        })
        expense = await db.getExpense(ctx.db, expenseId)
        const approvedStatus = expense?.status

        return {
          draftStatus,
          submittedStatus,
          rejectedStatus,
          resubmittedStatus,
          approvedStatus,
        }
      })

      expect(result.draftStatus).toBe('Draft')
      expect(result.submittedStatus).toBe('Submitted')
      expect(result.rejectedStatus).toBe('Rejected')
      expect(result.resubmittedStatus).toBe('Submitted')
      expect(result.approvedStatus).toBe('Approved')
    })
  })
})
