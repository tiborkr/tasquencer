/**
 * Integration tests for campaign_approval workflow
 *
 * Test Coverage:
 * - Happy path: initialize, start, complete workflow
 * - Work item lifecycle
 * - Authorization
 * - Work queue
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

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Campaign Approval Workflow', () => {
  describe('Happy Path', () => {
    it('completes full campaign workflow from initialize to completion', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the campaign to find the workflow ID
      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaigns.length).toBe(1)
      expect(campaigns[0].message).toBe('') // Initially empty

      const workflowId = campaigns[0].workflowId

      // Verify the storeCampaign task is enabled via task states
      const taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.storeCampaign).toBe('enabled')

      // Get the work item from the work queue
      const workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('storeCampaign')

      const workItemId = workQueue[0].workItemId

      // Start the work item
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'storeCampaign' },
      })

      await waitForFlush(t)

      // Verify work item is started via task states
      const startedTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(startedTaskStates.storeCampaign).toBe('started')

      // Complete the work item with a message
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'storeCampaign',
          payload: { message: 'Hello, World!' },
        },
      })

      await waitForFlush(t)

      // Verify work item is completed via task states
      const completedTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(completedTaskStates.storeCampaign).toBe('completed')

      // Verify the campaign message was stored
      const updatedCampaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(updatedCampaigns[0].message).toBe('Hello, World!')
    })
  })

  describe('Work Queue', () => {
    it('returns work items for authorized user', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Check work queue
      const workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('storeCampaign')
      expect(workQueue[0].status).toBe('pending')
    })

    it('rejects work queue access for unauthorized user', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)

      // First create a workflow as an authenticated user
      const { authSpies } = await setupAuthenticatedCampaignUser(t)
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: {},
      })
      await waitForFlush(t)

      // Restore mock
      authSpies.forEach((spy) => spy.mockRestore())

      // Now check work queue as unauthorized user (no scopes)
      await setupUnauthenticatedUser(t)

      // User without proper scopes should be denied access
      await expect(
        t.query(api.workflows.campaign_approval.api.getCampaignWorkQueue, {}),
      ).rejects.toThrow('does not have scope campaign_approval:staff')
    })
  })

  describe('Claim Work Item', () => {
    it('allows authorized user to claim work item', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: {},
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
      await setupAuthenticatedCampaignUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: {},
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
    })
  })
})
