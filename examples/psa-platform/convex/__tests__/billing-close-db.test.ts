/// <reference types="vite/client" />
/**
 * Tests for Billing and Close Phase domain DB functions
 *
 * These tests validate the CRUD operations and business logic for
 * milestones, invoice generation, and project closure functionality.
 *
 * Reference:
 * - .review/recipes/psa-platform/specs/11-workflow-invoice-generation.md
 * - .review/recipes/psa-platform/specs/12-workflow-billing-phase.md
 * - .review/recipes/psa-platform/specs/13-workflow-close-phase.md
 */

import { describe, it, expect } from 'vitest'
import { setup, type TestContext } from './helpers.test'
import type { Id, Doc } from '../_generated/dataModel'

// Import milestone functions
import {
  insertMilestone,
  getMilestone,
  updateMilestone,
  deleteMilestone,
  listMilestonesByProject,
  listCompletedMilestones,
  listUninvoicedMilestones,
  completeMilestone,
  markMilestoneInvoiced,
  getNextMilestoneSortOrder,
} from '../workflows/dealToDelivery/db/milestones'

// Import invoice functions for milestone invoicing tests
import {
  insertInvoice,
} from '../workflows/dealToDelivery/db/invoices'

// =============================================================================
// Test Data Factories
// =============================================================================

type OmitIdAndCreationTime<T extends { _id: unknown; _creationTime: unknown }> =
  Omit<T, '_id' | '_creationTime'>

/**
 * Create a test organization
 */
async function createTestOrganization(
  t: TestContext
): Promise<Id<'organizations'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('organizations', {
      name: 'Billing Test Organization',
      settings: {},
      createdAt: Date.now(),
    })
  })
}

/**
 * Create a test user
 */
async function createTestUser(
  t: TestContext,
  organizationId: Id<'organizations'>,
  overrides: Partial<OmitIdAndCreationTime<Doc<'users'>>> = {}
): Promise<Id<'users'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      organizationId,
      email: `user-${Date.now()}@example.com`,
      name: 'Test User',
      role: 'admin',
      costRate: 10000,
      billRate: 15000,
      skills: [],
      department: 'Finance',
      location: 'Office',
      isActive: true,
      ...overrides,
    })
  })
}

/**
 * Create a test company
 */
async function createTestCompany(
  t: TestContext,
  organizationId: Id<'organizations'>
): Promise<Id<'companies'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('companies', {
      organizationId,
      name: 'Test Client Company',
      billingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'USA',
      },
      paymentTerms: 30,
    })
  })
}

/**
 * Create a test contact
 */
async function createTestContact(
  t: TestContext,
  organizationId: Id<'organizations'>,
  companyId: Id<'companies'>
): Promise<Id<'contacts'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('contacts', {
      organizationId,
      companyId,
      name: 'Test Contact',
      email: 'contact@test.com',
      phone: '+1-555-1234',
      isPrimary: true,
    })
  })
}

/**
 * Create a test deal
 */
async function createTestDeal(
  t: TestContext,
  organizationId: Id<'organizations'>,
  companyId: Id<'companies'>,
  contactId: Id<'contacts'>,
  ownerId: Id<'users'>
): Promise<Id<'deals'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('deals', {
      organizationId,
      companyId,
      contactId,
      ownerId,
      name: 'Test Deal',
      value: 10000000, // $100,000
      probability: 80,
      stage: 'Won',
      createdAt: Date.now(),
    })
  })
}

/**
 * Create a test project
 */
async function createTestProject(
  t: TestContext,
  organizationId: Id<'organizations'>,
  companyId: Id<'companies'>,
  dealId: Id<'deals'>,
  managerId: Id<'users'>
): Promise<Id<'projects'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('projects', {
      organizationId,
      companyId,
      dealId,
      managerId,
      name: 'Test Project',
      status: 'Active',
      startDate: Date.now(),
      endDate: Date.now() + 90 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
    })
  })
}

/**
 * Create a test milestone
 *
 * Schema fields:
 * - name: string
 * - percentage: number (percentage of budget)
 * - amount: number (amount in cents)
 * - dueDate: optional number
 * - completedAt: optional number
 * - invoiceId: optional Id<"invoices">
 * - sortOrder: number
 */
async function createTestMilestone(
  t: TestContext,
  projectId: Id<'projects'>,
  organizationId: Id<'organizations'>,
  overrides: Partial<Omit<Doc<'milestones'>, '_id' | '_creationTime' | 'projectId' | 'organizationId'>> = {}
): Promise<Id<'milestones'>> {
  return await t.run(async (ctx) => {
    return await insertMilestone(ctx.db, {
      projectId,
      organizationId,
      name: overrides.name ?? 'Test Milestone',
      dueDate: overrides.dueDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000,
      amount: overrides.amount ?? 2500000, // $25,000
      percentage: overrides.percentage ?? 25, // 25% of project
      sortOrder: overrides.sortOrder ?? 0,
      completedAt: overrides.completedAt,
      invoiceId: overrides.invoiceId,
    })
  })
}

