import {
  type GetAuthorizationServiceScopes,
  createSystemScopeModule,
} from '@repo/tasquencer'
import { Authorization } from './tasquencer'
import { authComponent } from './auth'
import type { QueryCtx } from './_generated/server'
import { userHasScope } from '@repo/tasquencer/components/authorization/helpers'
import { components } from './_generated/api'

import { dealToDeliveryScopeModule } from "./workflows/dealToDelivery/scopes";

// Import workflow scope modules here after scaffolding:
// import { workflowScopeModule } from './workflows/<name>/scopes'

const userProvider = Authorization.UserProvider.withGetUser((ctx) => {
  return authComponent.safeGetAuthUser(ctx)
}).withUserToUserId((user) => {
  return user._id
})

/**
 * System Scope Module
 * Defines system-level scopes for application-wide permissions
 */
const systemScopeModule = createSystemScopeModule('system')
  .withScope('admin', {
    description: 'Full administrative access to the system',
    tags: ['system', 'admin'],
  })
  .withScope('read', {
    description: 'Read-only access to system resources',
    tags: ['system', 'read'],
  })
  .withScope('write', {
    description: 'Write access to system resources',
    tags: ['system', 'write'],
  })

/**
 * Application Authorization Service
 * Single service instance that combines all scope modules
 */
export const authService = // Register workflow scope modules here:
// .withScopeModule(workflowScopeModule)
Authorization.Service.make(userProvider)
  .withScopeModule(systemScopeModule).withScopeModule(dealToDeliveryScopeModule)
  .build()

/**
 * Type helper to extract all scope strings from the auth service
 */
export type AppScope = GetAuthorizationServiceScopes<typeof authService>

export async function assertUserHasScope(ctx: QueryCtx, scope: AppScope) {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || !user.userId) {
    throw new Error('User not authenticated')
  }
  const hasScope = await userHasScope(
    ctx,
    components.tasquencerAuthorization,
    user.userId,
    scope,
  )
  if (!hasScope) {
    throw new Error(`User ${user.userId} does not have scope ${scope}`)
  }
}

import type { Id } from './_generated/dataModel'

/**
 * Gets the authenticated user's ID.
 *
 * @throws Error if user is not authenticated
 */
export async function getCurrentUserId(ctx: QueryCtx): Promise<Id<'users'>> {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || !user.userId) {
    throw new Error('User not authenticated')
  }
  return user.userId as Id<'users'>
}

/**
 * Asserts that the authenticated user belongs to the specified organization.
 * This enforces tenant boundary isolation - users can only access data from their own organization.
 *
 * @throws Error if user is not authenticated or doesn't belong to the organization
 */
export async function assertUserInOrganization(
  ctx: QueryCtx,
  organizationId: Id<'organizations'>
) {
  const user = await authComponent.getAuthUser(ctx)
  if (!user || !user.userId) {
    throw new Error('User not authenticated')
  }

  // Get the user's document to check their organizationId
  const userDoc = await ctx.db.get(user.userId as Id<'users'>)
  if (!userDoc) {
    throw new Error('User not found')
  }

  if (userDoc.organizationId !== organizationId) {
    throw new Error('TENANT_BOUNDARY_VIOLATION')
  }
}
