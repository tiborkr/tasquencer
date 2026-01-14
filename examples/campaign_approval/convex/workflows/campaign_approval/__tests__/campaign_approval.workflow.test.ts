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

// Note: With 25+ workflow elements (tasks + conditions), TypeScript type inference
// hits depth limits (TS2589). Using type cast to break the inference chain.
// The mutation still validates types at runtime through Convex schema.
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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })

      await waitForFlush(t)

      // Get the campaign to find the workflow ID
      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaignsResult.campaigns.length).toBe(1)
      expect(campaignsResult.campaigns[0].name).toBe('Test Campaign')
      expect(campaignsResult.campaigns[0].objective).toBe('Test objective for campaign')
      expect(campaignsResult.campaigns[0].status).toBe('draft')

      const workflowId = campaignsResult.campaigns[0].workflowId

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
      const campaignsAfterSubmitResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaignsAfterSubmitResult.campaigns[0].status).toBe('intake_review')

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
      const finalCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaignsResult.campaigns[0].ownerId).toBe(userId)
      expect(finalCampaignsResult.campaigns[0].status).toBe('strategy')

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
      await t.mutation(initializeRootWorkflowMutation, {
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
      await t.mutation(initializeRootWorkflowMutation, {
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
      await t.mutation(initializeRootWorkflowMutation, {
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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })

      await waitForFlush(t)

      // Get the campaign
      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )

      const campaign = await t.query(api.workflows.campaign_approval.api.getCampaign, {
        workflowId: campaignsResult.campaigns[0].workflowId,
      })

      expect(campaign).not.toBeNull()
      expect(campaign?.workflowId).toBe(campaignsResult.campaigns[0].workflowId)
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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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
      const finalCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaignsResult.campaigns[0].status).toBe('budget_approval')
    })
  })

  describe('Phase 3: Budget - Director Approval Path', () => {
    it('routes to director approval for budgets under $50K', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize with low budget
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 25000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 75000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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
      const campaignsAfterBriefResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(campaignsAfterBriefResult.campaigns[0].status).toBe('creative_development')

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
      const finalCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaignsResult.campaigns[0].status).toBe('technical_setup')

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

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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

  describe('Phase 5: Technical Setup - Happy Path', () => {
    it('runs parallel setup tasks, joins, and completes QA successfully', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize with low budget
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-4
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)

      // Verify Phase 5 parallel tasks are enabled (AND split)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.parallelSetup).toBe('completed')
      expect(taskStates.buildInfra).toBe('enabled')
      expect(taskStates.configAnalytics).toBe('enabled')
      expect(taskStates.setupMedia).toBe('enabled')
      expect(taskStates.setupJoin).toBe('disabled') // Waiting for all 3

      // Complete buildInfra
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      // All 3 parallel tasks should be available
      expect(workQueue.length).toBe(3)
      const buildInfraItem = workQueue.find((w: any) => w.taskType === 'buildInfra')
      expect(buildInfraItem).toBeDefined()

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: buildInfraItem!.workItemId,
        args: { name: 'buildInfra' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: buildInfraItem!.workItemId,
        args: {
          name: 'buildInfra',
          payload: { infraReady: true, notes: 'Landing pages ready' },
        },
      })
      await waitForFlush(t)

      // Complete configAnalytics
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const configAnalyticsItem = workQueue.find((w: any) => w.taskType === 'configAnalytics')
      expect(configAnalyticsItem).toBeDefined()

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: configAnalyticsItem!.workItemId,
        args: { name: 'configAnalytics' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: configAnalyticsItem!.workItemId,
        args: {
          name: 'configAnalytics',
          payload: { analyticsConfigured: true, notes: 'Tracking configured' },
        },
      })
      await waitForFlush(t)

      // Verify setupJoin still disabled (waiting for setupMedia)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.buildInfra).toBe('completed')
      expect(taskStates.configAnalytics).toBe('completed')
      expect(taskStates.setupMedia).toBe('enabled')
      expect(taskStates.setupJoin).toBe('disabled') // Still waiting

      // Complete setupMedia (final parallel task)
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const setupMediaItem = workQueue.find((w: any) => w.taskType === 'setupMedia')
      expect(setupMediaItem).toBeDefined()

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: setupMediaItem!.workItemId,
        args: { name: 'setupMedia' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: setupMediaItem!.workItemId,
        args: {
          name: 'setupMedia',
          payload: { mediaReady: true, notes: 'Ad campaigns created' },
        },
      })
      await waitForFlush(t)

      // Verify setupJoin completed and qaTest enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.setupMedia).toBe('completed')
      expect(taskStates.setupJoin).toBe('completed')
      expect(taskStates.qaTest).toBe('enabled')

      // Complete qaTest - pass
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('qaTest')

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: workQueue[0].workItemId,
        args: { name: 'qaTest' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: workQueue[0].workItemId,
        args: {
          name: 'qaTest',
          payload: { result: 'passed', testResults: 'All tests passed' },
        },
      })
      await waitForFlush(t)

      // Verify campaign status and workflow completion
      const finalCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaignsResult.campaigns[0].status).toBe('pre_launch')

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.qaTest).toBe('completed')
      expect(taskStates.fixIssues).toBe('disabled')
    })
  })

  describe('Phase 5: Technical Setup - QA Failure and Fix Loop', () => {
    it('loops to fixIssues when QA fails, then back to qaTest', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-4
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)

      // Complete all parallel tasks
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )

      // Complete buildInfra
      const buildInfraItem = workQueue.find((w: any) => w.taskType === 'buildInfra')
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: buildInfraItem!.workItemId,
        args: { name: 'buildInfra' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: buildInfraItem!.workItemId,
        args: { name: 'buildInfra', payload: { infraReady: true } },
      })
      await waitForFlush(t)

      // Complete configAnalytics
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const configAnalyticsItem = workQueue.find((w: any) => w.taskType === 'configAnalytics')
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: configAnalyticsItem!.workItemId,
        args: { name: 'configAnalytics' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: configAnalyticsItem!.workItemId,
        args: { name: 'configAnalytics', payload: { analyticsConfigured: true } },
      })
      await waitForFlush(t)

      // Complete setupMedia
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      const setupMediaItem = workQueue.find((w: any) => w.taskType === 'setupMedia')
      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: setupMediaItem!.workItemId,
        args: { name: 'setupMedia' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: setupMediaItem!.workItemId,
        args: { name: 'setupMedia', payload: { mediaReady: true } },
      })
      await waitForFlush(t)

      // qaTest - fail
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('qaTest')

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: workQueue[0].workItemId,
        args: { name: 'qaTest' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: workQueue[0].workItemId,
        args: {
          name: 'qaTest',
          payload: { result: 'failed', testResults: 'Email tracking broken' },
        },
      })
      await waitForFlush(t)

      // Verify fixIssues is enabled (loop back path)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.qaTest).toBe('completed')
      expect(taskStates.fixIssues).toBe('enabled')

      // fixIssues
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('fixIssues')

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId: workQueue[0].workItemId,
        args: { name: 'fixIssues' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId: workQueue[0].workItemId,
        args: {
          name: 'fixIssues',
          payload: { issuesFixed: true, notes: 'Email tracking fixed' },
        },
      })
      await waitForFlush(t)

      // Verify qaTest is enabled again (loop back)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.fixIssues).toBe('completed')
      expect(taskStates.qaTest).toBe('enabled')
    })
  })

  describe('Phase 6: Launch - Happy Path', () => {
    it('completes launch phase from preLaunchReview through internalComms', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      // Initialize with low budget
      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-5
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)

      // Verify Phase 6 starts with preLaunchReview
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.preLaunchReview).toBe('enabled')
      expect(taskStates.addressConcerns).toBe('disabled')
      expect(taskStates.launchApproval).toBe('disabled')
      expect(taskStates.internalComms).toBe('disabled')

      // preLaunchReview - ready for approval
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('preLaunchReview')
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'preLaunchReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'preLaunchReview',
          payload: {
            readyForApproval: true,
            meetingNotes: 'All stakeholders aligned',
          },
        },
      })
      await waitForFlush(t)

      // Verify launchApproval is enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.preLaunchReview).toBe('completed')
      expect(taskStates.launchApproval).toBe('enabled')
      expect(taskStates.addressConcerns).toBe('disabled')

      // launchApproval - approved
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('launchApproval')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'launchApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'launchApproval',
          payload: {
            decision: 'approved',
            approverNotes: 'Launch authorized',
            launchDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          },
        },
      })
      await waitForFlush(t)

      // Verify internalComms is enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.launchApproval).toBe('completed')
      expect(taskStates.internalComms).toBe('enabled')

      // internalComms
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('internalComms')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'internalComms' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'internalComms',
          payload: {
            notifiedTeams: [
              { team: 'sales', notified: true },
              { team: 'customer_service', notified: true },
            ],
            communicationsSent: true,
          },
        },
      })
      await waitForFlush(t)

      // Verify Phase 6 complete and campaign status is active
      const finalCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaignsResult.campaigns[0].status).toBe('active')

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.internalComms).toBe('completed')
    })
  })

  describe('Phase 6: Launch - Pre-Launch Review Concerns Loop', () => {
    it('loops to addressConcerns when preLaunchReview is not ready for approval', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-5
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)

      // preLaunchReview - not ready for approval
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'preLaunchReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'preLaunchReview',
          payload: {
            readyForApproval: false,
            meetingNotes: 'Open concerns need resolution',
            concerns: [{ concern: 'Budget needs finalization', owner: 'Finance' }],
          },
        },
      })
      await waitForFlush(t)

      // Verify addressConcerns is enabled (loop path)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.preLaunchReview).toBe('completed')
      expect(taskStates.addressConcerns).toBe('enabled')
      expect(taskStates.launchApproval).toBe('disabled')

      // addressConcerns
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('addressConcerns')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'addressConcerns' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'addressConcerns',
          payload: {
            resolutions: [
              { concern: 'Budget needs finalization', resolution: 'Finance confirmed budget' },
            ],
          },
        },
      })
      await waitForFlush(t)

      // Verify preLaunchReview is enabled again (loop back)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.addressConcerns).toBe('completed')
      expect(taskStates.preLaunchReview).toBe('enabled')
    })
  })

  describe('Phase 6: Launch - Launch Approval Concerns Loop', () => {
    it('loops to addressConcerns when launchApproval has concerns', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-5
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)

      // preLaunchReview - ready for approval
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'preLaunchReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'preLaunchReview',
          payload: { readyForApproval: true },
        },
      })
      await waitForFlush(t)

      // launchApproval - concerns (not rejected, not approved)
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'launchApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'launchApproval',
          payload: {
            decision: 'concerns',
            approverNotes: 'Need to resolve timing conflict with other campaign',
          },
        },
      })
      await waitForFlush(t)

      // Verify addressConcerns is enabled (concerns path)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.launchApproval).toBe('completed')
      expect(taskStates.addressConcerns).toBe('enabled')
      expect(taskStates.internalComms).toBe('disabled')

      // addressConcerns
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('addressConcerns')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'addressConcerns' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'addressConcerns',
          payload: {
            resolutions: [
              { concern: 'Timing conflict', resolution: 'Adjusted launch date' },
            ],
          },
        },
      })
      await waitForFlush(t)

      // Verify preLaunchReview is enabled again (loop back to re-review)
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.addressConcerns).toBe('completed')
      expect(taskStates.preLaunchReview).toBe('enabled')
    })
  })

  describe('Phase 6: Launch - Rejection Path', () => {
    it('ends workflow when launch is rejected', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-5
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)

      // preLaunchReview - ready for approval
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'preLaunchReview' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'preLaunchReview',
          payload: { readyForApproval: true },
        },
      })
      await waitForFlush(t)

      // launchApproval - rejected
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'launchApproval' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'launchApproval',
          payload: {
            decision: 'rejected',
            approverNotes: 'Market conditions have changed, campaign no longer viable',
          },
        },
      })
      await waitForFlush(t)

      // Verify campaign status is cancelled
      const finalCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(finalCampaignsResult.campaigns[0].status).toBe('cancelled')

      // Verify workflow ended via rejection path
      const taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.launchApproval).toBe('completed')
      expect(taskStates.internalComms).toBe('disabled') // Should not be enabled on rejection
      expect(taskStates.addressConcerns).toBe('disabled')
    })
  })

  describe('Phase 4: Creative Development - Legal Review Revision Loop', () => {
    it('loops back to legalRevise when legal review requests changes', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

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

  describe('Phase 7: Execution - Happy Path', () => {
    it('completes execution phase from launchCampaign through optimization with end decision', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-6
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)
      await completePhase6(t)

      // Verify Phase 7 starts with launchCampaign
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.internalComms).toBe('completed')
      expect(taskStates.launchCampaign).toBe('enabled')
      expect(taskStates.monitorPerformance).toBe('disabled')

      // launchCampaign
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('launchCampaign')
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'launchCampaign' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'launchCampaign',
          payload: {
            launchedAt: Date.now(),
            activatedComponents: [
              { component: 'ads', platform: 'Google Ads', status: 'live' },
              { component: 'emails', status: 'scheduled', scheduledTime: Date.now() + 24 * 60 * 60 * 1000 },
            ],
            launchNotes: 'Campaign launched successfully',
          },
        },
      })
      await waitForFlush(t)

      // Verify monitorPerformance is enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.launchCampaign).toBe('completed')
      expect(taskStates.monitorPerformance).toBe('enabled')

      // monitorPerformance
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('monitorPerformance')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'monitorPerformance' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'monitorPerformance',
          payload: {
            monitoringPeriod: { start: Date.now() - 7 * 24 * 60 * 60 * 1000, end: Date.now() },
            metrics: [
              { metric: 'impressions', value: 50000, benchmark: 45000, status: 'above_target' },
              { metric: 'clicks', value: 2500, benchmark: 2000, status: 'above_target' },
            ],
            overallStatus: 'healthy',
          },
        },
      })
      await waitForFlush(t)

      // Verify ongoingOptimization is enabled
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.monitorPerformance).toBe('completed')
      expect(taskStates.ongoingOptimization).toBe('enabled')

      // ongoingOptimization - end campaign (no more optimization cycles)
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('ongoingOptimization')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'ongoingOptimization' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'ongoingOptimization',
          payload: {
            optimizations: [
              {
                type: 'targeting',
                description: 'Expanded audience segment',
                expectedImpact: '10% increase in reach',
                implementedAt: Date.now(),
              },
            ],
            nextReviewDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
            decision: 'end', // End the optimization loop
          },
        },
      })
      await waitForFlush(t)

      // Verify workflow reaches end condition
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.ongoingOptimization).toBe('completed')
      // monitorPerformance should NOT be re-enabled since decision was 'end'
    })
  })

  describe('Phase 7: Execution - Optimization Loop', () => {
    it('loops back to monitorPerformance when optimization continues', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-6
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)
      await completePhase6(t)

      // launchCampaign
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'launchCampaign' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'launchCampaign',
          payload: {
            launchedAt: Date.now(),
            launchNotes: 'Campaign launched',
          },
        },
      })
      await waitForFlush(t)

      // monitorPerformance (first cycle)
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'monitorPerformance' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'monitorPerformance',
          payload: {
            metrics: [{ metric: 'conversions', value: 100, status: 'below_target' }],
            overallStatus: 'needs_attention',
          },
        },
      })
      await waitForFlush(t)

      // ongoingOptimization - continue (more optimization needed)
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'ongoingOptimization' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'ongoingOptimization',
          payload: {
            optimizations: [
              {
                type: 'bid_adjustment',
                description: 'Increased bids on high-performing keywords',
                expectedImpact: '15% increase in conversions',
                implementedAt: Date.now(),
              },
            ],
            decision: 'continue', // Continue the optimization loop
          },
        },
      })
      await waitForFlush(t)

      // Verify monitorPerformance is enabled again (loop back)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.ongoingOptimization).toBe('completed')
      expect(taskStates.monitorPerformance).toBe('enabled') // Loop back enabled

      // Complete second monitoring cycle
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('monitorPerformance')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'monitorPerformance' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'monitorPerformance',
          payload: {
            metrics: [{ metric: 'conversions', value: 150, status: 'on_track' }],
            overallStatus: 'healthy',
          },
        },
      })
      await waitForFlush(t)

      // Verify ongoingOptimization is enabled again
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.monitorPerformance).toBe('completed')
      expect(taskStates.ongoingOptimization).toBe('enabled')
    })
  })

  describe('Phase 8: Closure - Happy Path', () => {
    it('completes full closure phase from endCampaign through archiveMaterials', async () => {
      const t = setup()

      await setupCampaignApprovalAuthorization(t)
      const { userId } = await setupAuthenticatedCampaignUser(t)

      await t.mutation(initializeRootWorkflowMutation, {
        payload: createTestCampaignPayload(userId, { estimatedBudget: 30000 }),
      })
      await waitForFlush(t)

      const campaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      const workflowId = campaignsResult.campaigns[0].workflowId

      // Complete Phases 1-6
      await completePhase1And2(t, userId)
      await completePhase3(t)
      await completePhase4(t)
      await completePhase5(t)
      await completePhase6(t)

      // Complete Phase 7 with 'end' decision to trigger Phase 8
      await completePhase7WithEnd(t)

      // Verify endCampaign is enabled (Phase 8 starts)
      let taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.endCampaign).toBe('enabled')

      // endCampaign
      let workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('endCampaign')
      let workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'endCampaign' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'endCampaign',
          payload: {
            endedAt: Date.now(),
            deactivatedComponents: [
              { component: 'ads', platform: 'Google Ads', deactivatedAt: Date.now() },
              { component: 'emails', deactivatedAt: Date.now() },
              { component: 'social', platform: 'LinkedIn', deactivatedAt: Date.now() },
            ],
            remainingBudget: 2500,
            endNotes: 'Campaign ended successfully',
          },
        },
      })
      await waitForFlush(t)

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.endCampaign).toBe('completed')
      expect(taskStates.compileData).toBe('enabled')

      // compileData
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('compileData')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'compileData' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'compileData',
          payload: {
            dataSources: [
              {
                source: 'google_analytics',
                metricsCollected: ['sessions', 'conversions', 'bounce_rate'],
                dataRange: { start: Date.now() - 30 * 24 * 60 * 60 * 1000, end: Date.now() },
              },
              {
                source: 'ad_platform',
                metricsCollected: ['impressions', 'clicks', 'spend'],
                dataRange: { start: Date.now() - 30 * 24 * 60 * 60 * 1000, end: Date.now() },
              },
            ],
            aggregatedMetrics: {
              totalImpressions: 500000,
              totalClicks: 15000,
              totalConversions: 750,
              totalSpend: 27500,
              totalRevenue: 125000,
            },
            dataLocation: '/reports/campaign-data.xlsx',
          },
        },
      })
      await waitForFlush(t)

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.compileData).toBe('completed')
      expect(taskStates.conductAnalysis).toBe('enabled')

      // conductAnalysis - get KPIs first for the payload
      const kpis = await t.run(async (ctx) => {
        return await ctx.db.query('campaignKPIs').collect()
      })

      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('conductAnalysis')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'conductAnalysis' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'conductAnalysis',
          payload: {
            kpiResults: kpis.map((kpi) => ({
              kpiId: kpi._id,
              metric: kpi.metric,
              target: kpi.targetValue,
              actual: Math.round(kpi.targetValue * 1.1), // 110% of target
              percentAchieved: 110,
              analysis: 'Exceeded target by 10%',
            })),
            whatWorked: ['Targeted messaging', 'Social proof elements'],
            whatDidntWork: ['Initial ad creative underperformed'],
            lessonsLearned: ['A/B test earlier', 'Focus on mobile-first'],
            recommendationsForFuture: ['Increase social spend', 'Test video ads'],
            overallAssessment: 'exceeded_goals',
          },
        },
      })
      await waitForFlush(t)

      // Verify KPIs were updated with actual values
      const updatedKpis = await t.run(async (ctx) => {
        return await ctx.db.query('campaignKPIs').collect()
      })
      for (const kpi of updatedKpis) {
        expect(kpi.actualValue).toBeDefined()
        expect(kpi.actualValue).toBe(Math.round(kpi.targetValue * 1.1))
      }

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.conductAnalysis).toBe('completed')
      expect(taskStates.presentResults).toBe('enabled')

      // presentResults
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('presentResults')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'presentResults' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'presentResults',
          payload: {
            presentationDate: Date.now(),
            attendees: ['CMO', 'VP Marketing', 'Campaign Manager'],
            presentationUrl: 'https://slides.example.com/campaign-results',
            feedbackReceived: 'Great results, continue with similar approach',
            followUpActions: [
              { action: 'Plan Q2 campaign', owner: 'Campaign Manager', dueDate: Date.now() + 14 * 24 * 60 * 60 * 1000 },
            ],
          },
        },
      })
      await waitForFlush(t)

      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.presentResults).toBe('completed')
      expect(taskStates.archiveMaterials).toBe('enabled')

      // archiveMaterials - final task
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue[0].taskType).toBe('archiveMaterials')
      workItemId = workQueue[0].workItemId

      await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
        workItemId,
        args: { name: 'archiveMaterials' },
      })
      await waitForFlush(t)
      await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'archiveMaterials',
          payload: {
            archivedItems: [
              { itemType: 'creative_assets', location: '/archive/creatives', description: 'All ad creatives and designs' },
              { itemType: 'analytics_data', location: '/archive/analytics', description: 'Raw and processed metrics' },
              { itemType: 'reports', location: '/archive/reports', description: 'Final campaign report' },
              { itemType: 'documentation', location: '/archive/docs', description: 'Strategy and planning docs' },
            ],
            archiveLocation: '/archive/campaign-2026-q1',
            retentionPeriod: '2 years',
            archivedAt: Date.now(),
          },
        },
      })
      await waitForFlush(t)

      // Verify workflow reaches end condition and campaign is completed
      taskStates = await t.query(
        api.workflows.campaign_approval.api.campaignWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.archiveMaterials).toBe('completed')

      // Verify campaign status is 'completed'
      const completedCampaignsResult = await t.query(
        api.workflows.campaign_approval.api.getCampaigns,
        {},
      )
      expect(completedCampaignsResult.campaigns[0].status).toBe('completed')

      // Verify work queue is empty (workflow complete)
      workQueue = await t.query(
        api.workflows.campaign_approval.api.getCampaignWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(0)
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

/**
 * Helper function to complete Phase 4 (Creative Development)
 * Completes: createBrief, developConcepts, internalReview (approved),
 * legalReview (approved), finalApproval
 */
async function completePhase4(t: ReturnType<typeof setup>) {
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
      payload: { decision: 'approved', reviewNotes: 'Approved' },
    },
  })
  await waitForFlush(t)

  // legalReview - approve
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
      payload: { decision: 'approved', complianceNotes: 'Approved' },
    },
  })
  await waitForFlush(t)

  // finalApproval
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
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
      payload: { approved: true, signoffNotes: 'Approved' },
    },
  })
  await waitForFlush(t)
}

