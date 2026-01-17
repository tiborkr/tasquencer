/// <reference types="vite/client" />
/**
 * Test helper utilities for workflow tests
 *
 * This module provides:
 * - Test context setup with component registration
 * - Mock authentication utilities
 * - Workflow state assertion helpers
 * - Authorization test utilities
 */

import { convexTest } from 'convex-test'
import { vi, it, expect } from 'vitest'
import schema from '../schema'
import { authComponent } from '../auth'
import type { Id } from '../_generated/dataModel'
import { internal, components } from '../_generated/api'
import { register as registerAuthorization } from '@repo/tasquencer/components/authorization/test'
import { register as registerAudit } from '@repo/tasquencer/components/audit/test'

export const modules = import.meta.glob('../**/*.*s')

export function setup() {
  const t = convexTest(schema, modules)
  registerAuthorization(t, 'tasquencerAuthorization')
  registerAudit(t, 'tasquencerAudit')
  return t
}

export type TestContext = ReturnType<typeof setup>

type AuthUser = Awaited<ReturnType<typeof authComponent.getAuthUser>>

function makeMockAuthUser(userId: Id<'users'>): AuthUser {
  const now = Date.now()
  return {
    _id: 'test-auth-user' as AuthUser['_id'],
    _creationTime: now,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
    userId: userId as unknown as string,
  }
}

/**
 * Wait for flush (allow scheduler to process)
 */
export async function waitForFlush(t: TestContext) {
  await vi.advanceTimersByTimeAsync(1000)
  await t.finishInProgressScheduledFunctions()
}

/**
 * Create a basic authenticated user
 */
export async function setupAuthenticatedUser(t: TestContext) {
  const result = await t.run(async (ctx) => {
    // Create an organization first
    const orgId = await ctx.db.insert('organizations', {
      name: 'Test Organization',
      settings: {},
      createdAt: Date.now(),
    })

    // Create a user with all required fields
    const userId = await ctx.db.insert('users', {
      organizationId: orgId,
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
      costRate: 10000, // $100/hr in cents
      billRate: 15000, // $150/hr in cents
      skills: [],
      department: 'Engineering',
      location: 'Remote',
      isActive: true,
    })

    return { userId, orgId }
  })

  const mockAuthUser = makeMockAuthUser(result.userId as Id<'users'>)

  const safeAuthSpy = vi
    .spyOn(authComponent, 'safeGetAuthUser')
    .mockResolvedValue(mockAuthUser)
  const authSpy = vi
    .spyOn(authComponent, 'getAuthUser')
    .mockResolvedValue(mockAuthUser)

  return {
    userId: result.userId,
    organizationId: result.orgId,
    authSpies: [safeAuthSpy, authSpy],
  }
}

// =============================================================================
// Workflow State Helpers
// =============================================================================

/**
 * Get workflow by ID using internal query
 */
export async function getWorkflow(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>
) {
  return await t.query(internal.testing.tasquencer.getWorkflowById, {
    workflowId,
  })
}

/**
 * Get all tasks for a workflow
 */
export async function getWorkflowTasks(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>
) {
  return await t.query(internal.testing.tasquencer.getWorkflowTasks, {
    workflowId,
  })
}

/**
 * Get tasks by state
 */
export async function getWorkflowTasksByState(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  state: 'disabled' | 'enabled' | 'started' | 'completed' | 'failed' | 'canceled'
) {
  return await t.query(internal.testing.tasquencer.getWorkflowTasksByState, {
    workflowId,
    state,
  })
}

/**
 * Get work items for a task
 */
export async function getTaskWorkItems(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  taskName: string
) {
  return await t.query(internal.testing.tasquencer.getWorkflowTaskWorkItems, {
    workflowId,
    taskName,
  })
}

/**
 * Get work items by state for a workflow
 */
export async function getWorkItemsByState(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  state: 'initialized' | 'started' | 'completed' | 'failed' | 'canceled'
) {
  return await t.query(internal.testing.tasquencer.getWorkItemsByState, {
    workflowId,
    state,
  })
}

// =============================================================================
// Workflow State Assertions
// =============================================================================

type TaskState =
  | 'disabled'
  | 'enabled'
  | 'started'
  | 'completed'
  | 'failed'
  | 'canceled'
type WorkflowState =
  | 'initialized'
  | 'started'
  | 'completed'
  | 'failed'
  | 'canceled'

/**
 * Assert that a workflow is in the expected state
 */
export async function assertWorkflowState(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  expectedState: WorkflowState
) {
  const workflow = await getWorkflow(t, workflowId)
  expect(workflow.state).toBe(expectedState)
}

/**
 * Assert that a task is in the expected state
 */