/**
 * Create a test invoice
 */
async function createTestInvoice(
  t: TestContext,
  projectId: Id<'projects'>,
  organizationId: Id<'organizations'>,
  companyId: Id<'companies'>
): Promise<Id<'invoices'>> {
  return await t.run(async (ctx) => {
    return await insertInvoice(ctx.db, {
      projectId,
      organizationId,
      companyId,
      status: 'Draft',
      method: 'Milestone',
      subtotal: 2500000,
      tax: 0,
      total: 2500000,
      dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
    })
  })
}

// =============================================================================
// Milestone DB Function Tests
// =============================================================================

describe('Milestones DB Functions', () => {
  describe('insertMilestone', () => {
    it('creates a new milestone', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId, {
        name: 'Phase 1 Complete',
        amount: 5000000,
        percentage: 50,
      })

      const milestone = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })

      expect(milestone).not.toBeNull()
      expect(milestone!.name).toBe('Phase 1 Complete')
      expect(milestone!.amount).toBe(5000000)
      expect(milestone!.percentage).toBe(50)
      expect(milestone!.projectId).toBe(projectId)
    })
  })

  describe('getMilestone', () => {
    it('returns null for non-existent milestone', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      // Create one milestone just to have a valid ID format
      const milestoneId = await createTestMilestone(t, projectId, orgId)

      // Delete it to make a non-existent but valid format ID
      await t.run(async (ctx) => {
        await ctx.db.delete(milestoneId)
      })

      const result = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })

      expect(result).toBeNull()
    })

    it('returns the milestone when it exists', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId, {
        name: 'Design Phase',
      })

      const milestone = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })

      expect(milestone).not.toBeNull()
      expect(milestone!._id).toBe(milestoneId)
      expect(milestone!.name).toBe('Design Phase')
    })
  })

  describe('updateMilestone', () => {
    it('updates milestone fields', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId, {
        name: 'Original Name',
        amount: 1000000,
      })

      await t.run(async (ctx) => {
        await updateMilestone(ctx.db, milestoneId, {
          name: 'Updated Name',
          amount: 2000000,
        })
      })

      const updated = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })

      expect(updated!.name).toBe('Updated Name')
      expect(updated!.amount).toBe(2000000)
    })

    it('throws error for non-existent milestone', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId)
      await t.run(async (ctx) => {
        await ctx.db.delete(milestoneId)
      })

      await expect(
        t.run(async (ctx) => {
          await updateMilestone(ctx.db, milestoneId, { name: 'New Name' })
        })
      ).rejects.toThrow()
    })
  })

  describe('deleteMilestone', () => {
    it('deletes a milestone', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId)

      await t.run(async (ctx) => {
        await deleteMilestone(ctx.db, milestoneId)
      })

      const deleted = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })

      expect(deleted).toBeNull()
    })
  })

  describe('listMilestonesByProject', () => {
    it('returns all milestones for a project', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      await createTestMilestone(t, projectId, orgId, { name: 'Milestone 1', sortOrder: 0 })
      await createTestMilestone(t, projectId, orgId, { name: 'Milestone 2', sortOrder: 1 })
      await createTestMilestone(t, projectId, orgId, { name: 'Milestone 3', sortOrder: 2 })

      const milestones = await t.run(async (ctx) => {
        return await listMilestonesByProject(ctx.db, projectId)
      })

      expect(milestones).toHaveLength(3)
      expect(milestones.map((m) => m.name)).toContain('Milestone 1')
      expect(milestones.map((m) => m.name)).toContain('Milestone 2')
      expect(milestones.map((m) => m.name)).toContain('Milestone 3')
    })

    it('returns empty array for project with no milestones', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestones = await t.run(async (ctx) => {
        return await listMilestonesByProject(ctx.db, projectId)
      })

      expect(milestones).toHaveLength(0)
    })
  })

  describe('listCompletedMilestones', () => {
    it('returns only completed milestones', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      // Create a completed milestone
      await createTestMilestone(t, projectId, orgId, {
        name: 'Completed Milestone',
        completedAt: Date.now(),
      })
      // Create an incomplete milestone
      await createTestMilestone(t, projectId, orgId, {
        name: 'Incomplete Milestone',
      })

      const completed = await t.run(async (ctx) => {
        return await listCompletedMilestones(ctx.db, projectId)
      })

      expect(completed).toHaveLength(1)
      expect(completed[0].name).toBe('Completed Milestone')
    })
  })

  describe('listUninvoicedMilestones', () => {
    it('returns completed milestones without invoice', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      // Create an invoice for testing
      const invoiceId = await createTestInvoice(t, projectId, orgId, companyId)

      // Completed and uninvoiced (should be returned)
      await createTestMilestone(t, projectId, orgId, {
        name: 'Uninvoiced Milestone',
        completedAt: Date.now(),
      })
      // Completed and invoiced (should not be returned)
      await createTestMilestone(t, projectId, orgId, {
        name: 'Invoiced Milestone',
        completedAt: Date.now(),
        invoiceId,
      })
      // Incomplete (should not be returned)
      await createTestMilestone(t, projectId, orgId, {
        name: 'Incomplete Milestone',
      })

      const uninvoiced = await t.run(async (ctx) => {
        return await listUninvoicedMilestones(ctx.db, projectId)
      })

      expect(uninvoiced).toHaveLength(1)
      expect(uninvoiced[0].name).toBe('Uninvoiced Milestone')
    })
  })

  describe('completeMilestone', () => {
    it('sets completedAt timestamp', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId, {
        name: 'Milestone to Complete',
      })

      const before = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })
      expect(before!.completedAt).toBeUndefined()

      await t.run(async (ctx) => {
        await completeMilestone(ctx.db, milestoneId)
      })

      const after = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })
      expect(after!.completedAt).toBeDefined()
      expect(after!.completedAt).toBeGreaterThan(0)
    })
  })

  describe('markMilestoneInvoiced', () => {
    it('links milestone to invoice', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const milestoneId = await createTestMilestone(t, projectId, orgId, {
        name: 'Milestone for Invoicing',
        completedAt: Date.now(),
      })
      const invoiceId = await createTestInvoice(t, projectId, orgId, companyId)

      const before = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })
      expect(before!.invoiceId).toBeUndefined()

      await t.run(async (ctx) => {
        await markMilestoneInvoiced(ctx.db, milestoneId, invoiceId)
      })

      const after = await t.run(async (ctx) => {
        return await getMilestone(ctx.db, milestoneId)
      })
      expect(after!.invoiceId).toBe(invoiceId)
    })
  })

  describe('getNextMilestoneSortOrder', () => {
    it('returns 0 for project with no milestones', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      const sortOrder = await t.run(async (ctx) => {
        return await getNextMilestoneSortOrder(ctx.db, projectId)
      })

      expect(sortOrder).toBe(0)
    })

    it('returns next sort order based on existing milestones', async () => {
      const t = setup()
      const orgId = await createTestOrganization(t)
      const userId = await createTestUser(t, orgId)
      const companyId = await createTestCompany(t, orgId)
      const contactId = await createTestContact(t, orgId, companyId)
      const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
      const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

      await createTestMilestone(t, projectId, orgId, { sortOrder: 0 })
      await createTestMilestone(t, projectId, orgId, { sortOrder: 1 })
      await createTestMilestone(t, projectId, orgId, { sortOrder: 5 }) // Gap in sequence

      const sortOrder = await t.run(async (ctx) => {
        return await getNextMilestoneSortOrder(ctx.db, projectId)
      })

      expect(sortOrder).toBe(6) // max(0,1,5) + 1
    })
  })
})

