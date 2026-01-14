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

  // ============================================================================
  // New API Endpoints (Priority 3)
  // ============================================================================

  describe('getCampaignTimeline', () => {
    it('returns empty milestones array for campaign without milestones', async () => {
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

      // Get timeline
      const timeline = await t.query(api.workflows.campaign_approval.api.getCampaignTimeline, {
        campaignId,
      })

      expect(timeline).not.toBeNull()
      expect(timeline.campaignId).toBe(campaignId)
      expect(timeline.milestones).toEqual([])
    })

    it('returns milestones sorted by target date', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign with milestones directly
      const { campaignId } = await t.run(async (ctx) => {
        const workflowId = await ctx.db.insert('tasquencerWorkflows', {
          name: 'campaign_approval',
          path: ['campaign_approval'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['campaign_approval'],
          state: 'initialized',
        })

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

        // Create milestones with different target dates
        await ctx.db.insert('campaignTimeline', {
          campaignId,
          milestoneName: 'Milestone 2',
          targetDate: now + 14 * 24 * 60 * 60 * 1000, // Later date
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })

        await ctx.db.insert('campaignTimeline', {
          campaignId,
          milestoneName: 'Milestone 1',
          targetDate: now + 7 * 24 * 60 * 60 * 1000, // Earlier date
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })

        return { campaignId }
      })

      const timeline = await t.query(api.workflows.campaign_approval.api.getCampaignTimeline, {
        campaignId,
      })

      expect(timeline.milestones.length).toBe(2)
      expect(timeline.milestones[0].name).toBe('Milestone 1')
      expect(timeline.milestones[1].name).toBe('Milestone 2')
    })

    it('throws error for non-existent campaign', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create a dummy campaign ID by inserting and deleting
      const { deletedCampaignId } = await t.run(async (ctx) => {
        const workflowId = await ctx.db.insert('tasquencerWorkflows', {
          name: 'campaign_approval',
          path: ['campaign_approval'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['campaign_approval'],
          state: 'initialized',
        })

        const now = Date.now()
        const campaignId = await ctx.db.insert('campaigns', {
          workflowId,
          name: 'Temp',
          objective: 'Temp',
          targetAudience: 'Temp',
          keyMessages: ['Temp'],
          channels: ['email'],
          proposedStartDate: now,
          proposedEndDate: now,
          estimatedBudget: 1000,
          requesterId: userId as any,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        })

        await ctx.db.delete(campaignId)
        return { deletedCampaignId: campaignId }
      })

      await expect(
        t.query(api.workflows.campaign_approval.api.getCampaignTimeline, {
          campaignId: deletedCampaignId,
        }),
      ).rejects.toThrow('CAMPAIGN_NOT_FOUND')
    })
  })

  describe('getCampaignActivity', () => {
    it('returns empty activities array for campaign without approvals', async () => {
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

      // Get activity
      const activity = await t.query(api.workflows.campaign_approval.api.getCampaignActivity, {
        campaignId,
      })

      expect(activity).not.toBeNull()
      expect(activity.campaignId).toBe(campaignId)
      expect(activity.activities).toEqual([])
    })

    it('returns approvals for campaign', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign with approval directly
      const { campaignId } = await t.run(async (ctx) => {
        const workflowId = await ctx.db.insert('tasquencerWorkflows', {
          name: 'campaign_approval',
          path: ['campaign_approval'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['campaign_approval'],
          state: 'initialized',
        })

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

        // Create approval record
        await ctx.db.insert('campaignApprovals', {
          campaignId,
          approvalType: 'intake',
          decision: 'approved',
          approvedBy: userId as any,
          comments: 'Test approval',
          createdAt: now,
        })

        return { campaignId }
      })

      const activity = await t.query(api.workflows.campaign_approval.api.getCampaignActivity, {
        campaignId,
      })

      expect(activity.activities.length).toBe(1)
      expect(activity.activities[0].approvalType).toBe('intake')
      expect(activity.activities[0].decision).toBe('approved')
      expect(activity.activities[0].comments).toBe('Test approval')
    })

    it('filters activity by approvalType', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign with multiple approvals
      const { campaignId } = await t.run(async (ctx) => {
        const workflowId = await ctx.db.insert('tasquencerWorkflows', {
          name: 'campaign_approval',
          path: ['campaign_approval'],
          versionName: 'v1',
          executionMode: 'normal',
          realizedPath: ['campaign_approval'],
          state: 'initialized',
        })

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

        // Create intake approval
        await ctx.db.insert('campaignApprovals', {
          campaignId,
          approvalType: 'intake',
          decision: 'approved',
          approvedBy: userId as any,
          createdAt: now,
        })

        // Create budget approval
        await ctx.db.insert('campaignApprovals', {
          campaignId,
          approvalType: 'budget',
          decision: 'approved',
          approvedBy: userId as any,
          createdAt: now + 1000,
        })

        return { campaignId }
      })

      // Filter by intake type
      const intakeActivity = await t.query(api.workflows.campaign_approval.api.getCampaignActivity, {
        campaignId,
        approvalType: 'intake',
      })

      expect(intakeActivity.activities.length).toBe(1)
      expect(intakeActivity.activities[0].approvalType).toBe('intake')

      // Get all activities
      const allActivity = await t.query(api.workflows.campaign_approval.api.getCampaignActivity, {
        campaignId,
      })

      expect(allActivity.activities.length).toBe(2)
    })
  })

  describe('releaseWorkItem', () => {
    it('exports releaseWorkItem mutation', async () => {
      expect(api.workflows.campaign_approval.api.releaseWorkItem).toBeDefined()
    })

    it('releases a claimed work item back to the queue', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create campaign
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Get work item from queue
      const workQueue = await t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {})
      expect(workQueue.length).toBe(1)
      const workItemId = workQueue[0].workItemId

      // Claim the work item
      const claimMutation = api.workflows.campaign_approval.api.claimCampaignWorkItem as any
      await t.mutation(claimMutation, { workItemId })

      // Verify it's claimed
      const workItemAfterClaim = await t.query(api.workflows.campaign_approval.api.getWorkItem, {
        workItemId,
      })
      expect(workItemAfterClaim!.status).toBe('claimed')

      // Release the work item
      const releaseMutation = api.workflows.campaign_approval.api.releaseWorkItem as any
      const result = await t.mutation(releaseMutation, { workItemId })

      expect(result.workItemId).toBe(workItemId)
      expect(result.status).toBe('pending')

      // Verify it's pending again
      const workItemAfterRelease = await t.query(api.workflows.campaign_approval.api.getWorkItem, {
        workItemId,
      })
      expect(workItemAfterRelease!.status).toBe('pending')
    })
  })

  describe('getCurrentUser', () => {
    it('exports getCurrentUser query', async () => {
      expect(api.workflows.campaign_approval.api.getCurrentUser).toBeDefined()
    })

    it('returns null for unauthenticated user', async () => {
      const t = setup()

      const user = await t.query(api.workflows.campaign_approval.api.getCurrentUser, {})

      expect(user).toBeNull()
    })

    it('returns user data for authenticated user', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      const user = await t.query(api.workflows.campaign_approval.api.getCurrentUser, {})

      expect(user).not.toBeNull()
      expect(user!._id).toBe(userId)
    })
  })

  describe('listUsers', () => {
    it('exports listUsers query', async () => {
      expect(api.workflows.campaign_approval.api.listUsers).toBeDefined()
    })

    it('returns list of users', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      await setupAuthenticatedCampaignUser(t)

      const users = await t.query(api.workflows.campaign_approval.api.listUsers, {})

      expect(Array.isArray(users)).toBe(true)
      expect(users.length).toBeGreaterThan(0)
      expect(users[0]).toHaveProperty('_id')
    })
  })

  describe('getNotifications', () => {
    it('exports getNotifications query', async () => {
      expect(api.workflows.campaign_approval.api.getNotifications).toBeDefined()
    })

    it('returns empty array for user with no notifications', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      await setupAuthenticatedCampaignUser(t)

      const notifications = await t.query(api.workflows.campaign_approval.api.getNotifications, {})

      expect(Array.isArray(notifications)).toBe(true)
      expect(notifications.length).toBe(0)
    })

    it('returns notifications for authenticated user', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create notification directly
      await t.run(async (ctx) => {
        await ctx.db.insert('campaignNotifications', {
          userId: userId as any,
          type: 'work_item_assigned',
          title: 'New Task',
          message: 'You have been assigned a new task',
          read: false,
          createdAt: Date.now(),
        })
      })

      const notifications = await t.query(api.workflows.campaign_approval.api.getNotifications, {})

      expect(notifications.length).toBe(1)
      expect(notifications[0].type).toBe('work_item_assigned')
      expect(notifications[0].title).toBe('New Task')
      expect(notifications[0].read).toBe(false)
    })

    it('filters to unread notifications when unreadOnly is true', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create read and unread notifications
      await t.run(async (ctx) => {
        await ctx.db.insert('campaignNotifications', {
          userId: userId as any,
          type: 'work_item_assigned',
          title: 'Read Notification',
          message: 'This has been read',
          read: true,
          createdAt: Date.now(),
        })

        await ctx.db.insert('campaignNotifications', {
          userId: userId as any,
          type: 'approval_required',
          title: 'Unread Notification',
          message: 'This has not been read',
          read: false,
          createdAt: Date.now() + 1000,
        })
      })

      const unreadOnly = await t.query(api.workflows.campaign_approval.api.getNotifications, {
        unreadOnly: true,
      })
      expect(unreadOnly.length).toBe(1)
      expect(unreadOnly[0].title).toBe('Unread Notification')

      const all = await t.query(api.workflows.campaign_approval.api.getNotifications, {})
      expect(all.length).toBe(2)
    })
  })

  describe('markNotificationRead', () => {
    it('exports markNotificationRead mutation', async () => {
      expect(api.workflows.campaign_approval.api.markNotificationRead).toBeDefined()
    })

    it('marks notification as read', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create notification
      const { notificationId } = await t.run(async (ctx) => {
        const notificationId = await ctx.db.insert('campaignNotifications', {
          userId: userId as any,
          type: 'work_item_assigned',
          title: 'Test Notification',
          message: 'Test message',
          read: false,
          createdAt: Date.now(),
        })
        return { notificationId }
      })

      // Mark as read
      const markReadMutation = api.workflows.campaign_approval.api.markNotificationRead as any
      const result = await t.mutation(markReadMutation, { notificationId })

      expect(result.success).toBe(true)

      // Verify it's read
      const notification = await t.run(async (ctx) => {
        return await ctx.db.get(notificationId)
      })
      expect(notification?.read).toBe(true)
    })

    it('throws error for non-existent notification', async () => {
      const t = setup()
      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Create and delete notification to get valid but non-existent ID
      const { deletedId } = await t.run(async (ctx) => {
        const notificationId = await ctx.db.insert('campaignNotifications', {
          userId: userId as any,
          type: 'work_item_assigned',
          title: 'Temp',
          message: 'Temp',
          read: false,
          createdAt: Date.now(),
        })
        await ctx.db.delete(notificationId)
        return { deletedId: notificationId }
      })

      const markReadMutation = api.workflows.campaign_approval.api.markNotificationRead as any
      await expect(
        t.mutation(markReadMutation, { notificationId: deletedId }),
      ).rejects.toThrow('NOTIFICATION_NOT_FOUND')
    })
  })
})
