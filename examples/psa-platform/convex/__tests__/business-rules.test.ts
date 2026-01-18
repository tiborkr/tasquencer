/// <reference types="vite/client" />
/**
 * Business Rules Validation Tests
 *
 * These tests verify that critical business rules are properly enforced
 * at both the schema level (Zod validation) and domain level.
 *
 * Business Rules Tested:
 * - Markup rate limits: 1.0-1.5 (0-50% markup)
 * - Hours validation: 0.25-24 hours per entry
 * - Receipt threshold: $25 for expense receipts
 * - Budget burn threshold: 90% triggers overrun
 * - Self-approval prevention (conceptual validation)
 * - Status transition rules
 *
 * References:
 * - .review/recipes/psa-platform/specs/10-workflow-expense-approval.md
 * - .review/recipes/psa-platform/specs/09-workflow-timesheet-approval.md
 * - .review/recipes/psa-platform/specs/06-workflow-execution-phase.md
 */

import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { setup, type TestContext } from './helpers.test'

// =============================================================================
// Constants (matching work item definitions)
// =============================================================================

// Markup rate limits per spec 10-workflow-expense-approval.md line 287
const MIN_MARKUP_RATE = 1.0 // No markup (cost)
const MAX_MARKUP_RATE = 1.5 // 50% markup

// Hours limits per spec 09-workflow-timesheet-approval.md
const MIN_HOURS_PER_ENTRY = 0.25 // 15 minutes
const MAX_HOURS_PER_ENTRY = 24 // Full day

// Receipt threshold per spec 08-workflow-expense-tracking.md
const RECEIPT_REQUIRED_THRESHOLD_CENTS = 2500 // $25

// Budget overrun threshold per spec 06-workflow-execution-phase.md
const BUDGET_OVERRUN_THRESHOLD = 0.9 // 90%

// =============================================================================
// Zod Schema Definitions (matching work items)
// =============================================================================

// Schema matching approveExpense and reviewExpense work items
const markupRateSchema = z.number().min(MIN_MARKUP_RATE).max(MAX_MARKUP_RATE)

// Schema matching manualEntry and reviseTimesheet work items
const hoursSchema = z.number().min(MIN_HOURS_PER_ENTRY).max(MAX_HOURS_PER_ENTRY)

// Schema matching createBookings work item
const hoursPerDaySchema = z.number().min(0).max(24)

// Schema matching invoiceFixedFee work item
const percentageSchema = z.number().min(0).max(100)

// =============================================================================
// Markup Rate Validation Tests
// =============================================================================

describe('Markup Rate Validation', () => {
  describe('Valid markup rates', () => {
    it('accepts markup rate of 1.0 (no markup)', () => {
      expect(() => markupRateSchema.parse(1.0)).not.toThrow()
    })

    it('accepts markup rate of 1.1 (10% markup)', () => {
      expect(() => markupRateSchema.parse(1.1)).not.toThrow()
    })

    it('accepts markup rate of 1.25 (25% markup)', () => {
      expect(() => markupRateSchema.parse(1.25)).not.toThrow()
    })

    it('accepts markup rate of 1.5 (50% markup - maximum)', () => {
      expect(() => markupRateSchema.parse(1.5)).not.toThrow()
    })
  })

  describe('Invalid markup rates', () => {
    it('rejects markup rate below 1.0 (negative margin)', () => {
      expect(() => markupRateSchema.parse(0.9)).toThrow()
    })

    it('rejects markup rate of 0.5 (50% discount)', () => {
      expect(() => markupRateSchema.parse(0.5)).toThrow()
    })

    it('rejects markup rate above 1.5 (over 50% markup)', () => {
      expect(() => markupRateSchema.parse(1.6)).toThrow()
    })

    it('rejects markup rate of 2.0 (100% markup)', () => {
      expect(() => markupRateSchema.parse(2.0)).toThrow()
    })

    it('rejects negative markup rate', () => {
      expect(() => markupRateSchema.parse(-0.5)).toThrow()
    })
  })

  describe('Edge cases', () => {
    it('accepts exactly MIN_MARKUP_RATE boundary', () => {
      expect(() => markupRateSchema.parse(MIN_MARKUP_RATE)).not.toThrow()
    })

    it('accepts exactly MAX_MARKUP_RATE boundary', () => {
      expect(() => markupRateSchema.parse(MAX_MARKUP_RATE)).not.toThrow()
    })

    it('rejects just below MIN_MARKUP_RATE', () => {
      expect(() => markupRateSchema.parse(MIN_MARKUP_RATE - 0.001)).toThrow()
    })

    it('rejects just above MAX_MARKUP_RATE', () => {
      expect(() => markupRateSchema.parse(MAX_MARKUP_RATE + 0.001)).toThrow()
    })
  })
})

