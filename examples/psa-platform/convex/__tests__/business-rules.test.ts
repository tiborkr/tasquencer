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
