/// <reference types="vite/client" />
/**
 * Invoice Generation unit tests for PSA Platform
 * Tests the invoice generation workflow including:
 * - Invoice method selection (T&M, Fixed Fee, Milestone, Recurring)
 * - Invoice creation with line items
 * - Draft review and editing
 * - Invoice finalization and number generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common test data for invoice tests
 */
async function setupInvoiceTestData(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  // Create finance user who creates/reviews invoices
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

describe('PSA Platform Invoice Generation', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // INVOICE CREATION TESTS
  // ============================================================================

  describe('Invoice Creation', () => {
    it('creates a draft invoice with correct structure', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()
        const dueDate = now + 30 * 24 * 60 * 60 * 1000 // 30 days from now

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 0,
          tax: 0,
          total: 0,
          dueDate,
          createdAt: now,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        return {
          status: invoice?.status,
          method: invoice?.method,
          hasProject: !!invoice?.projectId,
          hasCompany: !!invoice?.companyId,
        }
      })

      expect(result.status).toBe('Draft')
      expect(result.method).toBe('TimeAndMaterials')
      expect(result.hasProject).toBe(true)
      expect(result.hasCompany).toBe(true)
    })

    it('creates invoice line items with amounts', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create invoice
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 0,
          tax: 0,
          total: 0,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Add line items
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Development Services',
          quantity: 40, // 40 hours
          rate: 15000, // $150/hr
          amount: 600000, // $6,000
          sortOrder: 0,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Design Services',
          quantity: 20,
          rate: 12500, // $125/hr
          amount: 250000, // $2,500
          sortOrder: 1,
        })

        const lineItems = await db.listInvoiceLineItemsByInvoice(ctx.db, invoiceId)
        const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)

        return {
          lineItemCount: lineItems.length,
          subtotal,
          descriptions: lineItems.map((li) => li.description),
        }
      })

      expect(result.lineItemCount).toBe(2)
      expect(result.subtotal).toBe(850000) // $8,500
      expect(result.descriptions).toContain('Development Services')
      expect(result.descriptions).toContain('Design Services')
    })

    it('generates invoice numbers correctly', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Generate first invoice number and create an invoice with it
        const num1 = await db.getNextInvoiceNumber(ctx.db, orgId)
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Finalized',
          method: 'TimeAndMaterials',
          subtotal: 100000,
          tax: 0,
          total: 100000,
          number: num1,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Generate second invoice number and create an invoice with it
        const num2 = await db.getNextInvoiceNumber(ctx.db, orgId)
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Finalized',
          method: 'TimeAndMaterials',
          subtotal: 200000,
          tax: 0,
          total: 200000,
          number: num2,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Generate third invoice number
        const num3 = await db.getNextInvoiceNumber(ctx.db, orgId)

        return {
          num1,
          num2,
          num3,
          allUnique: new Set([num1, num2, num3]).size === 3,
          matchesPattern: num1.startsWith('INV-'),
        }
      })

      expect(result.allUnique).toBe(true)
      expect(result.matchesPattern).toBe(true)
    })
  })

  // ============================================================================
  // TIME AND MATERIALS INVOICING TESTS
  // ============================================================================

  describe('Time and Materials Invoicing', () => {
    it('aggregates approved time entries by service', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupInvoiceTestData(ctx.db)
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
          date: now - 24 * 60 * 60 * 1000,
          hours: 6,
          billable: true,
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        // Create a non-billable entry (should not be included)
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

        const invoicableEntries = await db.listApprovedBillableTimeEntriesForInvoicing(
          ctx.db,
          projectId
        )

        return {
          count: invoicableEntries.length,
          totalHours: invoicableEntries.reduce((sum, e) => sum + e.hours, 0),
          allBillable: invoicableEntries.every((e) => e.billable),
        }
      })

      expect(result.count).toBe(2)
      expect(result.totalHours).toBe(14)
      expect(result.allBillable).toBe(true)
    })

    it('includes approved billable expenses', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, projectId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create approved billable expenses
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 5000, // $50.00
          currency: 'USD',
          billable: true,
          markupRate: 0.1, // 10% markup
          status: 'Approved',
          date: now,
          description: 'IDE License',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 10000, // $100.00
          currency: 'USD',
          billable: true,
          markupRate: 0.15, // 15% markup
          status: 'Approved',
          date: now,
          description: 'Client meeting',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        // Non-billable expense (should not be included)
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
          description: 'Internal expense',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        const invoicableExpenses = await db.listApprovedBillableExpensesForInvoicing(
          ctx.db,
          projectId
        )

        // Calculate billed amounts with markup
        const billedAmounts = invoicableExpenses.map((e) =>
          Math.round(e.amount * (1 + (e.markupRate ?? 0)))
        )

        return {
          count: invoicableExpenses.length,
          totalBase: invoicableExpenses.reduce((sum, e) => sum + e.amount, 0),
          totalBilled: billedAmounts.reduce((sum, a) => sum + a, 0),
          allBillable: invoicableExpenses.every((e) => e.billable),
        }
      })

      expect(result.count).toBe(2)
      expect(result.totalBase).toBe(15000) // $150.00
      expect(result.totalBilled).toBe(17000) // $50*1.1 + $100*1.15 = $55 + $115 = $170.00
      expect(result.allBillable).toBe(true)
    })
  })

  // ============================================================================
  // FIXED FEE INVOICING TESTS
  // ============================================================================

  describe('Fixed Fee Invoicing', () => {
    it('creates fixed fee invoice with full budget amount', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create budget for project
        await db.insertBudget(ctx.db, {
          organizationId: orgId,
          projectId,
          type: 'FixedFee',
          totalAmount: 5000000, // $50,000
          createdAt: now,
        })

        // Create fixed fee invoice
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'FixedFee',
          subtotal: 5000000,
          tax: 0,
          total: 5000000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Fixed Fee Services',
          quantity: 1,
          rate: 5000000,
          amount: 5000000,
          sortOrder: 0,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        const lineItems = await db.listInvoiceLineItemsByInvoice(ctx.db, invoiceId)

        return {
          method: invoice?.method,
          total: invoice?.total,
          lineItemCount: lineItems.length,
          lineItemDescription: lineItems[0]?.description,
        }
      })

      expect(result.method).toBe('FixedFee')
      expect(result.total).toBe(5000000)
      expect(result.lineItemCount).toBe(1)
      expect(result.lineItemDescription).toBe('Fixed Fee Services')
    })

    it('creates fixed fee invoice with percentage of budget', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create budget for project
        await db.insertBudget(ctx.db, {
          organizationId: orgId,
          projectId,
          type: 'FixedFee',
          totalAmount: 10000000, // $100,000
          createdAt: now,
        })

        // Create invoice for 25% of budget
        const percentage = 25
        const amount = Math.round(10000000 * (percentage / 100))

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'FixedFee',
          subtotal: amount,
          tax: 0,
          total: amount,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: `Fixed Fee Services (${percentage}% of project)`,
          quantity: 1,
          rate: amount,
          amount,
          sortOrder: 0,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)

        return {
          total: invoice?.total,
          percentage: Math.round(((invoice?.total ?? 0) / 10000000) * 100),
        }
      })

      expect(result.total).toBe(2500000) // $25,000
      expect(result.percentage).toBe(25)
    })
  })

  // ============================================================================
  // MILESTONE INVOICING TESTS
  // ============================================================================

  describe('Milestone Invoicing', () => {
    it('creates invoice for completed milestone', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create milestone
        const milestoneId = await db.insertMilestone(ctx.db, {
          organizationId: orgId,
          projectId,
          name: 'Phase 1 Complete',
          percentage: 25,
          amount: 2500000, // $25,000
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          sortOrder: 0,
        })

        // Create invoice for milestone
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'Milestone',
          subtotal: 2500000,
          tax: 0,
          total: 2500000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Milestone: Phase 1 Complete',
          quantity: 1,
          rate: 2500000,
          amount: 2500000,
          sortOrder: 0,
        })

        // Mark milestone as completed and linked to invoice
        await db.updateMilestone(ctx.db, milestoneId, {
          completedAt: now,
          invoiceId,
        })

        const milestone = await db.getMilestone(ctx.db, milestoneId)
        const invoice = await db.getInvoice(ctx.db, invoiceId)

        return {
          milestoneCompleted: !!milestone?.completedAt,
          milestoneLinkedToInvoice: !!milestone?.invoiceId,
          invoiceMethod: invoice?.method,
          invoiceTotal: invoice?.total,
        }
      })

      expect(result.milestoneCompleted).toBe(true)
      expect(result.milestoneLinkedToInvoice).toBe(true)
      expect(result.invoiceMethod).toBe('Milestone')
      expect(result.invoiceTotal).toBe(2500000)
    })

    it('prevents invoicing same milestone twice', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create and invoice a milestone
        const milestoneId = await db.insertMilestone(ctx.db, {
          organizationId: orgId,
          projectId,
          name: 'Phase 1 Complete',
          percentage: 25,
          amount: 2500000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          sortOrder: 0,
        })

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Finalized',
          method: 'Milestone',
          subtotal: 2500000,
          tax: 0,
          total: 2500000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.updateMilestone(ctx.db, milestoneId, {
          completedAt: now,
          invoiceId,
        })

        const milestone = await db.getMilestone(ctx.db, milestoneId)

        return {
          hasInvoiceId: !!milestone?.invoiceId,
          alreadyInvoiced: milestone?.invoiceId === invoiceId,
        }
      })

      expect(result.hasInvoiceId).toBe(true)
      expect(result.alreadyInvoiced).toBe(true)
    })
  })

  // ============================================================================
  // RECURRING INVOICING TESTS
  // ============================================================================

  describe('Recurring Invoicing', () => {
    it('creates retainer invoice with base amount', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        const retainerAmount = 1000000 // $10,000/month

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'Recurring',
          subtotal: retainerAmount,
          tax: 0,
          total: retainerAmount,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Monthly Retainer: January 2024',
          quantity: 1,
          rate: retainerAmount,
          amount: retainerAmount,
          sortOrder: 0,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        const lineItems = await db.listInvoiceLineItemsByInvoice(ctx.db, invoiceId)

        return {
          method: invoice?.method,
          total: invoice?.total,
          lineItemCount: lineItems.length,
          description: lineItems[0]?.description,
        }
      })

      expect(result.method).toBe('Recurring')
      expect(result.total).toBe(1000000)
      expect(result.lineItemCount).toBe(1)
      expect(result.description).toContain('Retainer')
    })

    it('creates retainer invoice with overage hours', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        const retainerAmount = 1000000 // $10,000/month
        const includedHours = 50
        const usedHours = 65
        const overageHours = usedHours - includedHours
        const overageRate = 15000 // $150/hr
        const overageAmount = overageHours * overageRate

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'Recurring',
          subtotal: retainerAmount + overageAmount,
          tax: 0,
          total: retainerAmount + overageAmount,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Base retainer line
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Monthly Retainer',
          quantity: 1,
          rate: retainerAmount,
          amount: retainerAmount,
          sortOrder: 0,
        })

        // Overage line
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: `Additional hours (${overageHours} hrs @ $150/hr)`,
          quantity: overageHours,
          rate: overageRate,
          amount: overageAmount,
          sortOrder: 1,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        const lineItems = await db.listInvoiceLineItemsByInvoice(ctx.db, invoiceId)

        return {
          total: invoice?.total,
          lineItemCount: lineItems.length,
          hasOverageLine: lineItems.some((li) => li.description.includes('Additional hours')),
        }
      })

      expect(result.total).toBe(1225000) // $10,000 + $2,250 = $12,250
      expect(result.lineItemCount).toBe(2)
      expect(result.hasOverageLine).toBe(true)
    })
  })

  // ============================================================================
  // DRAFT REVIEW AND EDITING TESTS
  // ============================================================================

  describe('Draft Review and Editing', () => {
    it('edits draft invoice line items', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create invoice with line items
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

        const lineItemId = await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Development Services',
          quantity: 10,
          rate: 10000,
          amount: 100000,
          sortOrder: 0,
        })

        // Edit the line item
        await db.updateInvoiceLineItem(ctx.db, lineItemId, {
          quantity: 12,
          amount: 120000,
        })

        // Update invoice total
        await db.updateInvoice(ctx.db, invoiceId, {
          subtotal: 120000,
          total: 120000,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)
        const lineItem = await ctx.db.get(lineItemId)

        return {
          newQuantity: lineItem?.quantity,
          newAmount: lineItem?.amount,
          newTotal: invoice?.total,
        }
      })

      expect(result.newQuantity).toBe(12)
      expect(result.newAmount).toBe(120000)
      expect(result.newTotal).toBe(120000)
    })

    it('adds new line item to draft invoice', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

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

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Development Services',
          quantity: 10,
          rate: 10000,
          amount: 100000,
          sortOrder: 0,
        })

        // Add new line item
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Consulting Services',
          quantity: 5,
          rate: 20000,
          amount: 100000,
          sortOrder: 1,
        })

        const lineItems = await db.listInvoiceLineItemsByInvoice(ctx.db, invoiceId)

        return {
          lineItemCount: lineItems.length,
          descriptions: lineItems.map((li) => li.description),
          totalAmount: lineItems.reduce((sum, li) => sum + li.amount, 0),
        }
      })

      expect(result.lineItemCount).toBe(2)
      expect(result.descriptions).toContain('Consulting Services')
      expect(result.totalAmount).toBe(200000)
    })

    it('deletes line item from draft invoice', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 200000,
          tax: 0,
          total: 200000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Development Services',
          quantity: 10,
          rate: 10000,
          amount: 100000,
          sortOrder: 0,
        })

        const lineItemToDelete = await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Remove this line',
          quantity: 10,
          rate: 10000,
          amount: 100000,
          sortOrder: 1,
        })

        // Delete the line item
        await db.deleteInvoiceLineItem(ctx.db, lineItemToDelete)

        const lineItems = await db.listInvoiceLineItemsByInvoice(ctx.db, invoiceId)

        return {
          lineItemCount: lineItems.length,
          descriptions: lineItems.map((li) => li.description),
        }
      })

      expect(result.lineItemCount).toBe(1)
      expect(result.descriptions).not.toContain('Remove this line')
    })
  })

  // ============================================================================
  // INVOICE FINALIZATION TESTS
  // ============================================================================

  describe('Invoice Finalization', () => {
    it('finalizes invoice with number and status', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, financeUserId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 500000,
          tax: 0,
          total: 500000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Generate invoice number
        const invoiceNumber = await db.getNextInvoiceNumber(ctx.db, orgId)

        // Finalize invoice
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Finalized',
          number: invoiceNumber,
          finalizedAt: now,
          finalizedBy: financeUserId,
        })

        const invoice = await db.getInvoice(ctx.db, invoiceId)

        return {
          status: invoice?.status,
          hasNumber: !!invoice?.number,
          hasFinalizedAt: !!invoice?.finalizedAt,
          hasFinalizedBy: !!invoice?.finalizedBy,
        }
      })

      expect(result.status).toBe('Finalized')
      expect(result.hasNumber).toBe(true)
      expect(result.hasFinalizedAt).toBe(true)
      expect(result.hasFinalizedBy).toBe(true)
    })

    it('locks time entries when invoice is finalized', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, financeUserId, projectId, companyId } =
          await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create approved time entries
        const entryId1 = await db.insertTimeEntry(ctx.db, {
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

        const entryId2 = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now - 24 * 60 * 60 * 1000,
          hours: 6,
          billable: true,
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        // Create and finalize invoice
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 140000,
          tax: 0,
          total: 140000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Create line item with time entry IDs
        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Development Services',
          quantity: 14,
          rate: 10000,
          amount: 140000,
          timeEntryIds: [entryId1, entryId2],
          sortOrder: 0,
        })

        // Finalize invoice
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Finalized',
          number: await db.getNextInvoiceNumber(ctx.db, orgId),
          finalizedAt: now,
          finalizedBy: financeUserId,
        })

        // Lock time entries
        await db.updateTimeEntry(ctx.db, entryId1, { status: 'Locked', invoiceId })
        await db.updateTimeEntry(ctx.db, entryId2, { status: 'Locked', invoiceId })

        const entry1 = await db.getTimeEntry(ctx.db, entryId1)
        const entry2 = await db.getTimeEntry(ctx.db, entryId2)

        return {
          entry1Status: entry1?.status,
          entry1InvoiceId: entry1?.invoiceId,
          entry2Status: entry2?.status,
          entry2InvoiceId: entry2?.invoiceId,
        }
      })

      expect(result.entry1Status).toBe('Locked')
      expect(result.entry1InvoiceId).toBeDefined()
      expect(result.entry2Status).toBe('Locked')
      expect(result.entry2InvoiceId).toBeDefined()
    })

    it('marks expenses as invoiced when invoice is finalized', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, teamMemberId, managerId, financeUserId, projectId, companyId } =
          await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create approved expense
        const expenseId = await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'IDE License',
          approvedBy: managerId,
          approvedAt: now,
          createdAt: now,
        })

        // Create and finalize invoice
        const invoiceId = await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 5000,
          tax: 0,
          total: 5000,
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoiceLineItem(ctx.db, {
          invoiceId,
          description: 'Expense: IDE License',
          quantity: 1,
          rate: 5000,
          amount: 5000,
          expenseIds: [expenseId],
          sortOrder: 0,
        })

        // Finalize invoice and mark expense
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Finalized',
          number: await db.getNextInvoiceNumber(ctx.db, orgId),
          finalizedAt: now,
          finalizedBy: financeUserId,
        })

        await db.updateExpense(ctx.db, expenseId, { invoiceId })

        const expense = await db.getExpense(ctx.db, expenseId)

        return {
          hasInvoiceId: !!expense?.invoiceId,
          invoiceIdMatches: expense?.invoiceId === invoiceId,
        }
      })

      expect(result.hasInvoiceId).toBe(true)
      expect(result.invoiceIdMatches).toBe(true)
    })
  })

  // ============================================================================
  // INVOICE STATUS TESTS
  // ============================================================================

  describe('Invoice Status Transitions', () => {
    it('tracks invoice status progression', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, financeUserId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create draft invoice
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

        let invoice = await db.getInvoice(ctx.db, invoiceId)
        const draftStatus = invoice?.status

        // Finalize
        await db.updateInvoice(ctx.db, invoiceId, {
          status: 'Finalized',
          number: await db.getNextInvoiceNumber(ctx.db, orgId),
          finalizedAt: now,
          finalizedBy: financeUserId,
        })
        invoice = await db.getInvoice(ctx.db, invoiceId)
        const finalizedStatus = invoice?.status

        // Mark as sent
        await db.updateInvoice(ctx.db, invoiceId, { status: 'Sent', sentAt: now })
        invoice = await db.getInvoice(ctx.db, invoiceId)
        const sentStatus = invoice?.status

        // Mark as viewed
        await db.updateInvoice(ctx.db, invoiceId, { status: 'Viewed', viewedAt: now })
        invoice = await db.getInvoice(ctx.db, invoiceId)
        const viewedStatus = invoice?.status

        // Mark as paid
        await db.updateInvoice(ctx.db, invoiceId, { status: 'Paid', paidAt: now })
        invoice = await db.getInvoice(ctx.db, invoiceId)
        const paidStatus = invoice?.status

        return {
          draftStatus,
          finalizedStatus,
          sentStatus,
          viewedStatus,
          paidStatus,
        }
      })

      expect(result.draftStatus).toBe('Draft')
      expect(result.finalizedStatus).toBe('Finalized')
      expect(result.sentStatus).toBe('Sent')
      expect(result.viewedStatus).toBe('Viewed')
      expect(result.paidStatus).toBe('Paid')
    })

    it('lists invoices by status', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupInvoiceTestData(ctx.db)
        const now = Date.now()

        // Create invoices with different statuses
        await db.insertInvoice(ctx.db, {
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

        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Finalized',
          method: 'FixedFee',
          subtotal: 200000,
          tax: 0,
          total: 200000,
          number: await db.getNextInvoiceNumber(ctx.db, orgId),
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Sent',
          method: 'Milestone',
          subtotal: 300000,
          tax: 0,
          total: 300000,
          number: await db.getNextInvoiceNumber(ctx.db, orgId),
          dueDate: now + 30 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        const draftInvoices = await db.listInvoicesByStatus(ctx.db, orgId, 'Draft')
        const finalizedInvoices = await db.listInvoicesByStatus(ctx.db, orgId, 'Finalized')
        const sentInvoices = await db.listInvoicesByStatus(ctx.db, orgId, 'Sent')

        return {
          draftCount: draftInvoices.length,
          finalizedCount: finalizedInvoices.length,
          sentCount: sentInvoices.length,
        }
      })

      expect(result.draftCount).toBe(1)
      expect(result.finalizedCount).toBe(1)
      expect(result.sentCount).toBe(1)
    })
  })
})
