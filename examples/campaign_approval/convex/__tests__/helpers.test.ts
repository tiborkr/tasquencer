/// <reference types="vite/client" />
/**
 * Test helper utilities for campaign_approval workflow tests
 */

import { convexTest } from 'convex-test'
import { vi, it } from 'vitest'
import schema from '../schema'
import { authComponent } from '../auth'
import { internal, components } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import {
  AUTH_CAMPAIGN_GROUPS,
  AUTH_CAMPAIGN_ROLES,
} from '../workflows/campaign_approval/authSetup'
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
 * Setup campaign_approval authorization (roles and groups)
 */
export async function setupCampaignApprovalAuthorization(t: TestContext) {
  await t.mutation(
    internal.workflows.campaign_approval.authSetup.setupCampaignApprovalAuthorization,
    {},
  )
}

/**
 * Create and authenticate a user with multiple campaign_approval roles
 * Gives user comprehensive roles to complete full workflow testing:
 * - CAMPAIGN_REQUESTER: for submitting requests (Phase 1)
 * - CAMPAIGN_COORDINATOR: for intake review and management (Phase 1-2)
 * - CAMPAIGN_EXECUTIVE: for budget approvals (Phase 3) - includes both low and high budget approve scopes
 */
export async function setupAuthenticatedCampaignUser(t: TestContext) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {})
  })

  // Add user to marketing_coordinators group
  const coordinatorsGroup = await t.query(
    components.tasquencerAuthorization.api.getGroupByName,
    {
      name: AUTH_CAMPAIGN_GROUPS.MARKETING_COORDINATORS,
    },
  )

  if (coordinatorsGroup) {
    await t.mutation(
      components.tasquencerAuthorization.api.addUserToAuthGroup,
      {
        userId,
        groupId: coordinatorsGroup._id,
      },
    )
  }

  // Add user to marketing_requesters group (for submitRequest task)
  const requestersGroup = await t.query(
    components.tasquencerAuthorization.api.getGroupByName,
    {
      name: AUTH_CAMPAIGN_GROUPS.MARKETING_REQUESTERS,
    },
  )

  if (requestersGroup) {
    await t.mutation(
      components.tasquencerAuthorization.api.addUserToAuthGroup,
      {
        userId,
        groupId: requestersGroup._id,
      },
    )
  }

  // Add user to marketing_executives group (for budget approval tasks)
  const executivesGroup = await t.query(
    components.tasquencerAuthorization.api.getGroupByName,
    {
      name: AUTH_CAMPAIGN_GROUPS.MARKETING_EXECUTIVES_GROUP,
    },
  )

  if (executivesGroup) {
    await t.mutation(
      components.tasquencerAuthorization.api.addUserToAuthGroup,
      {
        userId,
        groupId: executivesGroup._id,
      },
    )
  }

  // Assign CAMPAIGN_COORDINATOR role
  const coordinatorRole = await t.query(
    components.tasquencerAuthorization.api.getRoleByName,
    {
      name: AUTH_CAMPAIGN_ROLES.CAMPAIGN_COORDINATOR,
    },
  )

  if (coordinatorRole) {
    await t.mutation(
      components.tasquencerAuthorization.api.assignAuthRoleToUser,
      {
        userId,
        roleId: coordinatorRole._id,
      },
    )
  }

  // Assign CAMPAIGN_REQUESTER role (for submitRequest task)
  const requesterRole = await t.query(
    components.tasquencerAuthorization.api.getRoleByName,
    {
      name: AUTH_CAMPAIGN_ROLES.CAMPAIGN_REQUESTER,
    },
  )

  if (requesterRole) {
    await t.mutation(
      components.tasquencerAuthorization.api.assignAuthRoleToUser,
      {
        userId,
        roleId: requesterRole._id,
      },
    )
  }

  // Assign CAMPAIGN_EXECUTIVE role (for budget approval tasks - includes both low and high budget approval)
  const executiveRole = await t.query(
    components.tasquencerAuthorization.api.getRoleByName,
    {
      name: AUTH_CAMPAIGN_ROLES.CAMPAIGN_EXECUTIVE,
    },
  )

  if (executiveRole) {
    await t.mutation(
      components.tasquencerAuthorization.api.assignAuthRoleToUser,
      {
        userId,
        roleId: executiveRole._id,
      },
    )
  }

  const mockAuthUser = makeMockAuthUser(userId as Id<'users'>)

  const safeAuthSpy = vi
    .spyOn(authComponent, 'safeGetAuthUser')
    .mockResolvedValue(mockAuthUser)
  const authSpy = vi
    .spyOn(authComponent, 'getAuthUser')
    .mockResolvedValue(mockAuthUser)

  return { userId, authSpies: [safeAuthSpy, authSpy] }
}

/**
 * Create an unauthenticated user (no roles or groups)
 */
export async function setupUnauthenticatedUser(t: TestContext) {
  const { userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {})
    return { userId }
  })

  const mockAuthUser = makeMockAuthUser(userId as Id<'users'>)

  const safeAuthSpy = vi
    .spyOn(authComponent, 'safeGetAuthUser')
    .mockResolvedValue(mockAuthUser)
  const authSpy = vi
    .spyOn(authComponent, 'getAuthUser')
    .mockResolvedValue(mockAuthUser)

  return { userId, authSpies: [safeAuthSpy, authSpy] }
}

// Dummy test to mark this as a test file (prevents Convex deployment)
it('helpers module', () => {})
