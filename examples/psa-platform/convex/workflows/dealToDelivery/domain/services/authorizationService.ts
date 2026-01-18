/**
 * Authorization Service for Deal to Delivery Workflow
 *
 * Provides authorization helpers that ensure API endpoints and work items
 * are protected by scope-based access control.
 *
 * Pattern: examples/er/convex/workflows/er/domain/services/authorizationService.ts
 * Reference: .review/recipes/psa-platform/specs/02-authorization.md
 */
import type { Id } from "../../../../_generated/dataModel";
import type { QueryCtx } from "../../../../_generated/server";
import { authComponent } from "../../../../auth";
import { assertUserHasScope, type AppScope } from "../../../../authorization";

/**
 * Ensures the current user is an authenticated PSA staff member.
 * Throws an error if the user is not authenticated or doesn't have the required scope.
 *
 * This is the primary authorization helper for Deal to Delivery workflow APIs.
 *
 * @param ctx - Query context
 * @param requiredScope - The scope required (defaults to 'dealToDelivery:staff')
 * @returns The authenticated user's ID
 * @throws Error if user is not authenticated or not authorized
 */
export async function requirePsaStaffMember(
  ctx: QueryCtx,
  requiredScope: AppScope = "dealToDelivery:staff"
): Promise<Id<"users">> {
  const authUser = await authComponent.getAuthUser(ctx);

  await assertUserHasScope(ctx, requiredScope);

  return authUser.userId as Id<"users">;
}

/**
 * Checks if the current user can view deals.
 * Returns user ID if authorized, throws error otherwise.
 *
 * @param ctx - Query context
 * @returns The authenticated user's ID
 * @throws Error if user cannot view deals
 */
export async function requireDealsViewAccess(
  ctx: QueryCtx
): Promise<Id<"users">> {
  return requirePsaStaffMember(ctx, "dealToDelivery:deals:view:own");
}

/**
 * Checks if the current user can create deals.
 * Returns user ID if authorized, throws error otherwise.
 *
 * @param ctx - Query context
 * @returns The authenticated user's ID
 * @throws Error if user cannot create deals
 */
export async function requireDealsCreateAccess(
  ctx: QueryCtx
): Promise<Id<"users">> {
  return requirePsaStaffMember(ctx, "dealToDelivery:deals:create");
}

/**
 * Checks if the current user can edit deals.
 * Returns user ID if authorized, throws error otherwise.
 *
 * @param ctx - Query context
 * @returns The authenticated user's ID
 * @throws Error if user cannot edit deals
 */
export async function requireDealsEditAccess(
  ctx: QueryCtx
): Promise<Id<"users">> {
  return requirePsaStaffMember(ctx, "dealToDelivery:deals:edit:own");
}

/**
 * Checks if the current user has admin rights.
 * Returns true if the user has the admin:users scope.
 *
 * This is used for features like releasing other users' work items.
 *
 * @param ctx - Query context
 * @returns True if user has admin access
 */
export async function hasAdminAccess(ctx: QueryCtx): Promise<boolean> {
  try {
    await assertUserHasScope(ctx, "dealToDelivery:admin:users");
    return true;
  } catch {
    return false;
  }
}
