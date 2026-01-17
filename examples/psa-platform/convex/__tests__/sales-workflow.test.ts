/// <reference types="vite/client" />
/**
 * Sales Phase Workflow Integration Tests
 *
 * These tests verify the deal-to-delivery workflow execution through the sales phase.
 * Tests follow the contract defined in specs/03-workflow-sales-phase.md.
 *
 * Reference: .review/recipes/psa-platform/specs/03-workflow-sales-phase.md
 */

import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest'
import {
  setup,
  setupAuthenticatedUser,
  getTaskWorkItems,
  assertWorkflowState,
  assertTaskState,
  type TestContext,
} from './helpers.test'
import { internal } from '../_generated/api'

// Store the test context at module level so we can access it in helpers
let testContext: TestContext

beforeEach(async () => {
  vi.useFakeTimers()
  testContext = setup()

  // Set up authenticated user with organization
  await setupAuthenticatedUser(testContext)
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Wait for async workflow operations to complete.
 * Composite tasks (sub-workflows) need multiple rounds of scheduler processing.
 */
async function flushWorkflow(t: TestContext, rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await vi.advanceTimersByTimeAsync(1000)
    await t.finishInProgressScheduledFunctions()
  }
}

describe('Deal-to-Delivery Workflow Initialization', () => {
  it('initializes workflow and creates sales phase composite task', async () => {
    // Initialize the root workflow
    const workflowId = await testContext.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        payload: {
          dealName: 'Test Deal',
          clientName: 'Test Company',
          estimatedValue: 100000,
        },
      }
    )

    expect(workflowId).toBeDefined()

    // Wait for workflow initialization to complete (multiple rounds for composite tasks)
    await flushWorkflow(testContext, 10)

    // Verify the root workflow is in initialized state
    // (Workflows transition to 'started' when a work item is started, not on initialization)
    await assertWorkflowState(testContext, workflowId, 'initialized')

    // Verify the sales composite task is enabled (child workflow was created)
    await assertTaskState(testContext, workflowId, 'sales', 'enabled')
  })

  it('creates salesPhase sub-workflow with createDeal task enabled', async () => {
    // Initialize the root workflow
    const workflowId = await testContext.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        payload: {
          dealName: 'Test Deal',
          clientName: 'Test Company',
          estimatedValue: 100000,
        },
      }
    )

    await flushWorkflow(testContext, 10)

    // Get the sales composite task's child workflow
    const salesWorkflows = await testContext.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      { workflowId, taskName: 'sales' }
    )

    expect(salesWorkflows.length).toBe(1)
    const salesWorkflowId = salesWorkflows[0]._id

    // Verify the salesPhase child workflow is in initialized state
    const salesWorkflow = await testContext.query(
      internal.testing.tasquencer.getWorkflowById,
      { workflowId: salesWorkflowId }
    )
    expect(salesWorkflow.state).toBe('initialized')

    // Verify createDeal task is enabled in the salesPhase workflow
    await assertTaskState(testContext, salesWorkflowId, 'createDeal', 'enabled')

    // Work items are not auto-created. They require explicit initializeWorkItem call.
    // This is the correct behavior - the UI will call initializeWorkItem when needed.
    const workItems = await getTaskWorkItems(
      testContext,
      salesWorkflowId,
      'createDeal'
    )
    expect(workItems.length).toBe(0)
  })
})
