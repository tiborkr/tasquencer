/// <reference types="vite/client" />
/**
 * Work Item API Tests
 *
 * Tests for work item release and admin override functionality.
 *
 * Key test scenarios:
 * - User can release their own claimed work items
 * - Non-admin cannot release other users' claimed work items
 * - Admin can release any user's claimed work items
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  setup,
  setupUserWithRole,
  createTestAuthRole,
  assignRoleToUser,
  type TestContext,
} from './helpers.test'
import { api } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { authComponent } from '../auth'

// All scopes needed for work item tests
const STAFF_SCOPES = [
  'dealToDelivery:staff',
  'dealToDelivery:deals:view:own',
  'dealToDelivery:deals:create',
  'dealToDelivery:deals:qualify',
]

const ADMIN_SCOPES = ['dealToDelivery:staff', 'dealToDelivery:admin:users']

/**
 * Helper to create test entities required for deal creation
 */
async function createTestEntities(
  t: TestContext,
  orgId: Id<'organizations'>,
  ownerId: Id<'users'>
) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert('companies', {
      organizationId: orgId,
      name: 'Test Company Inc',
      billingAddress: {
        street: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'USA',
      },
      paymentTerms: 30,
    })

    const contactId = await ctx.db.insert('contacts', {
      organizationId: orgId,
      companyId,
      name: 'John Doe',
      email: 'john@test.com',
      phone: '+1-555-0123',
      isPrimary: true,
    })

    // Create deal
    const dealId = await ctx.db.insert('deals', {
      organizationId: orgId,
      companyId,
      contactId,
      name: 'Test Deal',
      value: 100000,
      stage: 'Lead',
      probability: 10,
      ownerId,
      createdAt: Date.now(),
    })

    // Create workflow (with required Tasquencer fields)
    const workflowId = await ctx.db.insert('tasquencerWorkflows', {
      name: 'dealToDelivery',
      path: ['dealToDelivery'],
      versionName: 'v1',
      executionMode: 'normal',
      realizedPath: ['dealToDelivery'],
      state: 'started',
    })

    // Create task for work item parent
    await ctx.db.insert('tasquencerTasks', {
      name: 'qualifyLead',
      path: ['dealToDelivery', 'qualifyLead'],
      versionName: 'v1',
      executionMode: 'normal',
      workflowId,
      realizedPath: ['dealToDelivery', 'qualifyLead'],
      state: 'enabled',
      generation: 1,
    })

    // Create work item
    const workItemId = await ctx.db.insert('tasquencerWorkItems', {
      name: 'qualifyLead',
      path: ['dealToDelivery', 'qualifyLead', 'qualifyLead'],
      versionName: 'v1',
      realizedPath: ['dealToDelivery', 'qualifyLead', 'qualifyLead'],
      state: 'initialized',
      parent: {
        workflowId,
        taskName: 'qualifyLead',
        taskGeneration: 1,
      },
    })

    // Create work item metadata
    const metadataId = await ctx.db.insert('dealToDeliveryWorkItems', {
      workItemId,
      workflowName: 'dealToDelivery',
      offer: {
        type: 'human' as const,
        requiredScope: 'dealToDelivery:deals:qualify',
      },
      aggregateTableId: dealId,
      payload: {
        type: 'qualifyLead' as const,
        taskName: 'Qualify Lead',
        priority: 'normal' as const,
      },
    })

    return { companyId, contactId, dealId, workItemId, metadataId }
  })
}

