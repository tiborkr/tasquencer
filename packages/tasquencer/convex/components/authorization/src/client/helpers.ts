import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component";

type MutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runQuery">;
type ActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runQuery">;
type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

type Ctx = MutationCtx | ActionCtx | QueryCtx;

/**
 * Get all groups a user is a member of (direct membership only, no hierarchy)
 */
export async function getUserAuthGroups(
  ctx: Ctx,
  componentApi: ComponentApi,
  userId: string
) {
  return await ctx.runQuery(componentApi.api.getUserAuthGroups, { userId });
}

/**
 * Get all roles assigned to a user (direct + via groups)
 */
export async function getUserAuthRoles(
  ctx: Ctx,
  componentApi: ComponentApi,
  userId: string
) {
  return await ctx.runQuery(componentApi.api.getUserAuthRoles, { userId });
}

/**
 * Get scopes for a specific role
 */
export async function getRoleScopes(
  ctx: Ctx,
  componentApi: ComponentApi,
  roleId: string
) {
  return await ctx.runQuery(componentApi.api.getRoleScopes, { roleId });
}

/**
 * Get all scopes available to a user
 * Traverses: user → groups → roles → scopes
 */
export async function getUserScopes(
  ctx: Ctx,
  componentApi: ComponentApi,
  userId: string
) {
  return await ctx.runQuery(componentApi.api.getUserScopes, { userId });
}

/**
 * Check if a user has a specific scope
 */
export async function userHasScope(
  ctx: Ctx,
  componentApi: ComponentApi,
  userId: string,
  scope: string
) {
  const userScopes = await getUserScopes(ctx, componentApi, userId);
  return userScopes.includes(scope);
}

/**
 * Check if a user is a member of a specific group
 */
export async function userInGroup(
  ctx: Ctx,
  componentApi: ComponentApi,
  userId: string,
  groupId: string
) {
  return await ctx.runQuery(componentApi.api.userInGroup, { userId, groupId });
}

/**
 * Get all members of a group
 */
export async function getGroupMembers(
  ctx: Ctx,
  componentApi: ComponentApi,
  groupId: string
) {
  return await ctx.runQuery(componentApi.api.getGroupMembers, { groupId });
}

/**
 * Get all users who have a specific scope
 */
export async function getUsersWithScope(
  ctx: Ctx,
  componentApi: ComponentApi,
  scope: string
) {
  return await ctx.runQuery(componentApi.api.getUsersWithScope, { scope });
}