/**
 * Helper function to complete Phase 5 (Technical Setup)
 * Completes all parallel tasks, passes QA, and moves to Phase 6
 */
async function completePhase5(t: ReturnType<typeof setup>) {
  // Get all 3 parallel tasks
  let workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )

  // Complete buildInfra
  const buildInfraItem = workQueue.find((w: any) => w.taskType === 'buildInfra')
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId: buildInfraItem!.workItemId,
    args: { name: 'buildInfra' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId: buildInfraItem!.workItemId,
    args: { name: 'buildInfra', payload: { infraReady: true } },
  })
  await waitForFlush(t)

  // Complete configAnalytics
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  const configAnalyticsItem = workQueue.find((w: any) => w.taskType === 'configAnalytics')
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId: configAnalyticsItem!.workItemId,
    args: { name: 'configAnalytics' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId: configAnalyticsItem!.workItemId,
    args: { name: 'configAnalytics', payload: { analyticsConfigured: true } },
  })
  await waitForFlush(t)

  // Complete setupMedia
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  const setupMediaItem = workQueue.find((w: any) => w.taskType === 'setupMedia')
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId: setupMediaItem!.workItemId,
    args: { name: 'setupMedia' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId: setupMediaItem!.workItemId,
    args: { name: 'setupMedia', payload: { mediaReady: true } },
  })
  await waitForFlush(t)

  // qaTest - pass
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId: workQueue[0].workItemId,
    args: { name: 'qaTest' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId: workQueue[0].workItemId,
    args: { name: 'qaTest', payload: { result: 'passed' } },
  })
  await waitForFlush(t)
}

