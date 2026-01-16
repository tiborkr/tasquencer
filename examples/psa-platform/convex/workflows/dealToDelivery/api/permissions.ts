/**
 * Permissions API
 *
 * Pre-flight authorization checks for the Deal to Delivery workflow.
 * UI components use these to determine what actions are available
 * before attempting them.
 *
 * Reference: .review/recipes/psa-platform/specs/02-authorization.md
 * Pattern: examples/er/convex/workflows/er/api/permissions.ts
 */
import { v } from 'convex/values'
import { query } from '../../../_generated/server'

// TODO: Import these once implemented (PRIORITY 2)
// import { assertUserHasScope } from '../domain/services/authorizationService'
// import { DealToDeliveryWorkItemHelpers } from '../helpers'
// import { authComponent } from '../../../tasquencer'

/**
 * Checks if the current user can create a new deal.
 * Used by UI to show/hide the "New Deal" button.
 *
 * @returns true if user has deals:create scope
 */
export const canCreateDeal = query({
  handler: async (_ctx) => {
    // TODO: Implement once authSetup is complete (PRIORITY 2)
    // try {
    //   await assertUserHasScope(ctx, 'deals:create')
    //   return true
    // } catch {
    //   return false
    // }

    // Stub: Allow all authenticated users until auth is implemented
    return true
  },
})

/**
 * Checks if the current user can claim a specific work item.
 * Used by UI to show/hide the "Claim" button on work items.
 *
 * @param args.workItemId - The work item to check
 * @returns true if user can claim the work item
 */
export const canClaimWorkItem = query({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (_ctx, _args) => {
    // TODO: Implement once authSetup is complete (PRIORITY 2)
    // const authUser = await authComponent.safeGetAuthUser(ctx)
    // if (!authUser) return false
    // return DealToDeliveryWorkItemHelpers.canUserClaimWorkItem(
    //   ctx,
    //   authUser.userId,
    //   args.workItemId
    // )

    // Stub: Allow all authenticated users until auth is implemented
    return true
  },
})

/**
 * Checks if the current user can complete a specific work item.
 * Used by UI to show/hide the "Complete" button on work items.
 *
 * @param args.workItemId - The work item to check
 * @returns true if user can complete the work item
 */
export const canCompleteWorkItem = query({
  args: { workItemId: v.id('tasquencerWorkItems') },
  handler: async (_ctx, _args) => {
    // TODO: Implement once authSetup is complete (PRIORITY 2)
    // Only the user who claimed the work item can complete it
    // const authUser = await authComponent.safeGetAuthUser(ctx)
    // if (!authUser) return false
    // return DealToDeliveryWorkItemHelpers.canUserCompleteWorkItem(
    //   ctx,
    //   authUser.userId,
    //   args.workItemId
    // )

    // Stub: Allow all authenticated users until auth is implemented
    return true
  },
})

/**
 * Checks if the current user has a specific scope.
 * General-purpose scope check for UI feature flags.
 *
 * @param args.scope - The scope to check
 * @returns true if user has the scope
 */
export const hasScope = query({
  args: { scope: v.string() },
  handler: async (_ctx, _args) => {
    // TODO: Implement once authSetup is complete (PRIORITY 2)
    // try {
    //   await assertUserHasScope(ctx, args.scope)
    //   return true
    // } catch {
    //   return false
    // }

    // Stub: Allow all scopes until auth is implemented
    return true
  },
})
