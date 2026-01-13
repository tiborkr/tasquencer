/**
 * Integration tests for campaign_approval workflow
 *
 * Test Coverage:
 * - Happy path: initialize, submit request, intake review, assign owner
 * - Work item lifecycle
 * - Authorization
 * - Work queue
 * - XOR routing based on intake review decision
 */

import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'
import { api } from '../../../_generated/api'
import {
  setupCampaignApprovalAuthorization,
  setupAuthenticatedCampaignUser,
  setupUnauthenticatedUser,
  waitForFlush,
  setup,
} from '../../../__tests__/helpers.test'

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
    proposedStartDate: now + 7 * 24 * 60 * 60 * 1000, // 7 days from now
    proposedEndDate: now + 30 * 24 * 60 * 60 * 1000, // 30 days from now
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

describe('Campaign Approval Workflow', () => {
  describe('Phase 1: Initiation - Happy Path', () => {
    it('completes Phase 1 workflow from submit request through intake approval to owner assignment', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow with campaign data
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })

      await waitForFlush(t)

      // Get the campaign to find the workflow ID
      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaigns.length).toBe(1)
      expect(campaigns[0].name).toBe('Test Campaign')
      expect(campaigns[0].objective).toBe('Test objective for campaign')
      expect(campaigns[0].status).toBe('draft')

      const workflowId = campaigns[0].workflowId

      // Verify the submitRequest task is enabled via task states
      const taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.submitRequest).toBe('enabled')
      expect(taskStates.intakeReview).toBe('disabled')
      expect(taskStates.assignOwner).toBe('disabled')

      // Get the work item from the work queue
      const workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('submitRequest')

      const submitRequestWorkItemId = workQueue[0].workItemId

      // Start and complete the submitRequest work item
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: submitRequestWorkItemId,
        args: { name: 'submitRequest' },
      })

      await waitForFlush(t)

      // Verify submitRequest is started
      const startedTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(startedTaskStates.submitRequest).toBe('started')

      // Complete submitRequest - confirming the campaign submission
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: submitRequestWorkItemId,
        args: {
          name: 'submitRequest',
          payload: { confirmed: true },
        },
      })

      await waitForFlush(t)

      // Verify submitRequest completed and intakeReview is now enabled
      const afterSubmitTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(afterSubmitTaskStates.submitRequest).toBe('completed')
      expect(afterSubmitTaskStates.intakeReview).toBe('enabled')

      // Verify campaign status changed to intake_review
      const campaignsAfterSubmit = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaignsAfterSubmit[0].status).toBe('intake_review')

      // Get intakeReview work item
      const intakeWorkQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(intakeWorkQueue.length).toBe(1)
      expect(intakeWorkQueue[0].taskType).toBe('intakeReview')

      const intakeReviewWorkItemId = intakeWorkQueue[0].workItemId

      // Start and complete intakeReview with 'approved' decision
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: intakeReviewWorkItemId,
        args: { name: 'intakeReview' },
      })

      await waitForFlush(t)

      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: intakeReviewWorkItemId,
        args: {
          name: 'intakeReview',
          payload: { decision: 'approved', reviewNotes: 'Looks good!' },
        },
      })

      await waitForFlush(t)

      // Verify intakeReview completed and assignOwner is enabled (approved path)
      const afterIntakeTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(afterIntakeTaskStates.intakeReview).toBe('completed')
      expect(afterIntakeTaskStates.assignOwner).toBe('enabled')

      // Get assignOwner work item
      const assignWorkQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(assignWorkQueue.length).toBe(1)
      expect(assignWorkQueue[0].taskType).toBe('assignOwner')

      const assignOwnerWorkItemId = assignWorkQueue[0].workItemId

      // Start and complete assignOwner
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: assignOwnerWorkItemId,
        args: { name: 'assignOwner' },
      })

      await waitForFlush(t)

      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: assignOwnerWorkItemId,
        args: {
          name: 'assignOwner',
          payload: { ownerId: userId },
        },
      })

      await waitForFlush(t)

      // Verify Phase 1 completed - campaign should have owner and strategy status
      const finalCampaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaigns[0].ownerId).toBe(userId)
      expect(finalCampaigns[0].status).toBe('strategy')

      // Verify workflow reached end (for now - Phase 2 not implemented)
      const finalTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(finalTaskStates.assignOwner).toBe('completed')
    })
  })

  describe('Work Queue', () => {
    it('returns work items for authorized user', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })

      await waitForFlush(t)

      // Check work queue
      const workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('submitRequest')
      expect(workQueue[0].status).toBe('pending')
    })

    it('rejects work queue access for unauthorized user', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)

      // First create a workflow as an authenticated user
      const { authSpies, userId } = await setupAuthenticatedCampaignUser(t)
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      // Restore mock
      authSpies.forEach((spy) => spy.mockRestore())

      // Now check work queue as unauthorized user (no scopes)
      await setupUnauthenticatedUser(t)

      // User without proper scopes should be denied access
      await expect(
        t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {}),
      ).rejects.toThrow('does not have scope campaign:read')
    })
  })

  describe('Claim Work Item', () => {
    it('allows authorized user to claim work item', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })

      await waitForFlush(t)

      // Get the work queue
      const workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].status).toBe('pending')
      const workItemId = workQueue[0].workItemId

      // Claim the work item - should succeed without error
      await t.mutation(api.workflows.campaign_approval.api.claimCampaignWorkItem, {
        workItemId,
      })

      // After claiming, available work queue is empty (claimed items are not "available")
      const updatedWorkQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(updatedWorkQueue.length).toBe(0)

      // But the work item metadata should show the claim
      const metadata = await t.run(async (ctx) => {
        return await ctx.db
          .query('campaignWorkItems')
          .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
          .unique()
      })

      expect(metadata).not.toBeNull()
      expect(metadata?.claim).toBeDefined()
    })
  })

  describe('Get Campaign', () => {
    it('returns campaign by workflow ID', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })

      await waitForFlush(t)

      // Get the campaign
      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )

      const campaign = await t.query(api.workflows.campaign_approval.api.getCampaign, {
        workflowId: campaigns[0].workflowId,
      })

      expect(campaign).not.toBeNull()
      expect(campaign?.workflowId).toBe(campaigns[0].workflowId)
      expect(campaign?.name).toBe('Test Campaign')
      expect(campaign?.estimatedBudget).toBe(10000)
    })
  })
})