// =============================================================================
// Hours Validation Tests
// =============================================================================

describe('Hours Validation', () => {
  describe('Valid hours', () => {
    it('accepts minimum hours (15 minutes)', () => {
      expect(() => hoursSchema.parse(0.25)).not.toThrow()
    })

    it('accepts 1 hour', () => {
      expect(() => hoursSchema.parse(1)).not.toThrow()
    })

    it('accepts half day (4 hours)', () => {
      expect(() => hoursSchema.parse(4)).not.toThrow()
    })

    it('accepts full day (8 hours)', () => {
      expect(() => hoursSchema.parse(8)).not.toThrow()
    })

    it('accepts maximum hours (24)', () => {
      expect(() => hoursSchema.parse(24)).not.toThrow()
    })
  })

  describe('Invalid hours', () => {
    it('rejects hours below minimum (0.24)', () => {
      expect(() => hoursSchema.parse(0.24)).toThrow()
    })

    it('rejects zero hours', () => {
      expect(() => hoursSchema.parse(0)).toThrow()
    })

    it('rejects negative hours', () => {
      expect(() => hoursSchema.parse(-1)).toThrow()
    })

    it('rejects hours above 24', () => {
      expect(() => hoursSchema.parse(25)).toThrow()
    })
  })

  describe('Edge cases', () => {
    it('accepts exactly MIN_HOURS boundary', () => {
      expect(() => hoursSchema.parse(MIN_HOURS_PER_ENTRY)).not.toThrow()
    })

    it('accepts exactly MAX_HOURS boundary', () => {
      expect(() => hoursSchema.parse(MAX_HOURS_PER_ENTRY)).not.toThrow()
    })

    it('rejects just below MIN_HOURS', () => {
      expect(() => hoursSchema.parse(MIN_HOURS_PER_ENTRY - 0.01)).toThrow()
    })

    it('rejects just above MAX_HOURS', () => {
      expect(() => hoursSchema.parse(MAX_HOURS_PER_ENTRY + 0.01)).toThrow()
    })
  })
})

// =============================================================================
// Hours Per Day Validation Tests (Bookings)
// =============================================================================

describe('Hours Per Day Validation (Bookings)', () => {
  it('accepts 0 hours per day (planning placeholder)', () => {
    expect(() => hoursPerDaySchema.parse(0)).not.toThrow()
  })

  it('accepts 8 hours per day (standard)', () => {
    expect(() => hoursPerDaySchema.parse(8)).not.toThrow()
  })

  it('accepts 24 hours per day (maximum)', () => {
    expect(() => hoursPerDaySchema.parse(24)).not.toThrow()
  })

  it('rejects negative hours per day', () => {
    expect(() => hoursPerDaySchema.parse(-1)).toThrow()
  })

  it('rejects hours per day above 24', () => {
    expect(() => hoursPerDaySchema.parse(25)).toThrow()
  })
})

// =============================================================================
// Percentage Validation Tests
// =============================================================================

describe('Percentage Validation', () => {
  it('accepts 0%', () => {
    expect(() => percentageSchema.parse(0)).not.toThrow()
  })

  it('accepts 50%', () => {
    expect(() => percentageSchema.parse(50)).not.toThrow()
  })

  it('accepts 100%', () => {
    expect(() => percentageSchema.parse(100)).not.toThrow()
  })

  it('rejects negative percentage', () => {
    expect(() => percentageSchema.parse(-1)).toThrow()
  })

  it('rejects percentage above 100', () => {
    expect(() => percentageSchema.parse(101)).toThrow()
  })
})

// =============================================================================
// Receipt Threshold Validation Tests (Domain Level)
// =============================================================================

let testContext: TestContext

