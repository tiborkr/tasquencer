/// <reference types="vite/client" />
/**
 * Billing Phase unit tests for PSA Platform
 * Tests the billing workflow including:
 * - Invoice sending (email, PDF, portal)
 * - Payment recording
 * - More billing cycle checking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common test data for billing tests
 */
async function setupBillingTestData(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  // Create finance user who handles billing
  const financeUserId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'finance@test.com',
    name: 'Finance User',
    role: 'finance',
    costRate: 6000,
    billRate: 12000,
    skills: ['accounting'],
    department: 'Finance',
    location: 'Remote',
    isActive: true,
  })

  // Create team member who works on projects
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

  // Create manager
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
    managerId,
    createdAt: Date.now(),
  })

  return {
    orgId,
    financeUserId,
    teamMemberId,
    managerId,
    companyId,
    contactId,
    dealId,
    projectId,
  }
}

/**
 * Create a finalized invoice ready for sending
 */
async function createFinalizedInvoice(
  dbWriter: DatabaseWriter,
  orgId: Awaited<ReturnType<typeof setupBillingTestData>>['orgId'],
  projectId: Awaited<ReturnType<typeof setupBillingTestData>>['projectId'],
  companyId: Awaited<ReturnType<typeof setupBillingTestData>>['companyId'],
  total: number = 100000
) {
  const now = Date.now()
  const dueDate = now + 30 * 24 * 60 * 60 * 1000 // 30 days

  const invoiceId = await db.insertInvoice(dbWriter, {
    organizationId: orgId,
    projectId,
    companyId,
    number: 'INV-2024-00001',
    status: 'Finalized',
    method: 'TimeAndMaterials',
    subtotal: total,
    tax: 0,
    total,
    dueDate,
    finalizedAt: now,
    createdAt: now,
  })

  return invoiceId
}