// =============================================================================
// Additional Invoice Tests (Milestone-Related)
// =============================================================================

describe('Invoice - Milestone Integration', () => {
  it('milestone-based invoice workflow', async () => {
    const t = setup()
    const orgId = await createTestOrganization(t)
    const userId = await createTestUser(t, orgId)
    const companyId = await createTestCompany(t, orgId)
    const contactId = await createTestContact(t, orgId, companyId)
    const dealId = await createTestDeal(t, orgId, companyId, contactId, userId)
    const projectId = await createTestProject(t, orgId, companyId, dealId, userId)

    // Create milestone with 25% budget allocation
    const milestoneId = await createTestMilestone(t, projectId, orgId, {
      name: 'Phase 1 Delivery',
      amount: 2500000, // $25,000
      percentage: 25,
    })

    // Complete the milestone
    await t.run(async (ctx) => {
      await completeMilestone(ctx.db, milestoneId)
    })

    // Verify milestone is in uninvoiced list
    const uninvoiced = await t.run(async (ctx) => {
      return await listUninvoicedMilestones(ctx.db, projectId)
    })
    expect(uninvoiced).toHaveLength(1)
    expect(uninvoiced[0]._id).toBe(milestoneId)

    // Create invoice for the milestone
    const invoiceId = await createTestInvoice(t, projectId, orgId, companyId)

    // Mark milestone as invoiced
    await t.run(async (ctx) => {
      await markMilestoneInvoiced(ctx.db, milestoneId, invoiceId)
    })

    // Verify milestone is no longer in uninvoiced list
    const stillUninvoiced = await t.run(async (ctx) => {
      return await listUninvoicedMilestones(ctx.db, projectId)
    })
    expect(stillUninvoiced).toHaveLength(0)

    // Verify milestone has invoice link
    const milestone = await t.run(async (ctx) => {
      return await getMilestone(ctx.db, milestoneId)
    })
    expect(milestone!.invoiceId).toBe(invoiceId)
  })
})