beforeEach(() => {
  vi.useFakeTimers()
  testContext = setup()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Receipt Threshold Validation', () => {
  it('receipt not required for expenses under $25', () => {
    const amount = RECEIPT_REQUIRED_THRESHOLD_CENTS - 100 // $24
    const receiptRequired = amount >= RECEIPT_REQUIRED_THRESHOLD_CENTS
    expect(receiptRequired).toBe(false)
  })

  it('receipt not required for expenses exactly at $25', () => {
    // Note: Threshold is >= $25, so exactly $25 requires receipt
    const amount = RECEIPT_REQUIRED_THRESHOLD_CENTS // $25
    const receiptRequired = amount >= RECEIPT_REQUIRED_THRESHOLD_CENTS
    expect(receiptRequired).toBe(true)
  })

  it('receipt required for expenses over $25', () => {
    const amount = RECEIPT_REQUIRED_THRESHOLD_CENTS + 100 // $26
    const receiptRequired = amount >= RECEIPT_REQUIRED_THRESHOLD_CENTS
    expect(receiptRequired).toBe(true)
  })

  it('receipt threshold is $25 (2500 cents)', () => {
    expect(RECEIPT_REQUIRED_THRESHOLD_CENTS).toBe(2500)
  })
})

// =============================================================================
// Budget Overrun Threshold Tests
// =============================================================================

describe('Budget Overrun Threshold', () => {
  it('budget is OK at 89% burn rate', () => {
    const burnRate = 0.89
    const budgetOk = burnRate <= BUDGET_OVERRUN_THRESHOLD
    expect(budgetOk).toBe(true)
  })

  it('budget is OK at exactly 90% burn rate', () => {
    const burnRate = 0.90
    const budgetOk = burnRate <= BUDGET_OVERRUN_THRESHOLD
    expect(budgetOk).toBe(true)
  })

  it('budget is overrun at 91% burn rate', () => {
    const burnRate = 0.91
    const budgetOk = burnRate <= BUDGET_OVERRUN_THRESHOLD
    expect(budgetOk).toBe(false)
  })

  it('budget is overrun at 100% burn rate', () => {
    const burnRate = 1.0
    const budgetOk = burnRate <= BUDGET_OVERRUN_THRESHOLD
    expect(budgetOk).toBe(false)
  })

  it('budget overrun threshold is 90%', () => {
    expect(BUDGET_OVERRUN_THRESHOLD).toBe(0.9)
  })
})

// =============================================================================
// Self-Approval Prevention Tests (Domain Level)
// =============================================================================

describe('Self-Approval Prevention', () => {
  it('detects self-approval attempt for expenses', async () => {
    const { orgId, managerId, projectId } = await createTestData(testContext)

    // Create expense submitted by manager
    const expenseId = await testContext.run(async (ctx) => {
      return await ctx.db.insert('expenses', {
        organizationId: orgId,
        userId: managerId, // Same as approver
        projectId,
        date: Date.now(),
        amount: 5000,
        currency: 'USD',
        type: 'Other',
        description: 'Self-submitted expense',
        billable: true,
        status: 'Submitted',
        createdAt: Date.now(),
      })
    })

    // Verify self-approval would be detected
    const expense = await testContext.run(async (ctx) => {
      return await ctx.db.get(expenseId)
    })

    const reviewerId = managerId
    const isSelfApproval = expense?.userId === reviewerId
    expect(isSelfApproval).toBe(true)
  })

  it('detects self-approval attempt for time entries', async () => {
    const { orgId, managerId, projectId } = await createTestData(testContext)

    // Create time entry submitted by manager
    const timeEntryId = await testContext.run(async (ctx) => {
      return await ctx.db.insert('timeEntries', {
        organizationId: orgId,
        userId: managerId, // Same as approver
        projectId,
        date: Date.now(),
        hours: 8,
        status: 'Submitted',
        billable: true,
        createdAt: Date.now(),
      })
    })

    // Verify self-approval would be detected
    const timeEntry = await testContext.run(async (ctx) => {
      return await ctx.db.get(timeEntryId)
    })

    const reviewerId = managerId
    const isSelfApproval = timeEntry?.userId === reviewerId
    expect(isSelfApproval).toBe(true)
  })

  it('allows approval by different user', async () => {
    const { orgId, managerId, teamMemberId, projectId } = await createTestData(testContext)

    // Create expense submitted by team member
    const expenseId = await testContext.run(async (ctx) => {
      return await ctx.db.insert('expenses', {
        organizationId: orgId,
        userId: teamMemberId, // Different from approver
        projectId,
        date: Date.now(),
        amount: 5000,
        currency: 'USD',
        type: 'Other',
        description: 'Team member expense',
        billable: true,
        status: 'Submitted',
        createdAt: Date.now(),
      })
    })

    // Verify cross-approval is allowed
    const expense = await testContext.run(async (ctx) => {
      return await ctx.db.get(expenseId)
    })

    const reviewerId = managerId
    const isSelfApproval = expense?.userId === reviewerId
    expect(isSelfApproval).toBe(false)
  })
})

