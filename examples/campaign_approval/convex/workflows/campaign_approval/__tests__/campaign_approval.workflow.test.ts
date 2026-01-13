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

  describe('Phase 1: Initiation - Rejection Path', () => {
    it('ends workflow when intake review rejects the request', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize and complete submitRequest
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete submitRequest
      const workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const submitRequestWorkItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: submitRequestWorkItemId,
        args: { name: 'submitRequest' },
      })
      await waitForFlush(t)

      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: submitRequestWorkItemId,
        args: { name: 'submitRequest', payload: { confirmed: true } },
      })
      await waitForFlush(t)

      // Now reject in intakeReview
      const intakeWorkQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const intakeReviewWorkItemId = intakeWorkQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: intakeReviewWorkItemId,
        args: { name: 'intakeReview' },
      })
      await waitForFlush(t)

      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: intakeReviewWorkItemId,
        args: {
          name: 'intakeReview',
          payload: { decision: 'rejected', reviewNotes: 'Not aligned with strategy' },
        },
      })
      await waitForFlush(t)

      // Verify workflow ended via rejection path
      const finalTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(finalTaskStates.intakeReview).toBe('completed')
      expect(finalTaskStates.assignOwner).toBe('disabled') // Should not be enabled on rejection
    })
  })

  describe('Phase 1: Initiation - Needs Changes Loop', () => {
    it('loops back to submitRequest when intake review requests changes', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize and complete submitRequest
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete submitRequest first time
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const submitRequestWorkItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: submitRequestWorkItemId,
        args: { name: 'submitRequest' },
      })
      await waitForFlush(t)

      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: submitRequestWorkItemId,
        args: { name: 'submitRequest', payload: { confirmed: true } },
      })
      await waitForFlush(t)

      // Request changes in intakeReview
      const intakeWorkQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const intakeReviewWorkItemId = intakeWorkQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: intakeReviewWorkItemId,
        args: { name: 'intakeReview' },
      })
      await waitForFlush(t)

      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: intakeReviewWorkItemId,
        args: {
          name: 'intakeReview',
          payload: { decision: 'needs_changes', reviewNotes: 'Please clarify budget' },
        },
      })
      await waitForFlush(t)

      // Verify submitRequest is enabled again (loop back)
      const afterLoopTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(afterLoopTaskStates.intakeReview).toBe('completed')
      expect(afterLoopTaskStates.submitRequest).toBe('enabled') // Loop back - new generation enabled
    })
  })

  describe('Phase 2: Strategy - Happy Path', () => {
    it('completes all strategy tasks in sequence', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Complete Phase 1 to reach Phase 2
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      // submitRequest
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'submitRequest' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: { name: 'submitRequest', payload: { confirmed: true } },
      })
      await waitForFlush(t)

      // intakeReview - approved
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'intakeReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: { name: 'intakeReview', payload: { decision: 'approved', reviewNotes: 'Good to go!' } },
      })
      await waitForFlush(t)

      // assignOwner
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'assignOwner' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: { name: 'assignOwner', payload: { ownerId: userId } },
      })
      await waitForFlush(t)

      // Verify Phase 2 tasks are now enabled
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.conductResearch).toBe('enabled')
      expect(taskStates.defineMetrics).toBe('disabled')

      // conductResearch
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('conductResearch')
      workItemId = workQueue[0].workItemId
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'conductResearch' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'conductResearch',
          payload: {
            audienceAnalysis: 'Target audience identified',
            competitiveInsights: 'Market analysis complete',
            historicalLearnings: 'Past campaigns reviewed',
          },
        },
      })
      await waitForFlush(t)

      // defineMetrics
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.conductResearch).toBe('completed')
      expect(taskStates.defineMetrics).toBe('enabled')

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('defineMetrics')
      workItemId = workQueue[0].workItemId
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'defineMetrics' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'defineMetrics',
          payload: {
            kpis: [
              { metric: 'leads', targetValue: 1000, unit: 'count' },
              { metric: 'conversion_rate', targetValue: 5, unit: 'percent' },
            ],
          },
        },
      })
      await waitForFlush(t)

      // developStrategy
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.defineMetrics).toBe('completed')
      expect(taskStates.developStrategy).toBe('enabled')

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('developStrategy')
      workItemId = workQueue[0].workItemId
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developStrategy' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developStrategy',
          payload: {
            channelStrategy: 'Multi-channel approach',
            creativeApproach: 'Key benefits focus',
            customerJourney: 'Awareness to conversion',
            keyTouchpoints: ['Email', 'Social', 'Landing Page'],
          },
        },
      })
      await waitForFlush(t)

      // createPlan
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.developStrategy).toBe('completed')
      expect(taskStates.createPlan).toBe('enabled')

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('createPlan')
      workItemId = workQueue[0].workItemId
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'createPlan' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'createPlan',
          payload: {
            timeline: 'Q1 2026',
            milestones: [
              { name: 'Launch', targetDate: Date.now() + 7 * 24 * 60 * 60 * 1000 },
              { name: 'Mid-campaign review', targetDate: Date.now() + 15 * 24 * 60 * 60 * 1000 },
              { name: 'Close', targetDate: Date.now() + 30 * 24 * 60 * 60 * 1000 },
            ],
            tactics: 'Digital and event marketing',
            segmentation: 'Enterprise customers',
            resourceRequirements: 'Marketing team + agency',
          },
        },
      })
      await waitForFlush(t)

      // Verify Phase 2 complete and Phase 3 (developBudget) is enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.createPlan).toBe('completed')
      expect(taskStates.developBudget).toBe('enabled')

      // Verify campaign status updated to budget_approval
      const finalCampaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaigns[0].status).toBe('budget_approval')
    })
  })

  describe('Phase 3: Budget - Director Approval Path', () => {
    it('routes to director approval for budgets under $50K', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize with low budget
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 25000 }),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1 and Phase 2 (abbreviated for this test)
      await completePhase1And2(t, userId)

      // developBudget with amount under $50K
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('developBudget')
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developBudget' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developBudget',
          payload: {
            totalAmount: 30000,
            mediaSpend: 15000,
            creativeProduction: 8000,
            technologyTools: 3000,
            agencyFees: 2000,
            eventCosts: 1000,
            contingency: 1000,
            justification: 'Low budget campaign',
          },
        },
      })
      await waitForFlush(t)

      // Verify director approval is enabled (not executive)
      const taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.developBudget).toBe('completed')
      expect(taskStates.directorApproval).toBe('enabled')
      expect(taskStates.executiveApproval).toBe('disabled')

      // Complete director approval
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('directorApproval')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'directorApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'directorApproval',
          payload: { decision: 'approved', approvalNotes: 'Budget approved' },
        },
      })
      await waitForFlush(t)

      // Verify secureResources is enabled
      const afterApprovalTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(afterApprovalTaskStates.directorApproval).toBe('completed')
      expect(afterApprovalTaskStates.secureResources).toBe('enabled')
    })
  })

  describe('Phase 3: Budget - Executive Approval Path', () => {
    it('routes to executive approval for budgets $50K and above', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize with high budget
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 75000 }),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1 and Phase 2
      await completePhase1And2(t, userId)

      // developBudget with amount >= $50K
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('developBudget')
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developBudget' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developBudget',
          payload: {
            totalAmount: 75000,
            mediaSpend: 35000,
            creativeProduction: 20000,
            technologyTools: 8000,
            agencyFees: 7000,
            eventCosts: 3000,
            contingency: 2000,
            justification: 'High budget campaign',
          },
        },
      })
      await waitForFlush(t)

      // Verify executive approval is enabled (not director)
      const taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.developBudget).toBe('completed')
      expect(taskStates.executiveApproval).toBe('enabled')
      expect(taskStates.directorApproval).toBe('disabled')

      // Complete executive approval
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('executiveApproval')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'executiveApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'executiveApproval',
          payload: { decision: 'approved', approvalNotes: 'Executive approved' },
        },
      })
      await waitForFlush(t)

      // Verify secureResources is enabled
      const afterApprovalTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(afterApprovalTaskStates.executiveApproval).toBe('completed')
      expect(afterApprovalTaskStates.secureResources).toBe('enabled')
    })
  })

  describe('Phase 3: Budget - Revision Loop', () => {
    it('loops back to developBudget when revision is requested', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1 and Phase 2
      await completePhase1And2(t, userId)

      // developBudget
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developBudget' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developBudget',
          payload: {
            totalAmount: 30000,
            mediaSpend: 15000,
            creativeProduction: 8000,
            technologyTools: 3000,
            agencyFees: 2000,
            eventCosts: 1000,
            contingency: 1000,
            justification: 'Initial budget',
          },
        },
      })
      await waitForFlush(t)

      // Director requests revision
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'directorApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'directorApproval',
          payload: { decision: 'revision_requested', approvalNotes: 'Need more contingency' },
        },
      })
      await waitForFlush(t)

      // Verify developBudget is enabled again (loop back)
      const afterRevisionTaskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(afterRevisionTaskStates.directorApproval).toBe('completed')
      expect(afterRevisionTaskStates.developBudget).toBe('enabled') // Loop back
    })
  })

  describe('Phase 4: Creative Development - Happy Path', () => {
    it('completes creative phase from createBrief through finalApproval', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize with low budget to use director approval path
      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1, 2, and 3
      await completePhase1And2(t, userId)
      await completePhase3(t)

      // Verify Phase 4 starts with createBrief
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.createBrief).toBe('enabled')
      expect(taskStates.developConcepts).toBe('disabled')

      // createBrief
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('createBrief')
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'createBrief' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'createBrief',
          payload: {
            objectives: 'Increase brand awareness',
            targetAudience: 'B2B decision makers',
            keyMessages: ['Quality', 'Innovation', 'Value'],
            toneAndStyle: 'Professional and authoritative',
            deliverables: [
              { type: 'email', description: 'Email campaign template' },
              { type: 'social_post', description: 'Social media content' },
            ],
            deadline: Date.now() + 14 * 24 * 60 * 60 * 1000,
          },
        },
      })
      await waitForFlush(t)

      // Verify campaign status updated
      const campaignsAfterBrief = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaignsAfterBrief[0].status).toBe('creative_development')

      // developConcepts should be enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.createBrief).toBe('completed')
      expect(taskStates.developConcepts).toBe('enabled')

      // developConcepts - get creatives that were created
      const creatives = await t.run(async (ctx) => {
        return await ctx.db.query('campaignCreatives').collect()
      })
      expect(creatives.length).toBe(2) // Two deliverables from brief

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('developConcepts')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developConcepts' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developConcepts',
          payload: {
            assets: creatives.map((c) => ({
              creativeId: c._id,
              notes: 'Initial concept developed',
            })),
          },
        },
      })
      await waitForFlush(t)

      // internalReview should be enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.developConcepts).toBe('completed')
      expect(taskStates.internalReview).toBe('enabled')

      // internalReview - approve all
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('internalReview')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'internalReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'internalReview',
          payload: {
            decision: 'approved',
            reviewNotes: 'All concepts look great',
          },
        },
      })
      await waitForFlush(t)

      // legalReview should be enabled (approved path)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.internalReview).toBe('completed')
      expect(taskStates.legalReview).toBe('enabled')
      expect(taskStates.reviseAssets).toBe('disabled')

      // legalReview - approve
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('legalReview')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'legalReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'legalReview',
          payload: {
            decision: 'approved',
            complianceNotes: 'All assets comply with legal requirements',
          },
        },
      })
      await waitForFlush(t)

      // finalApproval should be enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.legalReview).toBe('completed')
      expect(taskStates.finalApproval).toBe('enabled')
      expect(taskStates.legalRevise).toBe('disabled')

      // finalApproval
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('finalApproval')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'finalApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'finalApproval',
          payload: {
            approved: true,
            signoffNotes: 'Creative assets approved for production',
          },
        },
      })
      await waitForFlush(t)

      // Verify Phase 4 complete and campaign status updated
      const finalCampaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaigns[0].status).toBe('technical_setup')

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.finalApproval).toBe('completed')
    })
  })

  describe('Phase 4: Creative Development - Internal Review Revision Loop', () => {
    it('loops back to reviseAssets when internal review requests revision', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1, 2, and 3
      await completePhase1And2(t, userId)
      await completePhase3(t)

      // createBrief
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'createBrief' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'createBrief',
          payload: {
            objectives: 'Brand awareness',
            targetAudience: 'B2B',
            keyMessages: ['Quality'],
            toneAndStyle: 'Professional',
            deliverables: [{ type: 'email', description: 'Email template' }],
            deadline: Date.now() + 14 * 24 * 60 * 60 * 1000,
          },
        },
      })
      await waitForFlush(t)

      // developConcepts
      const creatives = await t.run(async (ctx) => {
        return await ctx.db.query('campaignCreatives').collect()
      })

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developConcepts' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developConcepts',
          payload: {
            assets: creatives.map((c) => ({
              creativeId: c._id,
              notes: 'Initial concept',
            })),
          },
        },
      })
      await waitForFlush(t)

      // internalReview - request revision
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'internalReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'internalReview',
          payload: {
            decision: 'needs_revision',
            reviewNotes: 'Colors need adjustment',
          },
        },
      })
      await waitForFlush(t)

      // Verify reviseAssets is enabled (loop back path)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.internalReview).toBe('completed')
      expect(taskStates.reviseAssets).toBe('enabled')
      expect(taskStates.legalReview).toBe('disabled')

      // reviseAssets
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('reviseAssets')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'reviseAssets' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'reviseAssets',
          payload: {
            revisedAssets: creatives.map((c) => ({
              creativeId: c._id,
              revisionNotes: 'Colors adjusted per feedback',
            })),
          },
        },
      })
      await waitForFlush(t)

      // Verify version incremented
      const updatedCreatives = await t.run(async (ctx) => {
        return await ctx.db.query('campaignCreatives').collect()
      })
      expect(updatedCreatives[0].version).toBe(2) // Incremented from 1

      // Verify internalReview is enabled again (loop back)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.reviseAssets).toBe('completed')
      expect(taskStates.internalReview).toBe('enabled')
    })
  })

  describe('Phase 4: Creative Development - Legal Review Revision Loop', () => {
    it('loops back to legalRevise when legal review requests changes', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(api.workflows.campaign_approval.api.initializeRootWorkflow, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaigns = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaigns[0].workflowId

      // Complete Phase 1, 2, and 3
      await completePhase1And2(t, userId)
      await completePhase3(t)

      // createBrief
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'createBrief' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'createBrief',
          payload: {
            objectives: 'Brand awareness',
            targetAudience: 'B2B',
            keyMessages: ['Quality'],
            toneAndStyle: 'Professional',
            deliverables: [{ type: 'email', description: 'Email template' }],
            deadline: Date.now() + 14 * 24 * 60 * 60 * 1000,
          },
        },
      })
      await waitForFlush(t)

      // developConcepts
      const creatives = await t.run(async (ctx) => {
        return await ctx.db.query('campaignCreatives').collect()
      })

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'developConcepts' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'developConcepts',
          payload: {
            assets: creatives.map((c) => ({
              creativeId: c._id,
              notes: 'Initial concept',
            })),
          },
        },
      })
      await waitForFlush(t)

      // internalReview - approve
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'internalReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'internalReview',
          payload: {
            decision: 'approved',
            reviewNotes: 'Looks good',
          },
        },
      })
      await waitForFlush(t)

      // legalReview - request changes
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'legalReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'legalReview',
          payload: {
            decision: 'needs_changes',
            complianceNotes: 'Disclaimer required',
            requiredChanges: creatives.map((c) => ({
              creativeId: c._id,
              issue: 'Missing disclaimer',
              requiredFix: 'Add legal disclaimer text',
            })),
          },
        },
      })
      await waitForFlush(t)

      // Verify legalRevise is enabled (loop back path)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.legalReview).toBe('completed')
      expect(taskStates.legalRevise).toBe('enabled')
      expect(taskStates.finalApproval).toBe('disabled')

      // legalRevise
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('legalRevise')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'legalRevise' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'legalRevise',
          payload: {
            revisedAssets: creatives.map((c) => ({
              creativeId: c._id,
              addressedIssue: 'Added legal disclaimer',
            })),
          },
        },
      })
      await waitForFlush(t)

      // Verify version incremented
      const updatedCreatives = await t.run(async (ctx) => {
        return await ctx.db.query('campaignCreatives').collect()
      })
      expect(updatedCreatives[0].version).toBe(2) // Incremented from 1

      // Verify legalReview is enabled again (loop back)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.legalRevise).toBe('completed')
      expect(taskStates.legalReview).toBe('enabled')
    })
  })
})

