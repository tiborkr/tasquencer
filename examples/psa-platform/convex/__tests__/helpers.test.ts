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

  return { userId: result.userId, organizationId: result.orgId, authSpies: [safeAuthSpy, authSpy] }
}

// Dummy test to mark this as a test file (prevents Convex deployment)
it('helpers module', () => {})
