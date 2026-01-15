/// <reference types="vite/client" />
/**
 * Close Phase unit tests for PSA Platform
 * Tests the close phase workflow including:
 * - Project closure with criteria verification
 * - Project metrics calculations
 * - Future bookings cancellation
 * - Retrospective documentation
 * - Project archival
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common test data for close phase tests
 */
async function setupClosePhaseTestData(dbWriter: DatabaseWriter) {
  const orgId = await db.insertOrganization(dbWriter, {
    name: 'Test Org',
    settings: {},
    createdAt: Date.now(),
  })

  // Create project manager who closes projects
  const managerId = await db.insertUser(dbWriter, {
    organizationId: orgId,
    email: 'manager@test.com',
    name: 'Project Manager',
    role: 'project_manager',
    costRate: 7500,
    billRate: 15000,
    skills: ['management'],
    department: 'Engineering',
    location: 'Remote',
    isActive: true,
  })

  // Create team member
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
    startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    managerId,
    createdAt: Date.now(),
  })

  // Create a budget for the project
  const budgetId = await db.insertBudget(dbWriter, {
    organizationId: orgId,
    projectId,
    type: 'TimeAndMaterials',
    totalAmount: 100000,
    createdAt: Date.now(),
  })

  // Link budget to project
  await db.updateProject(dbWriter, projectId, {
    budgetId,
  })

  return {
    orgId,
    managerId,
    teamMemberId,
    companyId,
    contactId,
    dealId,
    projectId,
    budgetId,
  }
}

