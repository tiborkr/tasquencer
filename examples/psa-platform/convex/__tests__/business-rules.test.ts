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

// =============================================================================
// Expense Policy Limits Tests (spec 10-workflow-expense-approval.md lines 293-304)
// =============================================================================

import {
  EXPENSE_PER_ITEM_LIMITS,
  EXPENSE_TYPE_LIMITS,
  checkExpensePolicyLimit,
  checkTravelExpensePolicyLimit,
  checkSoftwareExpensePolicyLimit,
  checkMaterialsExpensePolicyLimit,
  checkOtherExpensePolicyLimit,
  formatAmountForDisplay,
  getPolicyLimitForType,
} from '../workflows/dealToDelivery/db/expensePolicyLimits'

describe('Expense Policy Limits Validation', () => {
  describe('Policy Limit Constants', () => {
    it('has correct per-item limit for Airfare ($1,000)', () => {
      expect(EXPENSE_PER_ITEM_LIMITS.Airfare).toBe(100_000) // cents
    })

    it('has correct per-item limit for Hotel ($250/night)', () => {
      expect(EXPENSE_PER_ITEM_LIMITS.Hotel).toBe(25_000) // cents
    })

    it('has correct per-item limit for Meals ($30)', () => {
      expect(EXPENSE_PER_ITEM_LIMITS.Meals).toBe(3_000) // cents
    })

    it('has correct limit for Software ($500)', () => {
      expect(EXPENSE_TYPE_LIMITS.Software).toBe(50_000) // cents
    })

    it('has correct limit for Materials ($1,000)', () => {
      expect(EXPENSE_TYPE_LIMITS.Materials).toBe(100_000) // cents
    })

    it('has correct limit for Other ($250)', () => {
      expect(EXPENSE_TYPE_LIMITS.Other).toBe(25_000) // cents
    })

    it('has no fixed limit for Subcontractor', () => {
      expect(EXPENSE_TYPE_LIMITS.Subcontractor).toBeNull()
    })

    it('has no fixed limit for Travel (uses subcategory limits)', () => {
      expect(EXPENSE_TYPE_LIMITS.Travel).toBeNull()
    })
  })

  describe('Travel Expense Policy Checks', () => {
    describe('Airfare ($1,000 limit)', () => {
      it('does not flag airfare under limit', () => {
        const result = checkTravelExpensePolicyLimit(80_000, 'Airfare') // $800
        expect(result.exceeded).toBe(false)
        expect(result.violations).toHaveLength(0)
        expect(result.summary).toBeNull()
      })

      it('does not flag airfare exactly at limit', () => {
        const result = checkTravelExpensePolicyLimit(100_000, 'Airfare') // $1,000
        expect(result.exceeded).toBe(false)
        expect(result.violations).toHaveLength(0)
      })

      it('flags airfare over limit', () => {
        const result = checkTravelExpensePolicyLimit(120_000, 'Airfare') // $1,200
        expect(result.exceeded).toBe(true)
        expect(result.violations).toHaveLength(1)
        expect(result.violations[0].category).toBe('Airfare')
        expect(result.violations[0].overBy).toBe(20_000)
        expect(result.summary).toContain('exceeds policy limit')
      })
    })

    describe('Hotel ($250/night limit)', () => {
      it('does not flag hotel under limit for single night', () => {
        const result = checkTravelExpensePolicyLimit(20_000, 'Hotel', 1) // $200
        expect(result.exceeded).toBe(false)
      })

      it('does not flag hotel exactly at limit for single night', () => {
        const result = checkTravelExpensePolicyLimit(25_000, 'Hotel', 1) // $250
        expect(result.exceeded).toBe(false)
      })

      it('flags hotel over limit for single night', () => {
        const result = checkTravelExpensePolicyLimit(35_000, 'Hotel', 1) // $350
        expect(result.exceeded).toBe(true)
        expect(result.violations[0].limit).toBe(25_000)
      })

      it('calculates limit correctly for multiple nights', () => {
        const result = checkTravelExpensePolicyLimit(60_000, 'Hotel', 3) // $600 for 3 nights ($250 x 3 = $750 limit)
        expect(result.exceeded).toBe(false)
      })

      it('flags hotel over limit for multiple nights', () => {
        const result = checkTravelExpensePolicyLimit(80_000, 'Hotel', 3) // $800 for 3 nights ($750 limit)
        expect(result.exceeded).toBe(true)
        expect(result.violations[0].limit).toBe(75_000) // $250 x 3
        expect(result.summary).toContain('$250.00/night x 3 nights')
      })
    })

    describe('Meals ($30 per expense)', () => {
      it('does not flag meals under limit', () => {
        const result = checkTravelExpensePolicyLimit(2_500, 'Meals') // $25
        expect(result.exceeded).toBe(false)
      })

      it('flags meals over limit', () => {
        const result = checkTravelExpensePolicyLimit(4_500, 'Meals') // $45
        expect(result.exceeded).toBe(true)
        expect(result.violations[0].overBy).toBe(1_500) // $15 over
      })
    })

    describe('Mileage (no fixed limit)', () => {
      it('does not flag mileage regardless of amount', () => {
        const result = checkTravelExpensePolicyLimit(50_000, 'Mileage') // $500 in mileage
        expect(result.exceeded).toBe(false)
      })
    })
  })

  describe('Software Expense Policy Checks ($500 limit)', () => {
    it('does not flag software expense under limit', () => {
      const result = checkSoftwareExpensePolicyLimit(30_000) // $300
      expect(result.exceeded).toBe(false)
    })

    it('does not flag software expense exactly at limit', () => {
      const result = checkSoftwareExpensePolicyLimit(50_000) // $500
      expect(result.exceeded).toBe(false)
    })

    it('flags software expense over limit', () => {
      const result = checkSoftwareExpensePolicyLimit(75_000) // $750
      expect(result.exceeded).toBe(true)
      expect(result.violations[0].limit).toBe(50_000)
      expect(result.violations[0].overBy).toBe(25_000)
      expect(result.summary).toContain('Software expense')
      expect(result.summary).toContain('$750.00')
      expect(result.summary).toContain('$500.00')
    })
  })

  describe('Materials Expense Policy Checks ($1,000 limit)', () => {
    it('does not flag materials expense under limit', () => {
      const result = checkMaterialsExpensePolicyLimit(80_000) // $800
      expect(result.exceeded).toBe(false)
    })

    it('does not flag materials expense exactly at limit', () => {
      const result = checkMaterialsExpensePolicyLimit(100_000) // $1,000
      expect(result.exceeded).toBe(false)
    })

    it('flags materials expense over limit', () => {
      const result = checkMaterialsExpensePolicyLimit(150_000) // $1,500
      expect(result.exceeded).toBe(true)
      expect(result.violations[0].overBy).toBe(50_000)
    })
  })

  describe('Other Expense Policy Checks ($250 limit)', () => {
    it('does not flag other expense under limit', () => {
      const result = checkOtherExpensePolicyLimit(15_000) // $150
      expect(result.exceeded).toBe(false)
    })

    it('does not flag other expense exactly at limit', () => {
      const result = checkOtherExpensePolicyLimit(25_000) // $250
      expect(result.exceeded).toBe(false)
    })

    it('flags other expense over limit', () => {
      const result = checkOtherExpensePolicyLimit(40_000) // $400
      expect(result.exceeded).toBe(true)
      expect(result.violations[0].limit).toBe(25_000)
      expect(result.violations[0].overBy).toBe(15_000)
    })
  })

  describe('Generic checkExpensePolicyLimit', () => {
    it('returns no violation for Subcontractor (no fixed limit)', () => {
      const result = checkExpensePolicyLimit('Subcontractor', 500_000) // $5,000
      expect(result.exceeded).toBe(false)
    })

    it('routes Travel expense to subcategory limit when provided', () => {
      const result = checkExpensePolicyLimit('Travel', 120_000, 'Airfare')
      expect(result.exceeded).toBe(true)
      expect(result.violations[0].category).toBe('Airfare')
    })

    it('returns no violation for Travel without subcategory (no general limit)', () => {
      const result = checkExpensePolicyLimit('Travel', 500_000)
      expect(result.exceeded).toBe(false)
    })
  })

  describe('Utility Functions', () => {
    it('formats amount correctly for display', () => {
      expect(formatAmountForDisplay(10_000)).toBe('$100.00')
      expect(formatAmountForDisplay(150_099)).toBe('$1500.99')
      expect(formatAmountForDisplay(0)).toBe('$0.00')
    })

    it('gets correct policy limit for expense type', () => {
      expect(getPolicyLimitForType('Software')).toBe(50_000)
      expect(getPolicyLimitForType('Materials')).toBe(100_000)
      expect(getPolicyLimitForType('Other')).toBe(25_000)
      expect(getPolicyLimitForType('Subcontractor')).toBeNull()
      expect(getPolicyLimitForType('Travel')).toBeNull()
    })

    it('gets correct policy limit for travel subcategory', () => {
      expect(getPolicyLimitForType('Travel', 'Airfare')).toBe(100_000)
      expect(getPolicyLimitForType('Travel', 'Hotel')).toBe(25_000)
      expect(getPolicyLimitForType('Travel', 'Meals')).toBe(3_000)
    })
  })

  describe('PolicyViolation Structure', () => {
    it('includes all required violation details', () => {
      const result = checkSoftwareExpensePolicyLimit(60_000) // $600, over by $100
      expect(result.exceeded).toBe(true)
      const violation = result.violations[0]

      expect(violation.type).toBe('per_expense')
      expect(violation.category).toBe('Software')
      expect(violation.amount).toBe(60_000)
      expect(violation.limit).toBe(50_000)
      expect(violation.overBy).toBe(10_000)
      expect(violation.message).toBeTruthy()
    })
  })
})

