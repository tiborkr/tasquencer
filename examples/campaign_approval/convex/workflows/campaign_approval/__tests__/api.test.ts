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

      const campaigns = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const campaignId = campaigns[0]._id

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

      const campaigns = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const campaignId = campaigns[0]._id

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

      const campaigns = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const campaignId = campaigns[0]._id

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

      const campaigns = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      const workflowId = campaigns[0].workflowId

      // Cancel the campaign workflow using the custom mutation
      const cancelMutation = api.workflows.campaign_approval.api.cancelCampaignWorkflow as any
      await t.mutation(cancelMutation, {
        workflowId,
        reason: 'Testing cancellation',
      })
      await waitForFlush(t)

      // Verify campaign status is cancelled
      const updatedCampaigns = await t.query(api.workflows.campaign_approval.api.getCampaigns, {})
      expect(updatedCampaigns[0].status).toBe('cancelled')
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
