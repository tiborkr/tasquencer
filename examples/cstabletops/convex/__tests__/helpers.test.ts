/// <reference types="vite/client" />
/**
 * Test helper utilities for cstabletops workflow tests
 */

import { convexTest } from 'convex-test'
import { vi, it } from 'vitest'
import schema from '../schema'
import { authComponent } from '../auth'
import { internal, components } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { AUTH_CSTABLETOPS_ROLES } from '../workflows/cstabletops/authSetup'
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

export async function createUser(t: TestContext, props?: { email?: string }) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('users', {
      ...(props?.email ? { email: props.email } : {}),
    })
  })
}

export function createAuthSpies() {
  const safeAuthSpy = vi.spyOn(authComponent, 'safeGetAuthUser')
  const authSpy = vi.spyOn(authComponent, 'getAuthUser')

  const setUser = (userId: Id<'users'>) => {
    const mockAuthUser = makeMockAuthUser(userId)
    safeAuthSpy.mockResolvedValue(mockAuthUser)
    authSpy.mockResolvedValue(mockAuthUser)
  }

  return { setUser, authSpies: [safeAuthSpy, authSpy] }
}

/**
 * Wait for flush (allow scheduler to process)
 */
export async function waitForFlush(t: TestContext) {
  await vi.advanceTimersByTimeAsync(1000)
  await t.finishInProgressScheduledFunctions()
}

/**
 * Setup cstabletops authorization (roles and groups)
 */
export async function setupCstabletopsAuthorization(t: TestContext) {
  await t.mutation(
    internal.workflows.cstabletops.authSetup.setupAuthCstabletopsAuthorization,
    {},
  )
}

/**
 * Create and authenticate a user with cstabletops staff role
 */
export async function setupAuthenticatedCstabletopsUser(t: TestContext) {
  const userId = await createUser(t)

  const role = await t.query(
    components.tasquencerAuthorization.api.getRoleByName,
    {
      name: AUTH_CSTABLETOPS_ROLES.CSTABLETOPS_FACILITATOR,
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

  const auth = createAuthSpies()
  auth.setUser(userId as Id<'users'>)

  return { userId, authSpies: auth.authSpies }
}

/**
 * Create an unauthenticated user (no roles or groups)
 */
export async function setupUnauthenticatedUser(t: TestContext) {
  const userId = await createUser(t)

  const auth = createAuthSpies()
  auth.setUser(userId as Id<'users'>)

  return { userId, authSpies: auth.authSpies }
}

// Dummy test to mark this as a test file (prevents Convex deployment)
it('helpers module', () => {})
