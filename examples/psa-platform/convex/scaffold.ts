/**
 * PSA Platform Superadmin Bootstrap
 *
 * Scaffolds initial superadmin access for the first user.
 * This is an idempotent operation - safe to run multiple times.
 *
 * Reference: examples/er/convex/scaffold.ts
 * Spec: .review/recipes/psa-platform/specs/02-authorization.md
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { authService } from "./authorization";
import { components } from "./_generated/api";
import { listAllUsers, getUserByEmailAnyOrg } from "./scaffold/helpers";

/**
 * Bootstrap superadmin role for the first user.
 *
 * This function:
 * 1. Verifies exactly one user exists (initial bootstrap scenario)
 * 2. Collects all scopes from the authService (code-defined)
 * 3. Creates or updates the "superadmin" role with all scopes
 * 4. Assigns the role to the user
 *
 * Idempotent: If the role exists, it syncs scopes to match code.
 * If the user already has the role, it's a no-op.
 */
export const scaffoldSuperadmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Check if there's exactly one user (initial bootstrap)
    const users = await listAllUsers(ctx.db);
    if (users.length !== 1) {
      throw new Error(
        `Expected exactly 1 user for initial bootstrap, found ${users.length}. ` +
          `This function should only be run during initial setup.`
      );
    }
    const user = users[0];

    // 2. Get all registered scopes from authService (dynamically from code)
    const allScopes = Object.keys(authService.scopes);

    // 3. Check if superadmin role already exists
    const existingRole = await ctx.runQuery(
      components.tasquencerAuthorization.api.getAuthRoleByName,
      { name: "superadmin" }
    );

    let roleId: string;
    let created = false;
    let synced = false;

    if (existingRole) {
      // Role exists - sync scopes to match code-defined scopes
      await ctx.runMutation(
        components.tasquencerAuthorization.api.updateAuthRole,
        { roleId: existingRole._id, scopes: allScopes }
      );
      roleId = existingRole._id;
      synced = true;
    } else {
      // Create new superadmin role with all scopes
      roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "superadmin",
          description: "Full access to all system and workflow scopes",
          scopes: allScopes,
        }
      );
      created = true;
    }

    // 4. Check if user already has the superadmin role
    const existingAssignments = await ctx.runQuery(
      components.tasquencerAuthorization.api.getUserAuthRoleAssignments,
      { userId: user._id }
    );

    const hasSuperadminRole = existingAssignments.some(
      (assignment) => assignment.roleId === roleId
    );

    let assigned = false;
    if (!hasSuperadminRole) {
      // Assign superadmin role directly to user
      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        { userId: user._id, roleId: roleId }
      );
      assigned = true;
    }

    return {
      userId: user._id,
      userEmail: user.email,
      roleId,
      scopeCount: allScopes.length,
      created,
      synced,
      assigned,
    };
  },
});

/**
 * Bootstrap superadmin for a specific user by email.
 *
 * Use this when you need to grant superadmin to a specific user
 * in a multi-user environment, or when the single-user check
 * doesn't apply.
 */
export const scaffoldSuperadminForUser = internalMutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Find user by email
    const user = await getUserByEmailAnyOrg(ctx.db, args.email);

    if (!user) {
      throw new Error(`User with email ${args.email} not found`);
    }

    // 2. Get all registered scopes from authService
    const allScopes = Object.keys(authService.scopes);

    // 3. Check if superadmin role already exists
    const existingRole = await ctx.runQuery(
      components.tasquencerAuthorization.api.getAuthRoleByName,
      { name: "superadmin" }
    );

    let roleId: string;
    let created = false;
    let synced = false;

    if (existingRole) {
      // Role exists - sync scopes
      await ctx.runMutation(
        components.tasquencerAuthorization.api.updateAuthRole,
        { roleId: existingRole._id, scopes: allScopes }
      );
      roleId = existingRole._id;
      synced = true;
    } else {
      // Create new superadmin role
      roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "superadmin",
          description: "Full access to all system and workflow scopes",
          scopes: allScopes,
        }
      );
      created = true;
    }

    // 4. Check existing assignments
    const existingAssignments = await ctx.runQuery(
      components.tasquencerAuthorization.api.getUserAuthRoleAssignments,
      { userId: user._id }
    );

    const hasSuperadminRole = existingAssignments.some(
      (assignment) => assignment.roleId === roleId
    );

    let assigned = false;
    if (!hasSuperadminRole) {
      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        { userId: user._id, roleId: roleId }
      );
      assigned = true;
    }

    return {
      userId: user._id,
      userEmail: user.email,
      roleId,
      scopeCount: allScopes.length,
      created,
      synced,
      assigned,
    };
  },
});

/**
 * Sync superadmin role scopes with code-defined scopes.
 *
 * Use this after adding new scopes to the authService to
 * ensure the superadmin role has all permissions.
 */
export const syncSuperadminScopes = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all registered scopes
    const allScopes = Object.keys(authService.scopes);

    // Find superadmin role
    const existingRole = await ctx.runQuery(
      components.tasquencerAuthorization.api.getAuthRoleByName,
      { name: "superadmin" }
    );

    if (!existingRole) {
      throw new Error(
        "Superadmin role not found. Run scaffoldSuperadmin first."
      );
    }

    // Update role scopes
    await ctx.runMutation(
      components.tasquencerAuthorization.api.updateAuthRole,
      { roleId: existingRole._id, scopes: allScopes }
    );

    return {
      roleId: existingRole._id,
      scopeCount: allScopes.length,
      synced: true,
    };
  },
});
