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

  /**
   * TENET-ROUTING-DETERMINISM Tests
   *
   * These tests verify that getWorkItemByDealAndType and getWorkItemByProjectAndType
   * select the most recently created work item when multiple of the same type exist.
   * This is critical for looped workflows to avoid routing to stale work items.
   */
  describe('TENET-ROUTING-DETERMINISM: getWorkItemByDealAndType', () => {
    it('selects the most recent work item when multiple of same type exist', async () => {
      // Create base test entities
      const { dealId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Create workflow
      const workflowId = await t.run(async (ctx) => {
        return await ctx.db.insert('tasquencerWorkflows', {
          name: 'dealToDelivery',
          path: ['dealToDelivery'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['dealToDelivery'],
          state: 'started',
        })
      })

      // Create task for work items
      await t.run(async (ctx) => {
        return await ctx.db.insert('tasquencerTasks', {
          name: 'reviseProposal',
          path: ['dealToDelivery', 'reviseProposal'],
          versionName: 'v1',
          executionMode: 'normal',
          workflowId,
          realizedPath: ['dealToDelivery', 'reviseProposal'],
          state: 'enabled',
          generation: 1,
        })
      })

      // Create three work items of the same type with different creation times
      // This simulates a looped workflow where reviseProposal runs multiple times
      const workItemIds: Id<'tasquencerWorkItems'>[] = []

      for (let i = 0; i < 3; i++) {
        // Advance time to ensure different _creationTime
        vi.advanceTimersByTime(1000)

        const workItemId = await t.run(async (ctx) => {
          return await ctx.db.insert('tasquencerWorkItems', {
            name: 'reviseProposal',
            path: ['dealToDelivery', 'reviseProposal', 'reviseProposal'],
            versionName: 'v1',
            realizedPath: ['dealToDelivery', 'reviseProposal', 'reviseProposal'],
            state: 'initialized',
            parent: {
              workflowId,
              taskName: 'reviseProposal',
              taskGeneration: i + 1, // Different generations
            },
          })
        })
        workItemIds.push(workItemId)

        await t.run(async (ctx) => {
          return await ctx.db.insert('dealToDeliveryWorkItems', {
            workItemId,
            workflowName: 'dealToDelivery',
            offer: {
              type: 'human' as const,
              requiredScope: 'dealToDelivery:deals:update',
            },
            aggregateTableId: dealId,
            payload: {
              type: 'reviseProposal' as const,
              taskName: `Revise Proposal (iteration ${i + 1})`,
              priority: 'normal' as const,
            },
          })
        })
      }

      // The third work item should be the most recent (latest _creationTime)
      const mostRecentWorkItemId = workItemIds[2]

      // Query for the work item by deal and type
      const result = await t.query(
        api.workflows.dealToDelivery.api.workItems.getWorkItemByDealAndType,
        { dealId, taskType: 'reviseProposal' }
      )

      // Should return the most recently created work item
      expect(result).not.toBeNull()
      expect(result!.workItemId).toBe(mostRecentWorkItemId)
    })

    it('returns null when no matching work items exist', async () => {
      // Create base test entities (has qualifyLead, not reviseProposal)
      const { dealId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      const result = await t.query(
        api.workflows.dealToDelivery.api.workItems.getWorkItemByDealAndType,
        { dealId, taskType: 'reviseProposal' }
      )

      expect(result).toBeNull()
    })
  })

  describe('TENET-ROUTING-DETERMINISM: getWorkItemByProjectAndType', () => {
    it('selects the most recent work item when multiple of same type exist', async () => {
      // Create base test entities including a project
      const { dealId, companyId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Create project linked to the deal
      const projectId = await t.run(async (ctx) => {
        return await ctx.db.insert('projects', {
          organizationId: authResult.organizationId,
          companyId,
          dealId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          createdAt: Date.now(),
          managerId: authResult.userId,
        })
      })

      // Create workflow
      const workflowId = await t.run(async (ctx) => {
        return await ctx.db.insert('tasquencerWorkflows', {
          name: 'dealToDelivery',
          path: ['dealToDelivery'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['dealToDelivery'],
          state: 'started',
        })
      })

      // Create task for work items
      await t.run(async (ctx) => {
        return await ctx.db.insert('tasquencerTasks', {
          name: 'setBudget',
          path: ['dealToDelivery', 'setBudget'],
          versionName: 'v1',
          executionMode: 'normal',
          workflowId,
          realizedPath: ['dealToDelivery', 'setBudget'],
          state: 'enabled',
          generation: 1,
        })
      })

      // Create three work items of the same type with different creation times
      // This simulates a looped workflow where setBudget might run multiple times
      const workItemIds: Id<'tasquencerWorkItems'>[] = []

      for (let i = 0; i < 3; i++) {
        // Advance time to ensure different _creationTime
        vi.advanceTimersByTime(1000)

        const workItemId = await t.run(async (ctx) => {
          return await ctx.db.insert('tasquencerWorkItems', {
            name: 'setBudget',
            path: ['dealToDelivery', 'setBudget', 'setBudget'],
            versionName: 'v1',
            realizedPath: ['dealToDelivery', 'setBudget', 'setBudget'],
            state: 'initialized',
            parent: {
              workflowId,
              taskName: 'setBudget',
              taskGeneration: i + 1,
            },
          })
        })
        workItemIds.push(workItemId)

        await t.run(async (ctx) => {
          return await ctx.db.insert('dealToDeliveryWorkItems', {
            workItemId,
            workflowName: 'dealToDelivery',
            offer: {
              type: 'human' as const,
              requiredScope: 'dealToDelivery:projects:budget',
            },
            aggregateTableId: dealId, // Work items are keyed by deal
            payload: {
              type: 'setBudget' as const,
              taskName: `Set Budget (iteration ${i + 1})`,
              priority: 'normal' as const,
            },
          })
        })
      }

      // The third work item should be the most recent (latest _creationTime)
      const mostRecentWorkItemId = workItemIds[2]

      // Query for the work item by project and type
      const result = await t.query(
        api.workflows.dealToDelivery.api.workItems.getWorkItemByProjectAndType,
        { projectId, taskType: 'setBudget' }
      )

      // Should return the most recently created work item
      expect(result).not.toBeNull()
      expect(result!.workItemId).toBe(mostRecentWorkItemId)
    })

    it('returns null for project without deal', async () => {
      // Create company for orphan project
      const { companyId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Create project without a dealId
      const projectId = await t.run(async (ctx) => {
        return await ctx.db.insert('projects', {
          organizationId: authResult.organizationId,
          companyId,
          name: 'Orphan Project',
          status: 'Active',
          startDate: Date.now(),
          createdAt: Date.now(),
          managerId: authResult.userId,
        })
      })

      const result = await t.query(
        api.workflows.dealToDelivery.api.workItems.getWorkItemByProjectAndType,
        { projectId, taskType: 'setBudget' }
      )

      expect(result).toBeNull()
    })

    it('returns null when no matching work items exist', async () => {
      // Create entities with a different work item type
      const { dealId, companyId } = await createTestEntities(
        t,
        authResult.organizationId,
        authResult.userId
      )

      // Create project linked to the deal
      const projectId = await t.run(async (ctx) => {
        return await ctx.db.insert('projects', {
          organizationId: authResult.organizationId,
          companyId,
          dealId,
          name: 'Test Project',
          status: 'Active',
          startDate: Date.now(),
          createdAt: Date.now(),
          managerId: authResult.userId,
        })
      })

      const result = await t.query(
        api.workflows.dealToDelivery.api.workItems.getWorkItemByProjectAndType,
        { projectId, taskType: 'closeProject' }
      )

      expect(result).toBeNull()
    })
  })
})