/**
 * Helper function to complete Phase 3 (Budget) for creative testing
 * Budget is approved via director path (under $50K)
 */
async function completePhase3(
  t: ReturnType<typeof setup>,
) {
  // developBudget
  let workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  let workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'developBudget' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'developBudget',
      payload: {
        totalAmount: 30000,
        mediaSpend: 15000,
        creativeProduction: 8000,
        technologyTools: 3000,
        agencyFees: 2000,
        eventCosts: 1000,
        contingency: 1000,
        justification: 'Budget for creative testing',
      },
    },
  })
  await waitForFlush(t)

  // directorApproval
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'directorApproval' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'directorApproval',
      payload: { decision: 'approved', approvalNotes: 'Approved' },
    },
  })
  await waitForFlush(t)

  // secureResources
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'secureResources' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'secureResources',
      payload: { resourcesConfirmed: true },
    },
  })
  await waitForFlush(t)
}

/**
 * Helper function to complete Phase 1 and Phase 2 for budget testing
 */
async function completePhase1And2(
  t: ReturnType<typeof setup>,
  userId: string,
) {
  // Phase 1: submitRequest
  let workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  let workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'submitRequest' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: { name: 'submitRequest', payload: { confirmed: true } },
  })
  await waitForFlush(t)

  // Phase 1: intakeReview
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'intakeReview' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: { name: 'intakeReview', payload: { decision: 'approved', reviewNotes: 'Approved' } },
  })
  await waitForFlush(t)

  // Phase 1: assignOwner
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'assignOwner' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: { name: 'assignOwner', payload: { ownerId: userId } },
  })
  await waitForFlush(t)

  // Phase 2: conductResearch
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'conductResearch' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'conductResearch',
      payload: {
        audienceAnalysis: 'Done',
        competitiveInsights: 'Done',
        historicalLearnings: 'Done',
      },
    },
  })
  await waitForFlush(t)

  // Phase 2: defineMetrics
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'defineMetrics' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'defineMetrics',
      payload: { kpis: [{ metric: 'leads', targetValue: 1000, unit: 'count' }] },
    },
  })
  await waitForFlush(t)

  // Phase 2: developStrategy
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'developStrategy' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'developStrategy',
      payload: {
        channelStrategy: 'Multi-channel',
        creativeApproach: 'Benefits-focused',
        customerJourney: 'Awareness to conversion',
        keyTouchpoints: ['Email', 'Social'],
      },
    },
  })
  await waitForFlush(t)

  // Phase 2: createPlan
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'createPlan' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'createPlan',
      payload: {
        timeline: 'Q1 2026',
        milestones: [{ name: 'Launch', targetDate: Date.now() + 7 * 24 * 60 * 60 * 1000 }],
        tactics: 'Digital marketing',
        segmentation: 'Enterprise',
        resourceRequirements: 'Team',
      },
    },
  })
  await waitForFlush(t)
}