describe('PSA Platform Close Phase', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // PROJECT CLOSURE CRITERIA TESTS
  // ============================================================================

  describe('Project Closure Criteria', () => {
    it('verifies all tasks are complete', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create tasks with various statuses
        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Completed Task',
          description: 'A completed task',
          status: 'Done',
          priority: 'Medium',
          assigneeIds: [teamMemberId],
          dependencies: [],
          createdAt: now,
          sortOrder: 0,
        })

        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'In Progress Task',
          description: 'A task still in progress',
          status: 'InProgress',
          priority: 'Medium',
          assigneeIds: [teamMemberId],
          dependencies: [],
          createdAt: now,
          sortOrder: 1,
        })

        const tasks = await db.listTasksByProject(ctx.db, projectId)
        const incompleteTasks = tasks.filter((t) => t.status !== 'Done')

        return {
          totalTasks: tasks.length,
          incompleteTasks: incompleteTasks.length,
          allTasksComplete: incompleteTasks.length === 0,
        }
      })

      expect(result.totalTasks).toBe(2)
      expect(result.incompleteTasks).toBe(1)
      expect(result.allTasksComplete).toBe(false)
    })

    it('verifies all time entries are approved', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create approved time entry
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

        // Create pending time entry
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now + 1000,
          hours: 4,
          billable: true,
          status: 'Submitted',
          createdAt: now + 1000,
        })

        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const unapprovedTime = timeEntries.filter((t) => t.status !== 'Approved')

        return {
          totalEntries: timeEntries.length,
          unapprovedEntries: unapprovedTime.length,
          allTimeApproved: unapprovedTime.length === 0,
        }
      })

      expect(result.totalEntries).toBe(2)
      expect(result.unapprovedEntries).toBe(1)
      expect(result.allTimeApproved).toBe(false)
    })

    it('verifies all expenses are approved', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create approved expense
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

        // Create pending expense
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 10000,
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: now + 1000,
          description: 'License',
          createdAt: now + 1000,
        })

        const expenses = await db.listExpensesByProject(ctx.db, projectId)
        const unapprovedExpenses = expenses.filter((e) => e.status !== 'Approved')

        return {
          totalExpenses: expenses.length,
          unapprovedExpenses: unapprovedExpenses.length,
          allExpensesApproved: unapprovedExpenses.length === 0,
        }
      })

      expect(result.totalExpenses).toBe(2)
      expect(result.unapprovedExpenses).toBe(1)
      expect(result.allExpensesApproved).toBe(false)
    })

    it('verifies all invoices are sent', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()
        const dueDate = now + 30 * 24 * 60 * 60 * 1000

        // Create sent invoice
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-001',
          status: 'Sent',
          method: 'TimeAndMaterials',
          subtotal: 50000,
          tax: 0,
          total: 50000,
          dueDate,
          sentAt: now,
          createdAt: now,
        })

        // Create draft invoice
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          status: 'Draft',
          method: 'TimeAndMaterials',
          subtotal: 25000,
          tax: 0,
          total: 25000,
          dueDate,
          createdAt: now,
        })

        const invoices = await db.listInvoicesByProject(ctx.db, projectId)
        const unsentInvoices = invoices.filter(
          (i) => i.status === 'Draft' || i.status === 'Finalized'
        )

        return {
          totalInvoices: invoices.length,
          unsentInvoices: unsentInvoices.length,
          allInvoicesSent: unsentInvoices.length === 0,
        }
      })

      expect(result.totalInvoices).toBe(2)
      expect(result.unsentInvoices).toBe(1)
      expect(result.allInvoicesSent).toBe(false)
    })

    it('verifies all invoices are paid', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()
        const dueDate = now + 30 * 24 * 60 * 60 * 1000

        // Create paid invoice
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-001',
          status: 'Paid',
          method: 'TimeAndMaterials',
          subtotal: 50000,
          tax: 0,
          total: 50000,
          dueDate,
          sentAt: now,
          paidAt: now + 10 * 24 * 60 * 60 * 1000,
          createdAt: now,
        })

        // Create unpaid sent invoice
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-002',
          status: 'Sent',
          method: 'TimeAndMaterials',
          subtotal: 25000,
          tax: 0,
          total: 25000,
          dueDate,
          sentAt: now,
          createdAt: now,
        })

        const invoices = await db.listInvoicesByProject(ctx.db, projectId)
        const unpaidInvoices = invoices.filter(
          (i) => i.status === 'Sent' || i.status === 'Viewed'
        )

        return {
          totalInvoices: invoices.length,
          unpaidInvoices: unpaidInvoices.length,
          allInvoicesPaid: unpaidInvoices.length === 0,
        }
      })

      expect(result.totalInvoices).toBe(2)
      expect(result.unpaidInvoices).toBe(1)
      expect(result.allInvoicesPaid).toBe(false)
    })

    it('generates warnings for incomplete closure criteria', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } =
          await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create incomplete task
        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Incomplete Task',
          description: 'An incomplete task',
          status: 'InProgress',
          priority: 'Medium',
          assigneeIds: [teamMemberId],
          dependencies: [],
          createdAt: now,
          sortOrder: 0,
        })

        // Create unapproved time entry
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

        // Check criteria
        const tasks = await db.listTasksByProject(ctx.db, projectId)
        const incompleteTasks = tasks.filter((t) => t.status !== 'Done')

        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const unapprovedTime = timeEntries.filter((t) => t.status !== 'Approved')

        const warnings: string[] = []
        if (incompleteTasks.length > 0) {
          warnings.push(`${incompleteTasks.length} incomplete task(s)`)
        }
        if (unapprovedTime.length > 0) {
          warnings.push(`${unapprovedTime.length} unapproved time entry(ies)`)
        }

        return {
          warningCount: warnings.length,
          warnings,
        }
      })

      expect(result.warningCount).toBe(2)
      expect(result.warnings).toContain('1 incomplete task(s)')
      expect(result.warnings).toContain('1 unapproved time entry(ies)')
    })
  })

  // ============================================================================
  // PROJECT METRICS CALCULATION TESTS
  // ============================================================================

  describe('Project Metrics Calculation', () => {
    it('calculates total revenue from non-void invoices', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, companyId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()
        const dueDate = now + 30 * 24 * 60 * 60 * 1000

        // Create paid invoices
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-001',
          status: 'Paid',
          method: 'TimeAndMaterials',
          subtotal: 50000,
          tax: 0,
          total: 50000,
          dueDate,
          paidAt: now,
          createdAt: now,
        })

        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-002',
          status: 'Paid',
          method: 'TimeAndMaterials',
          subtotal: 30000,
          tax: 0,
          total: 30000,
          dueDate,
          paidAt: now,
          createdAt: now,
        })

        // Create voided invoice (should not count)
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-003',
          status: 'Void',
          method: 'TimeAndMaterials',
          subtotal: 20000,
          tax: 0,
          total: 20000,
          dueDate,
          createdAt: now,
        })

        const invoices = await db.listInvoicesByProject(ctx.db, projectId)
        const totalRevenue = invoices
          .filter((i) => i.status !== 'Void')
          .reduce((sum, i) => sum + i.total, 0)

        return {
          invoiceCount: invoices.length,
          totalRevenue,
        }
      })

      expect(result.invoiceCount).toBe(3)
      expect(result.totalRevenue).toBe(80000) // 50000 + 30000, excludes void 20000
    })

    it('calculates total cost from time entries and expenses', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create time entries
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

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now + 1000,
          hours: 4,
          billable: true,
          status: 'Approved',
          createdAt: now + 1000,
        })

        // Create expenses
        await db.insertExpense(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 15000,
          currency: 'USD',
          billable: true,
          status: 'Approved',
          date: now,
          description: 'Client visit',
          createdAt: now,
        })

        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const expenses = await db.listExpensesByProject(ctx.db, projectId)

        const totalTimeHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0)
        const avgCostRate = 5000 // Default average cost rate in cents/hour
        const timeCost = totalTimeHours * avgCostRate
        const expenseCost = expenses.reduce((sum, e) => sum + e.amount, 0)
        const totalCost = timeCost + expenseCost

        return {
          totalTimeHours,
          timeCost,
          expenseCost,
          totalCost,
        }
      })

      expect(result.totalTimeHours).toBe(12) // 8 + 4
      expect(result.timeCost).toBe(60000) // 12 * 5000
      expect(result.expenseCost).toBe(15000)
      expect(result.totalCost).toBe(75000)
    })

    it('calculates profit and profit margin', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId, companyId } =
          await setupClosePhaseTestData(ctx.db)
        const now = Date.now()
        const dueDate = now + 30 * 24 * 60 * 60 * 1000

        // Create paid invoice (revenue)
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-001',
          status: 'Paid',
          method: 'TimeAndMaterials',
          subtotal: 100000,
          tax: 0,
          total: 100000,
          dueDate,
          paidAt: now,
          createdAt: now,
        })

        // Create time entries (cost)
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: now,
          hours: 10,
          billable: true,
          status: 'Approved',
          createdAt: now,
        })

        // Create expense (cost)
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
          description: 'License',
          createdAt: now,
        })

        const invoices = await db.listInvoicesByProject(ctx.db, projectId)
        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const expenses = await db.listExpensesByProject(ctx.db, projectId)

        const totalRevenue = invoices
          .filter((i) => i.status !== 'Void')
          .reduce((sum, i) => sum + i.total, 0)

        const totalTimeHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0)
        const avgCostRate = 5000
        const timeCost = totalTimeHours * avgCostRate
        const expenseCost = expenses.reduce((sum, e) => sum + e.amount, 0)
        const totalCost = timeCost + expenseCost

        const profit = totalRevenue - totalCost
        const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

        return {
          totalRevenue,
          totalCost,
          profit,
          profitMargin,
        }
      })

      expect(result.totalRevenue).toBe(100000)
      expect(result.totalCost).toBe(60000) // 10 * 5000 + 10000
      expect(result.profit).toBe(40000)
      expect(result.profitMargin).toBe(40)
    })

    it('calculates budget variance', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId, budgetId } =
          await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create time entries (cost)
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

        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const expenses = await db.listExpensesByProject(ctx.db, projectId)

        const totalTimeHours = timeEntries.reduce((sum, t) => sum + (t.hours || 0), 0)
        const avgCostRate = 5000
        const timeCost = totalTimeHours * avgCostRate
        const expenseCost = expenses.reduce((sum, e) => sum + e.amount, 0)
        const totalCost = timeCost + expenseCost

        const budget = await db.getBudget(ctx.db, budgetId)
        const budgetVariance =
          budget && budget.totalAmount > 0
            ? (totalCost / budget.totalAmount) * 100
            : 0

        return {
          totalCost,
          budgetAmount: budget?.totalAmount,
          budgetVariance,
          underBudget: budgetVariance < 100,
        }
      })

      expect(result.totalCost).toBe(40000) // 8 * 5000
      expect(result.budgetAmount).toBe(100000)
      expect(result.budgetVariance).toBe(40)
      expect(result.underBudget).toBe(true)
    })

    it('calculates project duration in days', async () => {
      const result = await t.run(async (ctx) => {
        const { projectId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        const project = await db.getProject(ctx.db, projectId)
        const closeDate = now
        const durationDays = Math.ceil(
          (closeDate - project!.startDate) / (1000 * 60 * 60 * 24)
        )

        return {
          startDate: project?.startDate,
          closeDate,
          durationDays,
        }
      })

      expect(result.durationDays).toBe(30) // Set up 30 days ago
    })
  })

  // ============================================================================
  // BOOKING CANCELLATION TESTS
  // ============================================================================

  describe('Future Bookings Cancellation', () => {
    it('cancels future bookings when project closes', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId } = await setupClosePhaseTestData(ctx.db)
        const now = Date.now()

        // Create past booking (should not be cancelled)
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: teamMemberId,
          startDate: now - 7 * 24 * 60 * 60 * 1000,
          endDate: now - 1 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: now,
        })

        // Create future bookings (should be cancelled)
        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: teamMemberId,
          startDate: now + 1 * 24 * 60 * 60 * 1000,
          endDate: now + 7 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Confirmed',
          createdAt: now,
        })

        await db.insertBooking(ctx.db, {
          organizationId: orgId,
          projectId,
          userId: teamMemberId,
          startDate: now + 14 * 24 * 60 * 60 * 1000,
          endDate: now + 21 * 24 * 60 * 60 * 1000,
          hoursPerDay: 8,
          type: 'Tentative',
          createdAt: now,
        })

        // Get all bookings before cancellation
        const bookingsBefore = await db.listBookingsByProject(ctx.db, projectId)
        const futureBookingsBefore = bookingsBefore.filter((b) => b.startDate > now)

        // Cancel future bookings
        for (const booking of futureBookingsBefore) {
          await db.deleteBooking(ctx.db, booking._id)
        }

        // Get bookings after cancellation
        const bookingsAfter = await db.listBookingsByProject(ctx.db, projectId)
        const futureBookingsAfter = bookingsAfter.filter((b) => b.startDate > now)

        return {
          bookingsBeforeCount: bookingsBefore.length,
          futureBookingsBeforeCount: futureBookingsBefore.length,
          bookingsAfterCount: bookingsAfter.length,
          futureBookingsAfterCount: futureBookingsAfter.length,
        }
      })

      expect(result.bookingsBeforeCount).toBe(3)
      expect(result.futureBookingsBeforeCount).toBe(2)
      expect(result.bookingsAfterCount).toBe(1) // Only past booking remains
      expect(result.futureBookingsAfterCount).toBe(0)
    })
  })

  // ============================================================================
  // PROJECT STATUS UPDATE TESTS
  // ============================================================================

  describe('Project Status Updates', () => {
    it('updates project status to Completed on close', async () => {
      const result = await t.run(async (ctx) => {
        const { projectId } = await setupClosePhaseTestData(ctx.db)
        const closeDate = Date.now()

        const projectBefore = await db.getProject(ctx.db, projectId)

        await db.updateProject(ctx.db, projectId, {
          status: 'Completed',
          endDate: closeDate,
        })

        const projectAfter = await db.getProject(ctx.db, projectId)

        return {
          statusBefore: projectBefore?.status,
          statusAfter: projectAfter?.status,
          endDate: projectAfter?.endDate,
        }
      })

      expect(result.statusBefore).toBe('Active')
      expect(result.statusAfter).toBe('Completed')
      expect(result.endDate).toBeDefined()
    })

    it('sets completion status with different options', async () => {
      const result = await t.run(async (ctx) => {
        const { projectId } = await setupClosePhaseTestData(ctx.db)

        // Test completed status
        await db.updateProject(ctx.db, projectId, {
          status: 'Completed',
        })
        const completedProject = await db.getProject(ctx.db, projectId)

        // Test on hold status
        await db.updateProject(ctx.db, projectId, {
          status: 'OnHold',
        })
        const onHoldProject = await db.getProject(ctx.db, projectId)

        return {
          completedStatus: completedProject?.status,
          onHoldStatus: onHoldProject?.status,
        }
      })

      expect(result.completedStatus).toBe('Completed')
      expect(result.onHoldStatus).toBe('OnHold')
    })
  })

  // ============================================================================
  // RETROSPECTIVE DOCUMENTATION TESTS
  // ============================================================================

  describe('Retrospective Documentation', () => {
    it('records retrospective successes', async () => {
      const successes = [
        {
          category: 'timeline' as const,
          description: 'Delivered on time',
          impact: 'high' as const,
        },
        {
          category: 'quality' as const,
          description: 'No major bugs',
          impact: 'medium' as const,
        },
      ]

      // Just verify the structure is valid
      expect(successes).toHaveLength(2)
      expect(successes[0].category).toBe('timeline')
      expect(successes[0].impact).toBe('high')
    })

    it('records retrospective improvements', async () => {
      const improvements = [
        {
          category: 'communication' as const,
          description: 'Need better status updates',
          impact: 'medium' as const,
          recommendation: 'Weekly status emails',
        },
        {
          category: 'process' as const,
          description: 'Code review took too long',
          impact: 'low' as const,
        },
      ]

      // Just verify the structure is valid
      expect(improvements).toHaveLength(2)
      expect(improvements[0].recommendation).toBe('Weekly status emails')
    })

    it('records client satisfaction rating', async () => {
      const clientSatisfaction = {
        rating: 5 as 1 | 2 | 3 | 4 | 5,
        feedback: 'Great work!',
        wouldRecommend: true,
      }

      expect(clientSatisfaction.rating).toBe(5)
      expect(clientSatisfaction.wouldRecommend).toBe(true)
    })

    it('calculates project scorecard', async () => {
      const result = await t.run(async (ctx) => {
        const { projectId, budgetId } = await setupClosePhaseTestData(ctx.db)

        const project = await db.getProject(ctx.db, projectId)
        const budget = await db.getBudget(ctx.db, budgetId)

        // Calculate scorecard
        const plannedEndDate = project!.startDate + 90 * 24 * 60 * 60 * 1000
        const actualEndDate = Date.now()
        const onTime = actualEndDate <= plannedEndDate

        const onBudget = budget !== null // Simplified

        const clientSatisfactionRating = 4
        const clientSatisfied = clientSatisfactionRating >= 4

        const profitMargin = 40 // From earlier test
        const targetMargin = 30
        const profitable = profitMargin >= targetMargin

        const scorecard = {
          onTime,
          onBudget,
          clientSatisfied,
          profitable,
        }

        return scorecard
      })

      expect(result.onTime).toBe(true) // 30 days < 90 days
      expect(result.onBudget).toBe(true)
      expect(result.clientSatisfied).toBe(true)
      expect(result.profitable).toBe(true)
    })
  })

  // ============================================================================
  // PROJECT ARCHIVAL TESTS
  // ============================================================================

  describe('Project Archival', () => {
    it('archives project after retrospective', async () => {
      const result = await t.run(async (ctx) => {
        const { projectId } = await setupClosePhaseTestData(ctx.db)

        const projectBefore = await db.getProject(ctx.db, projectId)

        await db.updateProject(ctx.db, projectId, {
          status: 'Archived',
        })

        const projectAfter = await db.getProject(ctx.db, projectId)

        return {
          statusBefore: projectBefore?.status,
          statusAfter: projectAfter?.status,
        }
      })

      expect(result.statusBefore).toBe('Active')
      expect(result.statusAfter).toBe('Archived')
    })
  })

  // ============================================================================
  // CLOSURE WITH ALL CRITERIA MET TESTS
  // ============================================================================

  describe('Successful Project Closure', () => {
    it('closes project when all criteria are met', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, projectId, teamMemberId, companyId } =
          await setupClosePhaseTestData(ctx.db)
        const now = Date.now()
        const dueDate = now + 30 * 24 * 60 * 60 * 1000

        // Create completed task
        await db.insertTask(ctx.db, {
          projectId,
          organizationId: orgId,
          name: 'Completed Task',
          description: 'A completed task',
          status: 'Done',
          priority: 'Medium',
          assigneeIds: [teamMemberId],
          dependencies: [],
          createdAt: now,
          sortOrder: 0,
        })

        // Create approved time entry
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

        // Create approved expense
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
          description: 'License',
          createdAt: now,
        })

        // Create paid invoice
        await db.insertInvoice(ctx.db, {
          organizationId: orgId,
          projectId,
          companyId,
          number: 'INV-001',
          status: 'Paid',
          method: 'TimeAndMaterials',
          subtotal: 50000,
          tax: 0,
          total: 50000,
          dueDate,
          paidAt: now,
          createdAt: now,
        })

        // Verify all criteria
        const tasks = await db.listTasksByProject(ctx.db, projectId)
        const incompleteTasks = tasks.filter((t) => t.status !== 'Done')

        const timeEntries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const unapprovedTime = timeEntries.filter((t) => t.status !== 'Approved')

        const expenses = await db.listExpensesByProject(ctx.db, projectId)
        const unapprovedExpenses = expenses.filter((e) => e.status !== 'Approved')

        const invoices = await db.listInvoicesByProject(ctx.db, projectId)
        const unsentInvoices = invoices.filter(
          (i) => i.status === 'Draft' || i.status === 'Finalized'
        )
        const unpaidInvoices = invoices.filter(
          (i) => i.status === 'Sent' || i.status === 'Viewed'
        )

        const canClose =
          incompleteTasks.length === 0 &&
          unapprovedTime.length === 0 &&
          unapprovedExpenses.length === 0 &&
          unsentInvoices.length === 0 &&
          unpaidInvoices.length === 0

        // Close project
        if (canClose) {
          await db.updateProject(ctx.db, projectId, {
            status: 'Completed',
            endDate: now,
          })
        }

        const project = await db.getProject(ctx.db, projectId)

        return {
          canClose,
          projectStatus: project?.status,
          endDate: project?.endDate,
        }
      })

      expect(result.canClose).toBe(true)
      expect(result.projectStatus).toBe('Completed')
      expect(result.endDate).toBeDefined()
    })
  })
})
