/**
 * Integration tests for greeting workflow
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
  setupGreetingAuthorization,
  setupAuthenticatedGreetingUser,
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

describe('Greeting Workflow', () => {
  describe('Happy Path', () => {
    it('completes full greeting workflow from initialize to completion', async () => {
      const t = setup()

      await setupGreetingAuthorization(t)
      await setupAuthenticatedGreetingUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.greeting.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the greeting to find the workflow ID
      const greetings = await t.query(
        api.workflows.greeting.api.getGreetings,
        {},
      )
      expect(greetings.length).toBe(1)
      expect(greetings[0].message).toBe('') // Initially empty

      const workflowId = greetings[0].workflowId

      // Verify the storeGreeting task is enabled via task states
      const taskStates = await t.query(
        api.workflows.greeting.api.greetingWorkflowTaskStates,
        { workflowId },
      )
      expect(taskStates.storeGreeting).toBe('enabled')

      // Get the work item from the work queue
      const workQueue = await t.query(
        api.workflows.greeting.api.getGreetingWorkQueue,
        {},
      )
      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('storeGreeting')

      const workItemId = workQueue[0].workItemId

      // Start the work item
      await t.mutation(api.workflows.greeting.api.startWorkItem, {
        workItemId,
        args: { name: 'storeGreeting' },
      })

      await waitForFlush(t)

      // Verify work item is started via task states
      const startedTaskStates = await t.query(
        api.workflows.greeting.api.greetingWorkflowTaskStates,
        { workflowId },
      )
      expect(startedTaskStates.storeGreeting).toBe('started')

      // Complete the work item with a message
      await t.mutation(api.workflows.greeting.api.completeWorkItem, {
        workItemId,
        args: {
          name: 'storeGreeting',
          payload: { message: 'Hello, World!' },
        },
      })

      await waitForFlush(t)

      // Verify work item is completed via task states
      const completedTaskStates = await t.query(
        api.workflows.greeting.api.greetingWorkflowTaskStates,
        { workflowId },
      )
      expect(completedTaskStates.storeGreeting).toBe('completed')

      // Verify the greeting message was stored
      const updatedGreetings = await t.query(
        api.workflows.greeting.api.getGreetings,
        {},
      )
      expect(updatedGreetings[0].message).toBe('Hello, World!')
    })
  })

  describe('Work Queue', () => {
    it('returns work items for authorized user', async () => {
      const t = setup()

      await setupGreetingAuthorization(t)
      await setupAuthenticatedGreetingUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.greeting.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Check work queue
      const workQueue = await t.query(
        api.workflows.greeting.api.getGreetingWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].taskType).toBe('storeGreeting')
      expect(workQueue[0].status).toBe('pending')
    })

    it('returns empty work queue for unauthenticated user', async () => {
      const t = setup()

      await setupGreetingAuthorization(t)

      // First create a workflow as an authenticated user
      const { authSpies } = await setupAuthenticatedGreetingUser(t)
      await t.mutation(api.workflows.greeting.api.initializeRootWorkflow, {
        payload: {},
      })
      await waitForFlush(t)

      // Restore mock
      authSpies.forEach((spy) => spy.mockRestore())

      // Now check work queue as unauthenticated user
      await setupUnauthenticatedUser(t)

      const workQueue = await t.query(
        api.workflows.greeting.api.getGreetingWorkQueue,
        {},
      )

      // User without proper scopes should see empty queue
      expect(workQueue.length).toBe(0)
    })
  })

  describe('Claim Work Item', () => {
    it('allows authorized user to claim work item', async () => {
      const t = setup()

      await setupGreetingAuthorization(t)
      await setupAuthenticatedGreetingUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.greeting.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the work queue
      const workQueue = await t.query(
        api.workflows.greeting.api.getGreetingWorkQueue,
        {},
      )

      expect(workQueue.length).toBe(1)
      expect(workQueue[0].status).toBe('pending')
      const workItemId = workQueue[0].workItemId

      // Claim the work item - should succeed without error
      await t.mutation(api.workflows.greeting.api.claimGreetingWorkItem, {
        workItemId,
      })

      // After claiming, available work queue is empty (claimed items are not "available")
      const updatedWorkQueue = await t.query(
        api.workflows.greeting.api.getGreetingWorkQueue,
        {},
      )
      expect(updatedWorkQueue.length).toBe(0)

      // But the work item metadata should show the claim
      const metadata = await t.run(async (ctx) => {
        return await ctx.db
          .query('greetingWorkItems')
          .withIndex('by_workItemId', (q) => q.eq('workItemId', workItemId))
          .unique()
      })

      expect(metadata).not.toBeNull()
      expect(metadata?.claim).toBeDefined()
    })
  })

  describe('Get Greeting', () => {
    it('returns greeting by workflow ID', async () => {
      const t = setup()

      await setupGreetingAuthorization(t)
      await setupAuthenticatedGreetingUser(t)

      // Initialize the workflow
      await t.mutation(api.workflows.greeting.api.initializeRootWorkflow, {
        payload: {},
      })

      await waitForFlush(t)

      // Get the greeting
      const greetings = await t.query(
        api.workflows.greeting.api.getGreetings,
        {},
      )

      const greeting = await t.query(api.workflows.greeting.api.getGreeting, {
        workflowId: greetings[0].workflowId,
      })

      expect(greeting).not.toBeNull()
      expect(greeting?.workflowId).toBe(greetings[0].workflowId)
    })
  })
})
