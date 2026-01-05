import { internalMutation } from "./_generated/server";
import { authService } from "./authorization";
import { components } from "./_generated/api";

export const scaffoldSuperadmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Check if there's exactly one user
    const users = await ctx.db.query("users").collect();
    if (users.length !== 1) {
      throw new Error(`Expected exactly 1 user, found ${users.length}`);
    }
    const user = users[0];

    // 2. Get all registered scopes from authService
    const allScopes = Object.keys(authService.scopes);

    const existingRole = await ctx.runQuery(
      components.tasquencerAuthorization.api.getAuthRoleByName,
      { name: "superadmin" }
    );

    let roleId: string;

    if (existingRole) {
      // Sync scopes if role exists - update to match code-defined scopes
      await ctx.runMutation(
        components.tasquencerAuthorization.api.updateAuthRole,
        { roleId: existingRole._id, scopes: allScopes }
      );
      roleId = existingRole._id;
    } else {
      roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "superadmin",
          description: "Full access to all system scopes",
          scopes: allScopes,
        }
      );
      // Create new superadmin role
    }

    // 4. Check if user already has this role assigned
    const existingAssignment = await ctx.runQuery(
      components.tasquencerAuthorization.api.getUserAuthRoleAssignments,
      { userId: user._id }
    );

    const hasSuperadminRole = existingAssignment.some(
      (assignment) => assignment.roleId === roleId
    );

    if (!hasSuperadminRole) {
      // Assign role directly to user
      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        { userId: user._id, roleId: roleId }
      );
    }

    return {
      userId: user._id,
      roleId,
      scopeCount: allScopes.length,
      created: !existingRole,
      synced: !!existingRole,
    };
  },
});