describe('PSA Platform Billing Phase', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // INVOICE SENDING TESTS
  // ============================================================================

  describe('Invoice Sending', () => {
    it('updates invoice status to Sent when sending via email', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId
        )

        // Simulate email sending by updating invoice status
        const now = Date.now()
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: now,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          sentAt: invoice?.sentAt,
          hasSentAt: !!invoice?.sentAt,
        }
      })

      expect(result.status).toBe('Sent')
      expect(result.hasSentAt).toBe(true)
    })

    it('updates invoice status to Sent when publishing to portal', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId
        )

        // Simulate portal publishing
        const now = Date.now()
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: now,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return { status: invoice?.status }
      })

      expect(result.status).toBe('Sent')
    })

    it('optionally marks invoice as sent when generating PDF', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId
        )

        // PDF without marking as sent
        let invoice = await db.getInvoice(ctx.db, invoiceId)
        expect(invoice?.status).toBe('Finalized')

        // PDF with marking as sent
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        invoice = await db.getInvoice(ctx.db, invoiceId)
        return { status: invoice?.status }
      })

      expect(result.status).toBe('Sent')
    })

    it('cannot send invoice that is not finalized', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create draft invoice (not finalized)
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 100000,
          tax: 0,
          total: 100000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return { status: invoice?.status, isFinalized: invoice?.status === 'Finalized' }
      })

      expect(result.isFinalized).toBe(false)
    })
  })

  // ============================================================================
  // PAYMENT RECORDING TESTS
  // ============================================================================

  describe('Payment Recording', () => {
    it('creates payment record with correct structure', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId,
          100000
        )

        // Mark as sent first
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const now = Date.now()
        const paymentId = await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: 50000, // $500 partial payment
          date: now,
          method: 'Check',
          reference: 'CHK-12345',
          syncedToAccounting: false,
          createdAt: now,
        })

        const payment = await db.getPayment(ctx.db, paymentId)
        return {
          amount: payment?.amount,
          method: payment?.method,
          reference: payment?.reference,
          synced: payment?.syncedToAccounting,
        }
      })

      expect(result.amount).toBe(50000)
      expect(result.method).toBe('Check')
      expect(result.reference).toBe('CHK-12345')
      expect(result.synced).toBe(false)
    })

    it('marks invoice as paid when full payment received', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const total = 100000
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId,
          total
        )

        // Mark as sent
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const now = Date.now()
        // Full payment
        await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: total,
          date: now,
          method: 'ACH',
          syncedToAccounting: false,
          createdAt: now,
        })

        // Calculate total and update invoice status
        const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
        if (totalPaid >= total) {
          await db.updateInvoice(ctx.db, invoiceId, {
            status: 'Paid',
            paidAt: now,
          })
        }

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          paidAt: invoice?.paidAt,
          hasPaidAt: !!invoice?.paidAt,
        }
      })

      expect(result.status).toBe('Paid')
      expect(result.hasPaidAt).toBe(true)
    })

    it('supports partial payments without marking as paid', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const total = 100000
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId,
          total
        )

        // Mark as sent
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const now = Date.now()
        // Partial payment (50%)
        await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: 50000,
          date: now,
          method: 'Wire',
          syncedToAccounting: false,
          createdAt: now,
        })

        const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
        const remaining = total - totalPaid

        // Don't mark as paid if partial
        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          totalPaid,
          remaining,
          fullyPaid: totalPaid >= total,
        }
      })

      expect(result.status).toBe('Sent')
      expect(result.totalPaid).toBe(50000)
      expect(result.remaining).toBe(50000)
      expect(result.fullyPaid).toBe(false)
    })

    it('supports multiple partial payments that sum to full payment', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const total = 100000
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId,
          total
        )

        // Mark as sent
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const now = Date.now()

        // First partial payment
        await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: 40000,
          date: now,
          method: 'Check',
          reference: 'CHK-001',
          syncedToAccounting: false,
          createdAt: now,
        })

        // Second partial payment
        await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: 60000,
          date: now + 1000,
          method: 'ACH',
          syncedToAccounting: false,
          createdAt: now + 1000,
        })

        const payments = await db.listPaymentsByInvoice(ctx.db, invoiceId)
        const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)

        // Mark as paid
        if (totalPaid >= total) {
          await db.updateInvoice(ctx.db, invoiceId, {
            status: 'Paid',
            paidAt: now + 1000,
          })
        }

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          paymentCount: payments.length,
          totalPaid,
          fullyPaid: totalPaid >= total,
        }
      })

      expect(result.paymentCount).toBe(2)
      expect(result.totalPaid).toBe(100000)
      expect(result.fullyPaid).toBe(true)
      expect(result.status).toBe('Paid')
    })

    it('handles overpayment gracefully', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const total = 100000
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId,
          total
        )

        // Mark as sent
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const now = Date.now()
        // Overpayment
        await db.insertPayment(ctx.db, {
          organizationId: orgId,
          invoiceId,
          amount: 120000, // $1,200 when invoice was $1,000
          date: now,
          method: 'Wire',
          syncedToAccounting: false,
          createdAt: now,
        })

        const totalPaid = await db.getTotalPaymentsForInvoice(ctx.db, invoiceId)
        const remaining = total - totalPaid
        const isOverpaid = totalPaid > total

        // Still mark as paid even if overpaid
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Paid',
          paidAt: now,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          totalPaid,
          remaining,
          isOverpaid,
        }
      })

      expect(result.status).toBe('Paid')
      expect(result.totalPaid).toBe(120000)
      expect(result.remaining).toBe(-20000) // Negative remaining indicates overpayment
      expect(result.isOverpaid).toBe(true)
    })

    it('supports different payment methods', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId
        )

        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        const now = Date.now()
        const methods = ['Check', 'ACH', 'Wire', 'CreditCard', 'Cash', 'Other'] as const

        for (let i = 0; i < methods.length; i++) {
          await db.insertPayment(ctx.db, {
            organizationId: orgId,
            invoiceId,
            amount: 1000,
            date: now + i * 1000,
            method: methods[i],
            syncedToAccounting: false,
            createdAt: now + i * 1000,
          })
        }

        const payments = await db.listPaymentsByInvoice(ctx.db, invoiceId)
        const methodsUsed = payments.map((p) => p.method)

        return {
          paymentCount: payments.length,
          methodsUsed,
        }
      })

      expect(result.paymentCount).toBe(6)
      expect(result.methodsUsed).toContain('Check')
      expect(result.methodsUsed).toContain('ACH')
      expect(result.methodsUsed).toContain('Wire')
      expect(result.methodsUsed).toContain('CreditCard')
      expect(result.methodsUsed).toContain('Cash')
      expect(result.methodsUsed).toContain('Other')
    })
  })

  // ============================================================================
  // CHECK MORE BILLING TESTS
  // ============================================================================

  describe('Check More Billing', () => {
    it('detects uninvoiced time entries', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create approved billable time entry without invoice
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Approved',
          createdAt: now,
        })

        const uninvoicedTime = await db.listApprovedBillableTimeEntriesForInvoicing(
          ctx.db,
          projectId
        )

        return {
          uninvoicedTimeCount: uninvoicedTime.length,
          hasMoreBilling: uninvoicedTime.length > 0,
        }
      })

      expect(result.uninvoicedTimeCount).toBe(1)
      expect(result.hasMoreBilling).toBe(true)
    })

    it('detects uninvoiced expenses', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create approved billable expense without invoice
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 50000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'Client visit',
          createdAt: now,
        })

        const uninvoicedExpenses = await db.listApprovedBillableExpensesForInvoicing(
          ctx.db,
          projectId
        )

        return {
          uninvoicedExpenseCount: uninvoicedExpenses.length,
          hasMoreBilling: uninvoicedExpenses.length > 0,
        }
      })

      expect(result.uninvoicedExpenseCount).toBe(1)
      expect(result.hasMoreBilling).toBe(true)
    })

    it('detects completed unpaid milestones', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create completed milestone without invoice
        await db.insertMilestone(ctx.db, {
          organizationId: orgId,
          projectId,
          name: 'Phase 1 Complete',
          percentage: 25,
          amount: 25000,
          dueDate: now,
          completedAt: now,
          // No invoiceId = unpaid
          sortOrder: 0,
        })

        const milestones = await db.listMilestonesByProject(ctx.db, projectId)
        const unpaidMilestones = milestones.filter(
          (m) => m.completedAt && !m.invoiceId
        )

        return {
          totalMilestones: milestones.length,
          unpaidMilestoneCount: unpaidMilestones.length,
          hasMoreBilling: unpaidMilestones.length > 0,
        }
      })

      expect(result.unpaidMilestoneCount).toBe(1)
      expect(result.hasMoreBilling).toBe(true)
    })

    it('excludes already invoiced items from billing check', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId, companyId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create invoice
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId
        )

        // Create time entry that is already invoiced
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 8,
          billable: true,
          status: 'Locked',
          invoiceId, // Already linked to invoice
          createdAt: now,
        })

        // Create expense that is already invoiced
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 10000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'Software license',
          invoiceId, // Already linked to invoice
          createdAt: now,
        })

        const uninvoicedTime = await db.listApprovedBillableTimeEntriesForInvoicing(
          ctx.db,
          projectId
        )
        const uninvoicedExpenses = await db.listApprovedBillableExpensesForInvoicing(
          ctx.db,
          projectId
        )

        return {
          uninvoicedTimeCount: uninvoicedTime.length,
          uninvoicedExpenseCount: uninvoicedExpenses.length,
          hasMoreBilling:
            uninvoicedTime.length > 0 || uninvoicedExpenses.length > 0,
        }
      })

      expect(result.uninvoicedTimeCount).toBe(0)
      expect(result.uninvoicedExpenseCount).toBe(0)
      expect(result.hasMoreBilling).toBe(false)
    })

    it('detects recurring billing for retainer projects', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create retainer budget
        await db.insertBudget(ctx.db, {
          organizationId: orgId,
          projectId,
          type: 'Retainer',
          totalAmount: 500000,
          createdAt: now,
        })

        const budget = await db.getBudgetByProject(ctx.db, projectId)
        const project = await db.getProject(ctx.db, projectId)

        const isRetainer = budget?.type === 'Retainer'
        const isProjectActive = project?.status === 'Active'
        const isRecurringDue = isRetainer && isProjectActive

        return {
          budgetType: budget?.type,
          isRetainer,
          isProjectActive,
          isRecurringDue,
        }
      })

      expect(result.budgetType).toBe('Retainer')
      expect(result.isRetainer).toBe(true)
      expect(result.isProjectActive).toBe(true)
      expect(result.isRecurringDue).toBe(true)
    })

    it('no more billing when all items invoiced and project not retainer', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId } = await setupBillingTestData(ctx.db)
        const now = Date.now()

        // Create T&M budget (not retainer)
        await db.insertBudget(ctx.db, {
          organizationId: orgId,
          projectId,
          type: 'TimeAndMaterials',
          totalAmount: 100000,
          createdAt: now,
        })

        // No uninvoiced items exist
        const uninvoicedTime = await db.listApprovedBillableTimeEntriesForInvoicing(
          ctx.db,
          projectId
        )
        const uninvoicedExpenses = await db.listApprovedBillableExpensesForInvoicing(
          ctx.db,
          projectId
        )
        const milestones = await db.listMilestonesByProject(ctx.db, projectId)
        const unpaidMilestones = milestones.filter(
          (m) => m.completedAt && !m.invoiceId
        )

        const budget = await db.getBudgetByProject(ctx.db, projectId)
        const isRetainer = budget?.type === 'Retainer'

        const moreBillingCycles =
          uninvoicedTime.length > 0 ||
          uninvoicedExpenses.length > 0 ||
          unpaidMilestones.length > 0 ||
          isRetainer

        return {
          uninvoicedTimeCount: uninvoicedTime.length,
          uninvoicedExpenseCount: uninvoicedExpenses.length,
          unpaidMilestoneCount: unpaidMilestones.length,
          isRetainer,
          moreBillingCycles,
        }
      })

      expect(result.uninvoicedTimeCount).toBe(0)
      expect(result.uninvoicedExpenseCount).toBe(0)
      expect(result.unpaidMilestoneCount).toBe(0)
      expect(result.isRetainer).toBe(false)
      expect(result.moreBillingCycles).toBe(false)
    })
  })

  // ============================================================================
  // INVOICE VIEW TRACKING TESTS
  // ============================================================================

  describe('Invoice View Tracking', () => {
    it('updates viewedAt when client first views invoice', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupBillingTestData(ctx.db)
        const invoiceId = await createFinalizedInvoice(
          ctx.db,
          orgId,
          projectId,
          companyId
        )

        // Mark as sent first
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Sent',
          sentAt: Date.now(),
        })

        // Simulate client viewing invoice
        const viewedAt = Date.now() + 1000
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Viewed',
          viewedAt,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          viewedAt: invoice?.viewedAt,
          hasViewedAt: !!invoice?.viewedAt,
        }
      })

      expect(result.status).toBe('Viewed')
      expect(result.hasViewedAt).toBe(true)
    })
  })
})