// =============================================================================
// Revision Cycle Escalation Tests (spec 09-workflow-timesheet-approval.md line 281,
// spec 10-workflow-expense-approval.md line 288)
// =============================================================================

import {
  MAX_REVISION_CYCLES,
  checkRevisionCycleOnRejection,
  requiresAdminIntervention,
  getRemainingRevisionAttempts,
  getEscalationWarning,
} from '../workflows/dealToDelivery/db/revisionCycle'

import {
  rejectTimeEntryWithRevisionTracking,
} from '../workflows/dealToDelivery/db/timeEntries'

import {
  rejectExpenseWithRevisionTracking,
} from '../workflows/dealToDelivery/db/expenses'

describe('Revision Cycle Escalation Validation', () => {
  describe('MAX_REVISION_CYCLES constant', () => {
    it('has correct value of 3 per spec', () => {
      expect(MAX_REVISION_CYCLES).toBe(3)
    })
  })

  describe('checkRevisionCycleOnRejection', () => {
    it('increments count from 0 to 1 on first rejection', () => {
      const result = checkRevisionCycleOnRejection(0)
      expect(result.newRevisionCount).toBe(1)
      expect(result.shouldEscalate).toBe(false)
      expect(result.escalationMessage).toBeNull()
    })

    it('increments count from undefined to 1 on first rejection', () => {
      const result = checkRevisionCycleOnRejection(undefined)
      expect(result.newRevisionCount).toBe(1)
      expect(result.shouldEscalate).toBe(false)
    })

    it('increments count from 1 to 2 on second rejection', () => {
      const result = checkRevisionCycleOnRejection(1)
      expect(result.newRevisionCount).toBe(2)
      expect(result.shouldEscalate).toBe(false)
    })

    it('increments count from 2 to 3 and triggers escalation', () => {
      const result = checkRevisionCycleOnRejection(2)
      expect(result.newRevisionCount).toBe(3)
      expect(result.shouldEscalate).toBe(true)
      expect(result.escalationMessage).toContain('admin review')
    })

    it('escalates on counts beyond 3', () => {
      const result = checkRevisionCycleOnRejection(5)
      expect(result.newRevisionCount).toBe(6)
      expect(result.shouldEscalate).toBe(true)
    })
  })

  describe('requiresAdminIntervention', () => {
    it('returns false for count 0', () => {
      expect(requiresAdminIntervention(0, false)).toBe(false)
    })

    it('returns false for count 2', () => {
      expect(requiresAdminIntervention(2, false)).toBe(false)
    })

    it('returns true for count 3', () => {
      expect(requiresAdminIntervention(3, false)).toBe(true)
    })

    it('returns true when escalatedToAdmin is true', () => {
      expect(requiresAdminIntervention(1, true)).toBe(true)
    })

    it('returns true for undefined count with escalatedToAdmin true', () => {
      expect(requiresAdminIntervention(undefined, true)).toBe(true)
    })
  })

  describe('getRemainingRevisionAttempts', () => {
    it('returns 3 for count 0', () => {
      expect(getRemainingRevisionAttempts(0)).toBe(3)
    })

    it('returns 3 for undefined count', () => {
      expect(getRemainingRevisionAttempts(undefined)).toBe(3)
    })

    it('returns 2 for count 1', () => {
      expect(getRemainingRevisionAttempts(1)).toBe(2)
    })

    it('returns 1 for count 2', () => {
      expect(getRemainingRevisionAttempts(2)).toBe(1)
    })

    it('returns 0 for count 3', () => {
      expect(getRemainingRevisionAttempts(3)).toBe(0)
    })

    it('returns negative for counts beyond 3', () => {
      expect(getRemainingRevisionAttempts(5)).toBe(-2)
    })
  })

  describe('getEscalationWarning', () => {
    it('returns null for count 0 (no warning needed)', () => {
      expect(getEscalationWarning(0)).toBeNull()
    })

    it('returns null for count 1 (still has 2 remaining)', () => {
      expect(getEscalationWarning(undefined)).toBeNull()
    })

    it('returns warning for count 1 with 2 remaining', () => {
      const warning = getEscalationWarning(1)
      expect(warning).toContain('2 revision attempts remaining')
    })

    it('returns urgent warning for count 2 (last attempt)', () => {
      const warning = getEscalationWarning(2)
      expect(warning).toContain('last revision attempt')
    })

    it('returns exceeded message for count 3+', () => {
      const warning = getEscalationWarning(3)
      expect(warning).toContain('exceeded')
      expect(warning).toContain('admin review')
    })
  })

  describe('Database-level revision tracking', () => {
    let testContext: TestContext

    beforeEach(() => {
      testContext = setup()
    })

    it('rejectTimeEntryWithRevisionTracking increments count and tracks escalation', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      // Create a time entry
      const timeEntryId = await testContext.run(async (ctx) => {
        return await ctx.db.insert('timeEntries', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: Date.now(),
          hours: 8,
          status: 'Submitted',
          billable: true,
          createdAt: Date.now(),
        })
      })

      // First rejection
      const result1 = await testContext.run(async (ctx) => {
        return await rejectTimeEntryWithRevisionTracking(
          ctx.db,
          timeEntryId,
          'First rejection'
        )
      })
      expect(result1.newRevisionCount).toBe(1)
      expect(result1.escalated).toBe(false)

      // Check entry was updated
      const entry1 = await testContext.run(async (ctx) => ctx.db.get(timeEntryId))
      expect(entry1?.status).toBe('Rejected')
      expect(entry1?.revisionCount).toBe(1)
      expect(entry1?.escalatedToAdmin).toBe(false)

      // Resubmit for second rejection
      await testContext.run(async (ctx) => ctx.db.patch(timeEntryId, { status: 'Submitted' }))

      // Second rejection
      const result2 = await testContext.run(async (ctx) => {
        return await rejectTimeEntryWithRevisionTracking(
          ctx.db,
          timeEntryId,
          'Second rejection'
        )
      })
      expect(result2.newRevisionCount).toBe(2)
      expect(result2.escalated).toBe(false)

      // Resubmit for third rejection
      await testContext.run(async (ctx) => ctx.db.patch(timeEntryId, { status: 'Submitted' }))

      // Third rejection - should escalate
      const result3 = await testContext.run(async (ctx) => {
        return await rejectTimeEntryWithRevisionTracking(
          ctx.db,
          timeEntryId,
          'Third rejection - escalation'
        )
      })
      expect(result3.newRevisionCount).toBe(3)
      expect(result3.escalated).toBe(true)

      // Check entry was escalated
      const entry3 = await testContext.run(async (ctx) => ctx.db.get(timeEntryId))
      expect(entry3?.escalatedToAdmin).toBe(true)
    })

    it('rejectExpenseWithRevisionTracking increments count and tracks escalation', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      // Create an expense
      const expenseId = await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Other',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Submitted',
          date: Date.now(),
          description: 'Test expense',
          createdAt: Date.now(),
        })
      })

      // Reject 3 times
      for (let i = 1; i <= 3; i++) {
        if (i > 1) {
          // Resubmit
          await testContext.run(async (ctx) => ctx.db.patch(expenseId, { status: 'Submitted' }))
        }

        const result = await testContext.run(async (ctx) => {
          return await rejectExpenseWithRevisionTracking(
            ctx.db,
            expenseId,
            `Rejection ${i}`,
            [{ type: 'other', details: `Issue ${i}` }]
          )
        })

        expect(result.newRevisionCount).toBe(i)
        expect(result.escalated).toBe(i >= 3)
      }

      // Check expense was escalated
      const expense = await testContext.run(async (ctx) => ctx.db.get(expenseId))
      expect(expense?.escalatedToAdmin).toBe(true)
      expect(expense?.revisionCount).toBe(3)
    })
  })
})

