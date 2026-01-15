/// <reference types="vite/client" />
/**
 * Test helper utilities for workflow tests
 */

import { convexTest } from 'convex-test'
import { vi, it } from 'vitest'
import schema from '../schema'
import { authComponent } from '../auth'
import type { Id } from '../_generated/dataModel'
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
 * Create a basic authenticated user with a test organization
 */
export async function setupAuthenticatedUser(t: TestContext) {
  const { userId, organizationId } = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert('organizations', {
      name: 'Test Organization',
      settings: {},
      createdAt: Date.now(),
    })
    const userId = await ctx.db.insert('users', {
      organizationId,
      email: 'test@example.com',
      name: 'Test User',
      role: 'team_member',
      costRate: 5000, // $50/hr in cents
      billRate: 10000, // $100/hr in cents
      skills: [],
      department: 'Engineering',
      location: 'Remote',
      isActive: true,
    })
    return { userId, organizationId }
  })

  const mockAuthUser = makeMockAuthUser(userId as Id<'users'>)

  const safeAuthSpy = vi
    .spyOn(authComponent, 'safeGetAuthUser')
    .mockResolvedValue(mockAuthUser)
  const authSpy = vi
    .spyOn(authComponent, 'getAuthUser')
    .mockResolvedValue(mockAuthUser)

  return { userId, organizationId, authSpies: [safeAuthSpy, authSpy] }
}

// Dummy test to mark this as a test file (prevents Convex deployment)
it('helpers module', () => {})
