/**
 * Integration tests for LUcampaignUapproval workflow
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
  setupUcampaignUapprovalAuthorization,
  setupAuthenticatedUcampaignUapprovalUser,
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

describe('UcampaignUapproval Workflow', () => {
  describe('Happy Path', () => {
    it('completes full LUcampaignUapproval workflow from initialize to completion', async () => {
      const t = setup()

      await setupUcampaignUapprovalAuthorization(t)
      await setupAuthenticatedUcampaignUapprovalUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.LUcampaignUapproval.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the LUcampaignUapproval to find the workflow ID
      const LUcampaignUapprovals = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovals,
        {},
      )
      expect(LUcampaignUapprovals.length).toBe(1)
      expect(LUcampaignUapprovals[0].message).toBe('') // Initially empty

      const workflowId = LUcampaignUapprovals[0].workflowId

      // Verify the storeUcampaignUapproval task is enabled via task states
      const taskStates = await t.query(
        api.workflows.LUcampaignUapproval.api.LUcampaignUapprovalWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.storeUcampaignUapproval).toBe('enabled')

      // Get the work item from the work queue
      const workQueue = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovalWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('storeUcampaignUapproval')

      const workItemId = workQueue[0].workItemId

      // Start the work item
      await t.mutation(api.workflows.LUcampaignUapproval.api.startWorkItem, {
        workItemId,
        args: { name: 'storeUcampaignUapproval' },
      })

      await waitForFlush(t)

      // Verify work item is started via task states
      const startedTaskStates = await t.query(
        api.workflows.LUcampaignUapproval.api.LUcampaignUapprovalWorkflowTaskStates,
        { workflowId },
      )
      expect(startedTaskStates.storeUcampaignUapproval).toBe('started')

      // Complete the work item with a message
      await t.mutation(api.workflows.LUcampaignUapproval.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'storeUcampaignUapproval',
          payload: { message: 'Hello, World!' },
        },
      })

      await waitForFlush(t)

      // Verify work item is completed via task states
      const completedTaskStates = await t.query(
        api.workflows.LUcampaignUapproval.api.LUcampaignUapprovalWorkflowTaskStates,
        { workflowId },
      )
      expect(completedTaskStates.storeUcampaignUapproval).toBe('completed')

      // Verify the LUcampaignUapproval message was stored
      const updatedUcampaignUapprovals = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovals,
        {},
      )
      expect(updatedUcampaignUapprovals[0].message).toBe('Hello, World!')
    })
  })

  describe('Work Queue', () => {
    it('returns work items for authorized user', async () => {
      const t = setup()

      await setupUcampaignUapprovalAuthorization(t)
      await setupAuthenticatedUcampaignUapprovalUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.LUcampaignUapproval.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Check work queue
      const workQueue = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovalWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('storeUcampaignUapproval')
      expect(workQueue[0].status).toBe('pending')
    })

    it('returns empty work queue for unauthenticated user', async () => {
      const t = setup()

      await setupUcampaignUapprovalAuthorization(t)

      // First create a workflow as an authenticated user
      const { authSpies } = await setupAuthenticatedUcampaignUapprovalUser(t)
      await t.mutation(api.workflows.LUcampaignUapproval.api.initializeRootWorkflow, {
        payload: {},
      })
      await waitForFlush(t)

      // Restore mock
      authSpies.forEach((spy) => spy.mockRestore())

      // Now check work queue as unauthenticated user
      await setupUnauthenticatedUser(t)

      const workQueue = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovalWorkQueue,
        {},
      )

      // User without proper scopes should see empty queue
      expect(workQueue.length).toBe(0)
    })
  })

  describe('Claim Work Item', () => {
    it('allows authorized user to claim work item', async () => {
      const t = setup()

      await setupUcampaignUapprovalAuthorization(t)
      await setupAuthenticatedUcampaignUapprovalUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.LUcampaignUapproval.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the work queue
      const workQueue = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovalWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].status).toBe('pending')
      const workItemId = workQueue[0].workItemId

      // Claim the work item - should succeed without error
      await t.mutation(api.workflows.LUcampaignUapproval.api.claimUcampaignUapprovalWorkItem, {
        workItemId,
      })

      // After claiming, available work queue is empty (claimed items are not "available")
      const updatedWorkQueue = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovalWorkQueue,
        {},
      )
      expect(updatedWorkQueue.length).toBe(0)

      // But the work item metadata should show the claim
      const metadata = await t.run(async (ctx) => {
        return await ctx.db
          .query('LUcampaignUapprovalWorkItems')
          .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
          .unique()
      })

      expect(metadata).not.toBeNull()
      expect(metadata?.claim).toBeDefined()
    })
  })

  describe('Get UcampaignUapproval', () => {
    it('returns LUcampaignUapproval by workflow ID', async () => {
      const t = setup()

      await setupUcampaignUapprovalAuthorization(t)
      await setupAuthenticatedUcampaignUapprovalUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.LUcampaignUapproval.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the LUcampaignUapproval
      const LUcampaignUapprovals = await t.query(
        api.workflows.LUcampaignUapproval.api.getUcampaignUapprovals,
        {},
      )

      const LUcampaignUapproval = await t.query(api.workflows.LUcampaignUapproval.api.getUcampaignUapproval, {
        workflowId: LUcampaignUapprovals[0].workflowId,
      })

      expect(LUcampaignUapproval).not.toBeNull()
      expect(LUcampaignUapproval?.workflowId).toBe(LUcampaignUapprovals[0].workflowId)
    })
  })
})
