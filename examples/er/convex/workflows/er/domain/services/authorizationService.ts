import type { Id } from "../../../../_generated/dataModel";
import type { QueryCtx } from "../../../../_generated/server";
import { authComponent } from "../../../../auth";
import { assertUserHasScope, type AppScope } from "../../../../authorization";

/**
 * Ensures the current user is an authenticated ER staff member.
 * Throws an error if the user is not authenticated or doesn't have the required scope.
 *
 * @param ctx - Query context
 * @param requiredScope - The scope required (defaults to 'er:staff')
 * @returns The authenticated user's ID
 * @throws Error if user is not authenticated or not authorized
 */
export async function requireErStaffMember(
  ctx: QueryCtx,
  requiredScope: AppScope = "er:staff"
): Promise<Id<"users">> {
  const authUser = await authComponent.getAuthUser(ctx);

  await assertUserHasScope(ctx, requiredScope);

  return authUser.userId as Id<"users">;
}