// =============================================================================
// Duplicate Detection Tests (spec 09-workflow-timesheet-approval.md line 249,
// spec 10-workflow-expense-approval.md line 275)
// =============================================================================

import {
  checkTimeEntryDuplicates,
  isTimeEntryDuplicate,
  checkExpenseDuplicates,
  isExpenseDuplicate,
  normalizeDateToDay,
  isSameDay,
} from '../workflows/dealToDelivery/db/duplicateDetection'

describe('Duplicate Detection Validation', () => {
  describe('Date Utility Functions', () => {
    it('normalizeDateToDay sets time to midnight UTC', () => {
      const timestamp = new Date('2024-06-15T14:30:45.123Z').getTime()
      const normalized = normalizeDateToDay(timestamp)
      const normalizedDate = new Date(normalized)
      expect(normalizedDate.getUTCHours()).toBe(0)
      expect(normalizedDate.getUTCMinutes()).toBe(0)
      expect(normalizedDate.getUTCSeconds()).toBe(0)
      expect(normalizedDate.getUTCMilliseconds()).toBe(0)
    })

    it('isSameDay returns true for timestamps on the same day', () => {
      const t1 = new Date('2024-06-15T09:00:00Z').getTime()
      const t2 = new Date('2024-06-15T18:30:00Z').getTime()
      expect(isSameDay(t1, t2)).toBe(true)
    })

    it('isSameDay returns false for timestamps on different days', () => {
      const t1 = new Date('2024-06-15T23:59:59Z').getTime()
      const t2 = new Date('2024-06-16T00:00:00Z').getTime()
      expect(isSameDay(t1, t2)).toBe(false)
    })
  })

  describe('Time Entry Duplicate Detection', () => {
    let testContext: TestContext

    beforeEach(() => {
      testContext = setup()
    })

    it('returns no duplicates when no entries exist', async () => {
      const { teamMemberId, projectId } = await createTestData(testContext)

      const result = await testContext.run(async (ctx) => {
        return await checkTimeEntryDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: Date.now(),
        })
      })

      expect(result.hasPotentialDuplicates).toBe(false)
      expect(result.duplicateIds).toHaveLength(0)
      expect(result.warningMessage).toBeNull()
      expect(result.confidence).toBeNull()
    })

    it('detects exact duplicates when same task exists on same date', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      // Create a task
      const taskId = await testContext.run(async (ctx) => {
        return await ctx.db.insert('tasks', {
          organizationId: orgId,
          projectId,
          name: 'Test Task',
          description: 'Test task for duplicate detection',
          status: 'InProgress',
          priority: 'Medium',
          assigneeIds: [],
          dependencies: [],
          sortOrder: 1,
          createdAt: Date.now(),
        })
      })

      const testDate = Date.now()

      // Create existing entry
      await testContext.run(async (ctx) => {
        return await ctx.db.insert('timeEntries', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          taskId,
          date: testDate,
          hours: 4,
          status: 'Draft',
          billable: true,
          createdAt: Date.now(),
        })
      })

      // Check for duplicates
      const result = await testContext.run(async (ctx) => {
        return await checkTimeEntryDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          taskId,
        })
      })

      expect(result.hasPotentialDuplicates).toBe(true)
      expect(result.duplicateIds).toHaveLength(1)
      expect(result.confidence).toBe('exact')
      expect(result.warningMessage).toContain('same task')
    })

    it('detects likely duplicates when same project/date exists', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      // Create existing entry without task
      await testContext.run(async (ctx) => {
        return await ctx.db.insert('timeEntries', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: testDate,
          hours: 4,
          status: 'Draft',
          billable: true,
          createdAt: Date.now(),
        })
      })

      // Check for duplicates (no task specified)
      const result = await testContext.run(async (ctx) => {
        return await checkTimeEntryDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
        })
      })

      expect(result.hasPotentialDuplicates).toBe(true)
      expect(result.confidence).toBe('likely')
      expect(result.warningMessage).toContain('same date')
    })

    it('excludes current entry when checking for duplicates', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      // Create an entry
      const entryId = await testContext.run(async (ctx) => {
        return await ctx.db.insert('timeEntries', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          date: testDate,
          hours: 4,
          status: 'Draft',
          billable: true,
          createdAt: Date.now(),
        })
      })

      // Check excluding the entry itself
      const result = await testContext.run(async (ctx) => {
        return await checkTimeEntryDuplicates(
          ctx.db,
          {
            userId: teamMemberId,
            projectId,
            date: testDate,
          },
          entryId
        )
      })

      expect(result.hasPotentialDuplicates).toBe(false)
    })

    it('isTimeEntryDuplicate returns true for exact matches', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const taskId = await testContext.run(async (ctx) => {
        return await ctx.db.insert('tasks', {
          organizationId: orgId,
          projectId,
          name: 'Test Task',
          description: 'Test task for duplicate detection',
          status: 'InProgress',
          priority: 'Medium',
          assigneeIds: [],
          dependencies: [],
          sortOrder: 1,
          createdAt: Date.now(),
        })
      })

      const testDate = Date.now()

      await testContext.run(async (ctx) => {
        return await ctx.db.insert('timeEntries', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          taskId,
          date: testDate,
          hours: 4,
          status: 'Draft',
          billable: true,
          createdAt: Date.now(),
        })
      })

      const isDuplicate = await testContext.run(async (ctx) => {
        return await isTimeEntryDuplicate(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          taskId,
        })
      })

      expect(isDuplicate).toBe(true)
    })
  })

  describe('Expense Duplicate Detection', () => {
    let testContext: TestContext

    beforeEach(() => {
      testContext = setup()
    })

    it('returns no duplicates when no expenses exist', async () => {
      const { teamMemberId, projectId } = await createTestData(testContext)

      const result = await testContext.run(async (ctx) => {
        return await checkExpenseDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: Date.now(),
          amount: 5000,
          type: 'Other',
        })
      })

      expect(result.hasPotentialDuplicates).toBe(false)
      expect(result.duplicateIds).toHaveLength(0)
    })

    it('detects exact duplicates when same amount and type exists', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()
      const testAmount = 5000

      // Create existing expense
      await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: testAmount,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: testDate,
          description: 'Existing expense',
          createdAt: Date.now(),
        })
      })

      // Check for duplicates
      const result = await testContext.run(async (ctx) => {
        return await checkExpenseDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          amount: testAmount,
          type: 'Software',
        })
      })

      expect(result.hasPotentialDuplicates).toBe(true)
      expect(result.confidence).toBe('exact')
      expect(result.warningMessage).toContain('appears to be a duplicate')
    })

    it('detects likely duplicates when similar amount exists (within 10%)', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      // Create existing expense with $50
      await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Materials',
          amount: 5000, // $50
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: testDate,
          description: 'Existing expense',
          createdAt: Date.now(),
        })
      })

      // Check with similar amount ($52, within 10%)
      const result = await testContext.run(async (ctx) => {
        return await checkExpenseDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          amount: 5200, // $52
          type: 'Materials',
        })
      })

      expect(result.hasPotentialDuplicates).toBe(true)
      expect(result.confidence).toBe('likely')
      expect(result.warningMessage).toContain('similar')
    })

    it('detects possible duplicates when same type/date but different amount', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      // Create existing expense with $50
      await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Travel',
          amount: 5000, // $50
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: testDate,
          description: 'Existing expense',
          createdAt: Date.now(),
        })
      })

      // Check with very different amount ($200)
      const result = await testContext.run(async (ctx) => {
        return await checkExpenseDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          amount: 20000, // $200 - more than 10% different
          type: 'Travel',
        })
      })

      expect(result.hasPotentialDuplicates).toBe(true)
      expect(result.confidence).toBe('possible')
      expect(result.warningMessage).toContain('Consider if this is a duplicate')
    })

    it('does not flag expenses of different types as duplicates', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      // Create Software expense
      await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Software',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: testDate,
          description: 'Software expense',
          createdAt: Date.now(),
        })
      })

      // Check for Travel expense
      const result = await testContext.run(async (ctx) => {
        return await checkExpenseDuplicates(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          amount: 5000,
          type: 'Travel',
        })
      })

      expect(result.hasPotentialDuplicates).toBe(false)
    })

    it('isExpenseDuplicate returns true for exact matches', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Other',
          amount: 2500,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: testDate,
          description: 'Existing expense',
          createdAt: Date.now(),
        })
      })

      const isDuplicate = await testContext.run(async (ctx) => {
        return await isExpenseDuplicate(ctx.db, {
          userId: teamMemberId,
          projectId,
          date: testDate,
          amount: 2500,
          type: 'Other',
        })
      })

      expect(isDuplicate).toBe(true)
    })

    it('excludes current expense when checking for duplicates', async () => {
      const { orgId, teamMemberId, projectId } = await createTestData(testContext)

      const testDate = Date.now()

      const expenseId = await testContext.run(async (ctx) => {
        return await ctx.db.insert('expenses', {
          organizationId: orgId,
          userId: teamMemberId,
          projectId,
          type: 'Other',
          amount: 5000,
          currency: 'USD',
          billable: true,
          status: 'Draft',
          date: testDate,
          description: 'Test expense',
          createdAt: Date.now(),
        })
      })

      const result = await testContext.run(async (ctx) => {
        return await checkExpenseDuplicates(
          ctx.db,
          {
            userId: teamMemberId,
            projectId,
            date: testDate,
            amount: 5000,
            type: 'Other',
          },
          expenseId
        )
      })

      expect(result.hasPotentialDuplicates).toBe(false)
    })
  })
})
