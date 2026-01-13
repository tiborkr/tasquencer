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
 * Create and authenticate a user with campaign_approval staff role
 */
export async function setupAuthenticatedCampaignUser(t: TestContext) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert('users', {})
  })

  const group = await t.query(
    components.tasquencerAuthorization.api.getGroupByName,
    {
      name: AUTH_CAMPAIGN_GROUPS.CAMPAIGN_TEAM,
    },
  )

  // Find the campaign_approval team group

  if (group) {
    await t.mutation(
      components.tasquencerAuthorization.api.addUserToAuthGroup,
      {
        userId,
        groupId: group._id,
      },
    )
  }

  const role = await t.query(
    components.tasquencerAuthorization.api.getRoleByName,
    {
      name: AUTH_CAMPAIGN_ROLES.CAMPAIGN_STAFF,
    },
  )

  if (role) {
    await t.mutation(
      components.tasquencerAuthorization.api.assignAuthRoleToUser,
      {
        userId,
        roleId: role._id,
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
