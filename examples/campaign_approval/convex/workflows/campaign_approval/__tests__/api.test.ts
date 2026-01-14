/**
 * API endpoint tests for campaign_approval workflow
 *
 * Tests the query and mutation endpoints in api.ts:
 * - getCampaignWithDetails - Get campaign with related data
 * - getMyCampaigns - Get campaigns for current user
 * - getCampaignBudget - Get budget for a campaign
 * - getCampaignCreatives - Get creatives for a campaign
 * - getWorkItem - Get work item with full context
 * - cancelCampaignWorkflow - Cancel a workflow
 *
 * Note: failWorkItem, cancelWorkItem, and cancelRootWorkflow are exported from
 * the version manager and tested via workflow tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '../../../_generated/api'
import {
  setupCampaignApprovalAuthorization,
  setupAuthenticatedCampaignUser,
  waitForFlush,
  setup,
} from '../../../__tests__/helpers.test'

// Note: With 25+ workflow elements (tasks + conditions), TypeScript type inference
// hits depth limits (TS2589). Using type cast to break the inference chain.
const initializeRootWorkflowMutation = api.workflows.campaign_approval.api.initializeRootWorkflow as any

/**
 * Helper to create a valid campaign request payload for testing
 */
function createTestCampaignPayload(userId: string, overrides?: Record<string, unknown>) {
  const now = Date.now()
  return {
    name: 'Test Campaign',
    objective: 'Test objective for campaign',
    targetAudience: 'Test audience',
    keyMessages: ['Message 1', 'Message 2'],
    channels: ['email', 'social'] as ('email' | 'paid_ads' | 'social' | 'events' | 'content')[],
    proposedStartDate: now + 7 * 24 * 60 * 60 * 1000,
    proposedEndDate: now + 30 * 24 * 60 * 60 * 1000,
    estimatedBudget: 10000,
    requesterId: userId,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Campaign Approval API Endpoints', () => {
  describe('getCampaignWithDetails', () => {
    it('returns campaign with related data and workflow task states', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize and submit campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const campaignId = campaignsResult.campaigns[0]._id

      // Get campaign with details
      const result = await t.query(api.workflows.campaign_approval.api.getCampaignWithDetails, {
        campaignId,
      })

      expect(result).not.toBeNull()
      expect(result!.campaign).not.toBeNull()
      expect(result!.campaign.name).toBe('Test Campaign')
      expect(result!.workflowTaskStates).toBeDefined()
      expect(result!.workflowTaskStates.submitRequest).toBe('enabled')
      // Budget and KPIs will be null initially
      expect(result!.budget).toBeNull()
      expect(result!.kpis).toEqual([])
    })
  })

  describe('getMyCampaigns', () => {
    it('returns campaigns owned by or requested by current user', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create a campaign as requester
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Get my campaigns
      const myCampaigns = await t.query(api.workflows.campaign_approval.api.getMyCampaigns, {})

      expect(myCampaigns.length).toBe(1)
      expect(myCampaigns[0].name).toBe('Test Campaign')
      expect(myCampaigns[0].requesterId).toBe(userId)
    })

    it('returns empty array for user with no campaigns', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      await setupAuthenticatedCampaignUser(t)

      // Don't create any campaigns
      const myCampaigns = await t.query(api.workflows.campaign_approval.api.getMyCampaigns, {})

      expect(myCampaigns).toEqual([])
    })
  })

  describe('getCampaignBudget', () => {
    it('returns null when no budget exists for campaign', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const campaignId = campaignsResult.campaigns[0]._id

      // Budget hasn't been created yet
      const budget = await t.query(api.workflows.campaign_approval.api.getCampaignBudget, {
        campaignId,
      })

      expect(budget).toBeNull()
    })
  })

  describe('getCampaignCreatives', () => {
    it('returns empty array when no creatives exist for campaign', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const campaignId = campaignsResult.campaigns[0]._id

      // No creatives exist yet
      const creatives = await t.query(api.workflows.campaign_approval.api.getCampaignCreatives, {
        campaignId,
      })

      expect(creatives).toEqual([])
    })
  })

  describe('getWorkItem', () => {
    it('returns work item with full context including campaign data', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create and initialize campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Get the work item from the queue
      const workQueue = await t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {})
      expect(workQueue.length).toBe(1)
      const workItemId = workQueue[0].workItemId

      // Get full work item details
      const workItem = await t.query(api.workflows.campaign_approval.api.getWorkItem, {
        workItemId,
      })

      expect(workItem).not.toBeNull()
      expect(workItem!.workItem._id).toBe(workItemId)
      expect(workItem!.metadata.taskType).toBe('submitRequest')
      expect(workItem!.campaign).not.toBeNull()
      expect(workItem!.campaign!.name).toBe('Test Campaign')
      expect(workItem!.status).toBe('pending')
    })
  })

  describe('cancelCampaignWorkflow', () => {
    it('cancels workflow and updates campaign status to cancelled', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Cancel the campaign workflow using the custom mutation
      const cancelMutation = api.workflows.campaign_approval.api.cancelCampaignWorkflow as any
      await t.mutation(cancelMutation, {
        workflowId,
        reason: 'Testing cancellation',
      })
      await waitForFlush(t)

      // Verify campaign status is cancelled
      const updatedCampaignsResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      expect(updatedCampaignsResult.campaigns[0].status).toBe('cancelled')
    })
  })

  describe('uploadCreativeAsset', () => {
    it('exports uploadCreativeAsset mutation', async () => {
      // Verify the export exists
      expect(api.workflows.campaign_approval.api.uploadCreativeAsset).toBeDefined()
    })

    it('updates creative with storage reference', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create a campaign and creative via direct DB access
      const { creativeId, storageId } = await t.run(async (ctx) => {
        // Create workflow
        const workflowId = await ctx.db.insert('tasquencerWorkflows', {
          name: 'campaign_approval',
          path: ['campaign_approval'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['campaign_approval'],
          state: 'initialized',
        })

        // Create campaign
        const now = Date.now()
        const campaignId = await ctx.db.insert('campaigns', {
          workflowId,
          name: 'Test Campaign',
          objective: 'Test objective',
          targetAudience: 'Test audience',
          keyMessages: ['Message 1'],
          channels: ['email'],
          proposedStartDate: now + 7 * 24 * 60 * 60 * 1000,
          proposedEndDate: now + 30 * 24 * 60 * 60 * 1000,
          estimatedBudget: 10000,
          requesterId: userId as any,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        })

        // Create creative
        const creativeId = await ctx.db.insert('campaignCreatives', {
          campaignId,
          workflowId,
          assetType: 'ad',
          name: 'Test Creative',
          description: 'Test creative description',
          version: 1,
          createdBy: userId as any,
          createdAt: now,
          updatedAt: now,
        })

        // Create a mock storage entry (convex-test allows this)
        const storageId = await ctx.storage.store(new Blob(['test content']))

        return { creativeId, storageId }
      })

      // Call the uploadCreativeAsset mutation
      const uploadMutation = api.workflows.campaign_approval.api.uploadCreativeAsset as any
      const result = await t.mutation(uploadMutation, {
        creativeId,
        storageId,
      })

      expect(result).toEqual({ success: true })

      // Verify the creative was updated with the storage ID
      const updatedCreative = await t.run(async (ctx) => {
        return await ctx.db.get(creativeId)
      })

      expect(updatedCreative?.storageId).toBe(storageId)
    })

    it('throws error when creative does not exist', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create necessary entities and then delete the creative to get a valid but non-existent ID
      const { deletedCreativeId, storageId } = await t.run(async (ctx) => {
        // Create workflow
        const workflowId = await ctx.db.insert('tasquencerWorkflows', {
          name: 'campaign_approval',
          path: ['campaign_approval'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['campaign_approval'],
          state: 'initialized',
        })

        // Create campaign
        const now = Date.now()
        const campaignId = await ctx.db.insert('campaigns', {
          workflowId,
          name: 'Test Campaign',
          objective: 'Test objective',
          targetAudience: 'Test audience',
          keyMessages: ['Message 1'],
          channels: ['email'],
          proposedStartDate: now + 7 * 24 * 60 * 60 * 1000,
          proposedEndDate: now + 30 * 24 * 60 * 60 * 1000,
          estimatedBudget: 10000,
          requesterId: userId as any,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        })

        // Create creative and then delete it
        const creativeId = await ctx.db.insert('campaignCreatives', {
          campaignId,
          workflowId,
          assetType: 'ad',
          name: 'Temp Creative',
          description: '',
          version: 1,
          createdBy: userId as any,
          createdAt: now,
          updatedAt: now,
        })
        await ctx.db.delete(creativeId)

        // Create a storage entry
        const storageId = await ctx.storage.store(new Blob(['test content']))

        return { deletedCreativeId: creativeId, storageId }
      })

      // Attempt to upload to non-existent creative
      const uploadMutation = api.workflows.campaign_approval.api.uploadCreativeAsset as any
      await expect(
        t.mutation(uploadMutation, {
          creativeId: deletedCreativeId,
          storageId,
        }),
      ).rejects.toThrow('CREATIVE_NOT_FOUND')
    })
  })

  describe('getCampaigns - Filter and Pagination', () => {
    it('returns paginated result structure', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const result = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})

      expect(result).toHaveProperty('campaigns')
      expect(result).toHaveProperty('nextCursor')
      expect(result).toHaveProperty('hasMore')
      expect(Array.isArray(result.campaigns)).toBe(true)
      expect(result.campaigns.length).toBe(1)
      expect(result.hasMore).toBe(false)
      expect(result.nextCursor).toBeNull()
    })

    it('filters campaigns by status', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign (starts in draft status)
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Filter by draft status should return the campaign
      const draftResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {
        status: 'draft',
      })
      expect(draftResult.campaigns.length).toBe(1)

      // Filter by completed status should return empty
      const completedResult = await t.query(api.workflows.campaign_approval.api.getCampaigns, {
        status: 'completed',
      })
      expect(completedResult.campaigns.length).toBe(0)
    })

    it('filters campaigns by requesterId', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Filter by requester should return the campaign
      const result = await t.query(api.workflows.campaign_approval.api.getCampaigns, {
        requesterId: userId as any,
      })
      expect(result.campaigns.length).toBe(1)
      expect(result.campaigns[0].requesterId).toBe(userId)
    })

    it('respects limit parameter', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create multiple campaigns
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { name: 'Campaign 1' }),
      })
      await waitForFlush(t)
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { name: 'Campaign 2' }),
      })
      await waitForFlush(t)
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { name: 'Campaign 3' }),
      })
      await waitForFlush(t)

      // Request with limit of 2
      const result = await t.query(api.workflows.campaign_approval.api.getCampaigns, {
        limit: 2,
      })

      expect(result.campaigns.length).toBe(2)
      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).not.toBeNull()
    })
  })

  describe('getCampaignWorkQueue - Filter Parameters', () => {
    it('filters work queue by phase', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign (submitRequest is in 'initiation' phase)
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Filter by initiation phase should return the submitRequest task
      const initiationResult = await t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {
        phase: 'initiation',
      })
      expect(initiationResult.length).toBe(1)
      expect(initiationResult[0].taskType).toBe('submitRequest')
      expect(initiationResult[0].phase).toBe('initiation')

      // Filter by strategy phase should return empty
      const strategyResult = await t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {
        phase: 'strategy',
      })
      expect(strategyResult.length).toBe(0)
    })

    it('includes phase field in work queue items', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const workQueue = await t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {})

      expect(workQueue.length).toBe(1)
      expect(workQueue[0]).toHaveProperty('phase')
      expect(workQueue[0].phase).toBe('initiation')
    })
  })

  describe('Version Manager API Exports', () => {
    it('exports failWorkItem from version manager', async () => {
      // Verify the export exists
      expect(api.workflows.campaign_approval.api.failWorkItem).toBeDefined()
    })

    it('exports cancelWorkItem from version manager', async () => {
      // Verify the export exists
      expect(api.workflows.campaign_approval.api.cancelWorkItem).toBeDefined()
    })

    it('exports cancelRootWorkflow from version manager', async () => {
      // Verify the export exists
      expect(api.workflows.campaign_approval.api.cancelRootWorkflow).toBeDefined()
    })
  })
})
