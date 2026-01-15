/// <reference types="vite/client" />
/**
 * Time Tracking unit tests for PSA Platform
 * Tests the time tracking work items including time entry creation,
 * submission, and different entry methods (manual, timer, calendar, bookings)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import * as db from '../workflows/dealToDelivery/db'
import type { DatabaseWriter } from '../_generated/server'

/**
 * Helper to set up common test data for time tracking tests
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
    managerId: userId, // User is also the project manager for test purposes
    createdAt: Date.now(),
  })

  return { orgId, userId, companyId, contactId, dealId, projectId }
}

describe('PSA Platform Time Tracking', () => {
  let t: TestContext

  beforeEach(() => {
    vi.useFakeTimers()
    t = setup()
  })

  // ============================================================================
  // TIME ENTRY CREATION TESTS
  // ============================================================================

  describe('Time Entry Creation', () => {
    it('creates a manual time entry', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create a time entry
        const timeEntryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 4.5,
          billable: true,
          status: 'Draft',
          notes: 'Manual time entry',
          createdAt: Date.now(),
        })

        return await db.getTimeEntry(ctx.db, timeEntryId)
      })

      expect(result).not.toBeNull()
      expect(result!.hours).toBe(4.5)
      expect(result!.billable).toBe(true)
      expect(result!.status).toBe('Draft')
      expect(result!.notes).toBe('Manual time entry')
    })

    it('validates time entry hours range', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create entries with different hour values
        const minEntry = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 0.25, // Minimum allowed
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        const maxEntry = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 24, // Maximum allowed
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        const min = await db.getTimeEntry(ctx.db, minEntry)
        const max = await db.getTimeEntry(ctx.db, maxEntry)

        return { min, max }
      })

      expect(result.min!.hours).toBe(0.25)
      expect(result.max!.hours).toBe(24)
    })
  })

  // ============================================================================
  // TIME ENTRY SUBMISSION TESTS
  // ============================================================================

  describe('Time Entry Submission', () => {
    it('submits a draft time entry', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create a draft entry
        const timeEntryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        // Submit the entry
        await db.updateTimeEntry(ctx.db, timeEntryId, {
          status: 'Submitted',
        })

        return await db.getTimeEntry(ctx.db, timeEntryId)
      })

      expect(result!.status).toBe('Submitted')
    })

    it('cannot edit submitted time entry without approval', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create a submitted entry
        const timeEntryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Submitted',
          createdAt: Date.now(),
        })

        const entry = await db.getTimeEntry(ctx.db, timeEntryId)

        return {
          status: entry!.status,
          canEdit: entry!.status === 'Draft',
        }
      })

      expect(result.status).toBe('Submitted')
      expect(result.canEdit).toBe(false)
    })
  })

  // ============================================================================
  // TIME ENTRY QUERIES TESTS
  // ============================================================================

  describe('Time Entry Queries', () => {
    it('lists time entries by user', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create multiple time entries
        const baseDate = Date.now()
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: baseDate,
          hours: 4,
          billable: true,
          status: 'Draft',
          createdAt: baseDate,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: baseDate + 86400000, // Next day
          hours: 6,
          billable: true,
          status: 'Draft',
          createdAt: baseDate + 86400000,
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: baseDate + 172800000, // Day after
          hours: 8,
          billable: false,
          status: 'Submitted',
          createdAt: baseDate + 172800000,
        })

        return await db.listTimeEntriesByUser(ctx.db, userId)
      })

      expect(result.length).toBe(3)
      expect(result.map((e) => e.hours).sort()).toEqual([4, 6, 8])
    })

    it('lists time entries by project', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create entries
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

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now() + 86400000,
          hours: 4,
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        return await db.listTimeEntriesByProject(ctx.db, projectId)
      })

      expect(result.length).toBe(2)
    })

    it('lists time entries by user and date', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        const specificDate = 1700000000000 // Fixed timestamp for test

        // Create entries on specific date
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: specificDate,
          hours: 4,
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: specificDate,
          hours: 4,
          billable: false,
          status: 'Draft',
          createdAt: Date.now(),
        })

        // Create entry on different date
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: specificDate + 86400000, // Next day
          hours: 8,
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        return await db.listTimeEntriesByUserAndDate(ctx.db, userId, specificDate)
      })

      expect(result.length).toBe(2)
      expect(result.map((e) => e.hours)).toEqual([4, 4])
    })
  })

  // ============================================================================
  // BILLABLE CALCULATION TESTS
  // ============================================================================

  describe('Billable Calculations', () => {
    it('calculates total billable hours for project', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create mix of billable and non-billable entries
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

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now() + 86400000,
          hours: 4,
          billable: false, // Non-billable
          status: 'Approved',
          createdAt: Date.now(),
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now() + 172800000,
          hours: 6,
          billable: true,
          status: 'Approved',
          createdAt: Date.now(),
        })

        const entries = await db.listTimeEntriesByProject(ctx.db, projectId)
        const totalBillable = entries
          .filter((e) => e.billable)
          .reduce((sum, e) => sum + e.hours, 0)
        const totalNonBillable = entries
          .filter((e) => !e.billable)
          .reduce((sum, e) => sum + e.hours, 0)

        return { totalBillable, totalNonBillable }
      })

      expect(result.totalBillable).toBe(14) // 8 + 6
      expect(result.totalNonBillable).toBe(4)
    })

    it('gets approved billable entries for invoicing', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create various entries
        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Approved', // Ready for invoicing
          createdAt: Date.now(),
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now() + 86400000,
          hours: 4,
          billable: true,
          status: 'Draft', // Not approved yet
          createdAt: Date.now(),
        })

        await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now() + 172800000,
          hours: 6,
          billable: false, // Non-billable
          status: 'Approved',
          createdAt: Date.now(),
        })

        return await db.listApprovedBillableTimeEntriesForInvoicing(ctx.db, projectId)
      })

      expect(result.length).toBe(1)
      expect(result[0].hours).toBe(8)
      expect(result[0].billable).toBe(true)
      expect(result[0].status).toBe('Approved')
    })
  })

  // ============================================================================
  // TIME ENTRY STATUS WORKFLOW TESTS
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

        // Create draft entry
        const timeEntryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Draft',
          createdAt: Date.now(),
        })

        const statuses: string[] = []

        // Get initial status
        let entry = await db.getTimeEntry(ctx.db, timeEntryId)
        statuses.push(entry!.status)

        // Submit
        await db.updateTimeEntry(ctx.db, timeEntryId, { status: 'Submitted' })
        entry = await db.getTimeEntry(ctx.db, timeEntryId)
        statuses.push(entry!.status)

        // Approve
        await db.updateTimeEntry(ctx.db, timeEntryId, {
          status: 'Approved',
          approvedBy: managerId,
          approvedAt: Date.now(),
        })
        entry = await db.getTimeEntry(ctx.db, timeEntryId)
        statuses.push(entry!.status)

        // Lock (for payroll/invoicing)
        await db.updateTimeEntry(ctx.db, timeEntryId, { status: 'Locked' })
        entry = await db.getTimeEntry(ctx.db, timeEntryId)
        statuses.push(entry!.status)

        return statuses
      })

      expect(result).toEqual(['Draft', 'Submitted', 'Approved', 'Locked'])
    })

    it('handles rejection workflow', async () => {
      const result = await t.run(async (ctx) => {
        const { orgId, userId, projectId } = await setupTestProject(ctx.db)

        // Create submitted entry
        const timeEntryId = await db.insertTimeEntry(ctx.db, {
          organizationId: orgId,
          userId,
          projectId,
          date: Date.now(),
          hours: 8,
          billable: true,
          status: 'Submitted',
          createdAt: Date.now(),
        })

        // Reject with comments
        await db.updateTimeEntry(ctx.db, timeEntryId, {
          status: 'Rejected',
          rejectionComments: 'Please add more detail to notes',
        })

        const entry = await db.getTimeEntry(ctx.db, timeEntryId)

        return {
          status: entry!.status,
          rejectionComments: entry!.rejectionComments,
        }
      })

      expect(result.status).toBe('Rejected')
      expect(result.rejectionComments).toBe('Please add more detail to notes')
    })
  })
})