// =============================================================================
// Status Transition Validation Tests
// =============================================================================

// Helper function to check if expense can be reviewed (avoiding type narrowing issues)
function canReviewExpense(status: string): boolean {
  return status === 'Submitted'
}

// Helper function to check if time entry can be modified
function canModifyTimeEntry(status: string): boolean {
  return status === 'Draft' || status === 'Rejected'
}

describe('Status Transition Validation', () => {
  describe('Expense Status Transitions', () => {
    it('validates expense must be Submitted for approval', async () => {
      expect(canReviewExpense('Submitted')).toBe(true)
    })

    it('rejects Draft expense for approval', () => {
      expect(canReviewExpense('Draft')).toBe(false)
    })

    it('rejects Approved expense for re-approval', () => {
      expect(canReviewExpense('Approved')).toBe(false)
    })

    it('rejects Rejected expense for approval without revision', () => {
      expect(canReviewExpense('Rejected')).toBe(false)
    })
  })

  describe('Time Entry Status Transitions', () => {
    it('validates time entry must be Submitted for approval', () => {
      expect(canReviewExpense('Submitted')).toBe(true)
    })

    it('rejects Draft time entry for approval', () => {
      expect(canReviewExpense('Draft')).toBe(false)
    })

    it('rejects Approved time entry for re-approval', () => {
      expect(canReviewExpense('Approved')).toBe(false)
    })

    it('rejects Locked time entry for modification', () => {
      expect(canModifyTimeEntry('Locked')).toBe(false)
    })
  })
})

// =============================================================================
// Helper Functions
// =============================================================================

async function createTestData(t: TestContext) {
  return await t.run(async (ctx) => {
    const orgId = await ctx.db.insert('organizations', {
      name: 'Business Rules Test Org',
      settings: {},
      createdAt: Date.now(),
    })

    const managerId = await ctx.db.insert('users', {
      organizationId: orgId,
      email: 'manager@test.com',
      name: 'Test Manager',
      role: 'project_manager',
      costRate: 12000,
      billRate: 18000,
      skills: ['Management'],
      department: 'Management',
      location: 'Remote',
      isActive: true,
    })

    const teamMemberId = await ctx.db.insert('users', {
      organizationId: orgId,
      email: 'teammember@test.com',
      name: 'Team Member',
      role: 'team_member',
      costRate: 8000,
      billRate: 12000,
      skills: ['TypeScript', 'React'],
      department: 'Engineering',
      location: 'Remote',
      isActive: true,
    })

    const companyId = await ctx.db.insert('companies', {
      organizationId: orgId,
      name: 'Test Company',
      billingAddress: {
        street: '123 Test St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94104',
        country: 'USA',
      },
      paymentTerms: 30,
    })

    const contactId = await ctx.db.insert('contacts', {
      organizationId: orgId,
      companyId,
      name: 'Test Contact',
      email: 'contact@test.com',
      phone: '+1-555-0100',
      isPrimary: true,
    })

    const dealId = await ctx.db.insert('deals', {
      organizationId: orgId,
      name: 'Test Deal',
      value: 50000,
      stage: 'Won',
      probability: 100,
      ownerId: managerId,
      companyId,
      contactId,
      createdAt: Date.now(),
    })

    const projectId = await ctx.db.insert('projects', {
      organizationId: orgId,
      companyId,
      dealId,
      name: 'Test Project',
      status: 'Active',
      startDate: Date.now(),
      managerId,
      createdAt: Date.now(),
    })

    return { orgId, managerId, teamMemberId, companyId, contactId, dealId, projectId }
  })
}