/**
 * Helper function to complete Phase 6 (Launch)
 * Completes: preLaunchReview (ready), launchApproval (approved), internalComms
 */
async function completePhase6(t: ReturnType<typeof setup>) {
  // preLaunchReview - ready for approval
  let workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  let workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'preLaunchReview' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'preLaunchReview',
      payload: { readyForApproval: true },
    },
  })
  await waitForFlush(t)

  // launchApproval - approved
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'launchApproval' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'launchApproval',
      payload: { decision: 'approved', approverNotes: 'Approved' },
    },
  })
  await waitForFlush(t)

  // internalComms
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'internalComms' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'internalComms',
      payload: { communicationsSent: true },
    },
  })
  await waitForFlush(t)
}

/**
 * Helper function to complete Phase 7 (Execution) with 'end' decision
 * Completes: launchCampaign, monitorPerformance, ongoingOptimization (end decision)
 * This triggers Phase 8 Closure instead of looping back to monitoring
 */
async function completePhase7WithEnd(t: ReturnType<typeof setup>) {
  // launchCampaign
  let workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  let workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'launchCampaign' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'launchCampaign',
      payload: {
        launchedAt: Date.now(),
        launchNotes: 'Campaign launched successfully',
      },
    },
  })
  await waitForFlush(t)

  // monitorPerformance
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'monitorPerformance' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'monitorPerformance',
      payload: {
        metrics: [{ metric: 'conversions', value: 500, status: 'on_track' }],
        overallStatus: 'healthy',
      },
    },
  })
  await waitForFlush(t)

  // ongoingOptimization - end decision (triggers Phase 8)
  workQueue = await t.query(
    api.workflows.campaign_approval.api.getCampaignWorkQueue,
    {},
  )
  workItemId = workQueue[0].workItemId

  await t.mutation(api.workflows.campaign_approval.api.startWorkItem, {
    workItemId,
    args: { name: 'ongoingOptimization' },
  })
  await waitForFlush(t)
  await t.mutation(api.workflows.campaign_approval.api.completeWorkItem, {
    workItemId,
    args: {
      name: 'ongoingOptimization',
      payload: {
        optimizations: [
          {
            type: 'budget_reallocation',
            description: 'Final budget optimization',
            expectedImpact: 'Maximize remaining ROI',
            implementedAt: Date.now(),
          },
        ],
        decision: 'end', // End the campaign, trigger Phase 8
      },
    },
  })
  await waitForFlush(t)
}