export async function assertTaskState(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  taskName: string,
  expectedState: TaskState
) {
  const tasks = await getWorkflowTasks(t, workflowId)
  const task = tasks.find((t) => t.name === taskName)
  expect(task).toBeDefined()
  expect(task?.state).toBe(expectedState)
}

/**
 * Assert that specific tasks are in the expected state (batch assertion)
 */
export async function assertTasksInState(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  state: TaskState,
  expectedTaskNames: string[]
) {
  const tasks = await getWorkflowTasksByState(t, workflowId, state)
  const taskNames = new Set(tasks.map((t) => t.name))
  for (const expectedName of expectedTaskNames) {
    expect(taskNames.has(expectedName)).toBe(true)
  }
}

/**
 * Assert exactly which tasks are enabled
 */
export async function assertEnabledTasks(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  expectedTaskNames: string[]
) {
  const tasks = await getWorkflowTasksByState(t, workflowId, 'enabled')
  const taskNames = new Set(tasks.map((t) => t.name))
  expect(taskNames).toEqual(new Set(expectedTaskNames))
}

/**
 * Assert a work item exists in expected state
 */
export async function assertWorkItemState(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>,
  taskName: string,
  expectedState: 'initialized' | 'started' | 'completed' | 'failed' | 'canceled'
) {
  const workItems = await getTaskWorkItems(t, workflowId, taskName)
  expect(workItems.length).toBeGreaterThan(0)
  expect(workItems[0].state).toBe(expectedState)
}

// =============================================================================
// Authorization Test Utilities
// =============================================================================

/**
 * Create an auth group for testing
 */
export async function createTestAuthGroup(
  t: TestContext,
  name: string,
  description = 'Test group'
) {
  return await t.run(async (ctx) => {
    return await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthGroup,
      { name, description }
    )
  })
}

/**
 * Create an auth role with scopes for testing
 */
export async function createTestAuthRole(
  t: TestContext,
  name: string,
  scopes: string[],
  description = 'Test role'
) {
  return await t.run(async (ctx) => {
    return await ctx.runMutation(
      components.tasquencerAuthorization.api.createAuthRole,
      { name, description, scopes }
    )
  })
}

/**
 * Assign a role to a user directly
 */
export async function assignRoleToUser(
  t: TestContext,
  userId: string,
  roleId: string
) {
  return await t.run(async (ctx) => {
    return await ctx.runMutation(
      components.tasquencerAuthorization.api.assignAuthRoleToUser,
      { userId, roleId }
    )
  })
}

/**
 * Add user to a group
 */
export async function addUserToGroup(
  t: TestContext,
  userId: string,
  groupId: string
) {
  return await t.run(async (ctx) => {
    return await ctx.runMutation(
      components.tasquencerAuthorization.api.addUserToAuthGroup,
      { userId, groupId }
    )
  })
}

/**
 * Get user's effective scopes
 */
export async function getUserScopes(t: TestContext, userId: string) {
  return await t.run(async (ctx) => {
    return await ctx.runQuery(
      components.tasquencerAuthorization.api.getUserScopes,
      { userId }
    )
  })
}

/**
 * Assert user has specific scopes
 */
export async function assertUserHasScopes(
  t: TestContext,
  userId: string,
  expectedScopes: string[]
) {
  const scopes = await getUserScopes(t, userId)
  for (const scope of expectedScopes) {
    expect(scopes).toContain(scope)
  }
}

/**
 * Setup a user with specific role and scopes for testing
 */
export async function setupUserWithRole(
  t: TestContext,
  roleName: string,
  scopes: string[]
) {
  const auth = await setupAuthenticatedUser(t)
  const roleId = await createTestAuthRole(t, roleName, scopes)
  await assignRoleToUser(t, auth.userId as unknown as string, roleId)
  return { ...auth, roleId }
}

// =============================================================================
// Domain Entity Helpers
// =============================================================================

/**
 * Get a deal by workflow ID (useful for testing workflow-domain integration)
 */
export async function getDealByWorkflowId(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>
) {
  return await t.query(internal.testing.tasquencer.getDealByWorkflowId, {
    workflowId,
  })
}

/**
 * Get a project by workflow ID (useful for testing workflow-domain integration)
 */
export async function getProjectByWorkflowId(
  t: TestContext,
  workflowId: Id<'tasquencerWorkflows'>
) {
  return await t.query(internal.testing.tasquencer.getProjectByWorkflowId, {
    workflowId,
  })
}

// Dummy test to mark this as a test file (prevents Convex deployment)
it('helpers module', () => {})

it('basic setup works', () => {
  const t = setup()
  expect(t).toBeDefined()
})

it('setupAuthenticatedUser creates user with org', async () => {
  const t = setup()
  const { userId, organizationId } = await setupAuthenticatedUser(t)
  expect(userId).toBeDefined()
  expect(organizationId).toBeDefined()
})