describe('Work Item API', () => {
  let t: TestContext
  let authResult: Awaited<ReturnType<typeof setupUserWithRole>>

  beforeEach(async () => {
    vi.useFakeTimers()
    t = setup()

    // Set up authenticated user with organization and required scopes
    authResult = await setupUserWithRole(t, 'staff-user', STAFF_SCOPES)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('releaseWorkItem', () => {
    it('user can release their own claimed work item', async () => {
      // Create test entities
      const { workItemId, metadataId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Claim the work item
      await t.run(async (ctx) => {
        await ctx.db.patch(metadataId, {
          claim: {
            type: 'human' as const,
            userId: authResult.userId as unknown as string,
            at: Date.now(),
          },
        })
      })

      // Verify the work item is claimed
      const metadata = await t.run(async (ctx) => {
        return await ctx.db.get(metadataId)
      })
      expect(metadata?.claim).toBeDefined()

      // Release the work item (should succeed)
      const result = await t.mutation(
        api.workflows.dealToDelivery.api.workItems.releaseWorkItem,
        { workItemId }
      )
      expect(result.success).toBe(true)

      // Verify it's no longer claimed
      const metadataAfter = await t.run(async (ctx) => {
        return await ctx.db.get(metadataId)
      })
      expect(metadataAfter?.claim).toBeUndefined()
    })

    it('non-admin cannot release other users claimed work items', async () => {
      // Create test entities
      const { workItemId, metadataId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Claim the work item by first user
      await t.run(async (ctx) => {
        await ctx.db.patch(metadataId, {
          claim: {
            type: 'human' as const,
            userId: authResult.userId as unknown as string,
            at: Date.now(),
          },
        })
      })

      // Create second user (non-admin)
      const secondUserId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          organizationId: authResult.organizationId,
          email: 'other@example.com',
          name: 'Other User',
          role: 'team_member',
          costRate: 10000,
          billRate: 15000,
          skills: [],
          department: 'Engineering',
          location: 'Remote',
          isActive: true,
        })
      })

      // Switch to second user (non-admin staff)
      const secondUserMock = {
        _id: 'test-auth-user-2' as any,
        _creationTime: Date.now(),
        name: 'Other User',
        email: 'other@example.com',
        emailVerified: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId: secondUserId as unknown as string,
      }
      vi.spyOn(authComponent, 'safeGetAuthUser').mockResolvedValue(secondUserMock)
      vi.spyOn(authComponent, 'getAuthUser').mockResolvedValue(secondUserMock)

      // Give second user staff permissions but not admin
      const staffRole2 = await createTestAuthRole(t, 'psa_staff_2', STAFF_SCOPES)
      await assignRoleToUser(t, secondUserId as unknown as string, staffRole2)

      // Second user tries to release first user's claimed work item (should fail)
      await expect(
        t.mutation(api.workflows.dealToDelivery.api.workItems.releaseWorkItem, {
          workItemId,
        })
      ).rejects.toThrow(
        'You can only release work items you have claimed (unless you are an admin)'
      )
    })

    it('admin can release other users claimed work items', async () => {
      // Create test entities
      const { workItemId, metadataId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Claim the work item by first user
      await t.run(async (ctx) => {
        await ctx.db.patch(metadataId, {
          claim: {
            type: 'human' as const,
            userId: authResult.userId as unknown as string,
            at: Date.now(),
          },
        })
      })

      // Verify it's claimed
      const metadataBefore = await t.run(async (ctx) => {
        return await ctx.db.get(metadataId)
      })
      expect(metadataBefore?.claim).toBeDefined()

      // Create admin user
      const adminUserId = await t.run(async (ctx) => {
        return await ctx.db.insert('users', {
          organizationId: authResult.organizationId,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
          costRate: 10000,
          billRate: 15000,
          skills: [],
          department: 'Management',
          location: 'HQ',
          isActive: true,
        })
      })

      // Switch to admin user
      const adminUserMock = {
        _id: 'test-auth-user-admin' as any,
        _creationTime: Date.now(),
        name: 'Admin User',
        email: 'admin@example.com',
        emailVerified: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId: adminUserId as unknown as string,
      }
      vi.spyOn(authComponent, 'safeGetAuthUser').mockResolvedValue(adminUserMock)
      vi.spyOn(authComponent, 'getAuthUser').mockResolvedValue(adminUserMock)

      // Give admin user admin permissions
      const adminRole = await createTestAuthRole(t, 'psa_admin', ADMIN_SCOPES)
      await assignRoleToUser(t, adminUserId as unknown as string, adminRole)

      // Admin releases first user's claimed work item (should succeed)
      const result = await t.mutation(
        api.workflows.dealToDelivery.api.workItems.releaseWorkItem,
        { workItemId }
      )
      expect(result.success).toBe(true)

      // Verify it's no longer claimed
      const metadataAfter = await t.run(async (ctx) => {
        return await ctx.db.get(metadataId)
      })
      expect(metadataAfter?.claim).toBeUndefined()
    })

    it('cannot release a work item that is not claimed', async () => {
      // Create test entities (without claim)
      const { workItemId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Try to release without claim (should fail)
      await expect(
        t.mutation(api.workflows.dealToDelivery.api.workItems.releaseWorkItem, {
          workItemId,
        })
      ).rejects.toThrow('Work item is not claimed')
    })
  })
})
