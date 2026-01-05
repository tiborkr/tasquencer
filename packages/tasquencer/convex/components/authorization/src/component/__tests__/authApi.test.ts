import { setup } from "./setup.test";
import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

// Helper function to create a test user
async function createTestUser(ctx: any) {
  return await ctx.db.insert("users", {});
}

describe("auth API - Groups", () => {
  it("should create a group", async () => {
    const t = setup();

    const groupId = await t.mutation(api.api.createAuthGroup, {
      name: "test_group",
      description: "Test Group",
    });

    expect(groupId).toBeDefined();

    const group = await t.query(api.api.getAuthGroup, {
      groupId,
    });

    expect(group).toBeDefined();
    expect(group?.name).toBe("test_group");
    expect(group?.description).toBe("Test Group");
    expect(group?.isActive).toBe(true);
  });

  it("should not allow duplicate group names", async () => {
    const t = setup();

    await t.mutation(api.api.createAuthGroup, {
      name: "duplicate_group",
      description: "First Group",
    });

    await expect(
      t.mutation(api.api.createAuthGroup, {
        name: "duplicate_group",
        description: "Second Group",
      })
    ).rejects.toThrow("already exists");
  });

  it("should update a group", async () => {
    const t = setup();

    const groupId = await t.mutation(api.api.createAuthGroup, {
      name: "original_name",
      description: "Original Description",
    });

    await t.mutation(api.api.updateAuthGroup, {
      groupId,
      description: "Updated Description",
    });

    const group = await t.query(api.api.getAuthGroup, {
      groupId,
    });

    expect(group?.description).toBe("Updated Description");
    expect(group?.name).toBe("original_name");
  });

  it("should delete a group and cascade deletions", async () => {
    const t = setup();

    const groupId = await t.run(async (ctx) => {
      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "group_to_delete",
        description: "Will be deleted",
      });

      const userId = await createTestUser(ctx);

      await ctx.runMutation(api.api.addUserToAuthGroup, {
        userId,
        groupId,
      });

      return groupId;
    });

    await t.mutation(api.api.deleteAuthGroup, {
      groupId,
    });

    const group = await t.query(api.api.getAuthGroup, {
      groupId,
    });

    expect(group).toBeNull();
  });

  it("should list all groups", async () => {
    const t = setup();

    await t.mutation(api.api.createAuthGroup, {
      name: "group1",
      description: "Group 1",
    });

    await t.mutation(api.api.createAuthGroup, {
      name: "group2",
      description: "Group 2",
    });

    const groups = await t.query(api.api.listAuthGroups, {});

    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it("should get group by name", async () => {
    const t = setup();

    await t.mutation(api.api.createAuthGroup, {
      name: "findme",
      description: "Find Me",
    });

    const group = await t.query(api.api.getAuthGroupByName, {
      name: "findme",
    });

    expect(group).toBeDefined();
    expect(group?.name).toBe("findme");
  });
});

describe("auth API - Roles", () => {
  it("should create a role with scopes", async () => {
    const t = setup();

    const roleId = await t.mutation(api.api.createAuthRole, {
      name: "test_role",
      description: "Test Role",
      scopes: ["read:data", "write:data"],
    });

    expect(roleId).toBeDefined();

    const role = await t.query(api.api.getAuthRole, {
      roleId,
    });

    expect(role).toBeDefined();
    expect(role?.name).toBe("test_role");
    expect(role?.scopes).toEqual(["read:data", "write:data"]);
    expect(role?.isActive).toBe(true);
  });

  it("should not allow duplicate role names", async () => {
    const t = setup();

    await t.mutation(api.api.createAuthRole, {
      name: "duplicate_role",
      description: "First Role",
      scopes: ["read"],
    });

    await expect(
      t.mutation(api.api.createAuthRole, {
        name: "duplicate_role",
        description: "Second Role",
        scopes: ["write"],
      })
    ).rejects.toThrow("already exists");
  });

  it("should update a role", async () => {
    const t = setup();

    const roleId = await t.mutation(api.api.createAuthRole, {
      name: "role_to_update",
      description: "Original",
      scopes: ["read"],
    });

    await t.mutation(api.api.updateAuthRole, {
      roleId,
      scopes: ["read", "write"],
    });

    const role = await t.query(api.api.getAuthRole, {
      roleId,
    });

    expect(role?.scopes).toEqual(["read", "write"]);
  });

  it("should delete a role and cascade deletions", async () => {
    const t = setup();

    const roleId = await t.mutation(api.api.createAuthRole, {
      name: "role_to_delete",
      description: "Will be deleted",
      scopes: ["read"],
    });

    await t.mutation(api.api.deleteAuthRole, {
      roleId,
    });

    const role = await t.query(api.api.getAuthRole, {
      roleId,
    });

    expect(role).toBeNull();
  });

  it("should get role by name", async () => {
    const t = setup();

    await t.mutation(api.api.createAuthRole, {
      name: "findme_role",
      description: "Find Me",
      scopes: ["test"],
    });

    const role = await t.query(api.api.getAuthRoleByName, {
      name: "findme_role",
    });

    expect(role).toBeDefined();
    expect(role?.name).toBe("findme_role");
  });
});

describe("auth API - User-Group Membership", () => {
  it("should add user to group", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "membership_group",
        description: "Membership Group",
      });

      return [userId, groupId];
    });

    const membershipId = await t.mutation(api.api.addUserToAuthGroup, {
      userId,
      groupId,
    });

    expect(membershipId).toBeDefined();

    const groups = await t.query(api.api.getUserAuthGroups, {
      userId,
    });

    expect(groups.length).toBe(1);
    expect(groups[0]?._id).toBe(groupId);
  });

  it("should not allow duplicate memberships", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "duplicate_membership",
        description: "Test",
      });

      await ctx.runMutation(api.api.addUserToAuthGroup, {
        userId,
        groupId,
      });

      return [userId, groupId];
    });

    await expect(
      t.mutation(api.api.addUserToAuthGroup, {
        userId,
        groupId,
      })
    ).rejects.toThrow("already a member");
  });

  it("should remove user from group", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "remove_membership",
        description: "Test",
      });

      await ctx.runMutation(api.api.addUserToAuthGroup, {
        userId,
        groupId,
      });

      return [userId, groupId];
    });

    await t.mutation(api.api.removeUserFromAuthGroup, {
      userId,
      groupId,
    });

    const groups = await t.query(api.api.getUserAuthGroups, {
      userId,
    });

    expect(groups.length).toBe(0);
  });
});

describe("auth API - Group-Role Assignments", () => {
  it("should assign role to group", async () => {
    const t = setup();

    const [groupId, roleId] = await t.run(async (ctx) => {
      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "role_assignment_group",
        description: "Test",
      });

      const roleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "role_assignment_role",
        description: "Test",
        scopes: ["test"],
      });

      return [groupId, roleId];
    });

    const assignmentId = await t.mutation(api.api.assignAuthRoleToGroup, {
      groupId,
      roleId,
    });

    expect(assignmentId).toBeDefined();

    const roles = await t.query(api.api.getAuthGroupRoles, {
      groupId,
    });

    expect(roles.length).toBe(1);
    expect(roles[0]?._id).toBe(roleId);
  });

  it("should not allow duplicate role assignments to group", async () => {
    const t = setup();

    const [groupId, roleId] = await t.run(async (ctx) => {
      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "duplicate_role_group",
        description: "Test",
      });

      const roleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "duplicate_role",
        description: "Test",
        scopes: ["test"],
      });

      await ctx.runMutation(api.api.assignAuthRoleToGroup, {
        groupId,
        roleId,
      });

      return [groupId, roleId];
    });

    await expect(
      t.mutation(api.api.assignAuthRoleToGroup, {
        groupId,
        roleId,
      })
    ).rejects.toThrow("already assigned");
  });

  it("should remove role from group", async () => {
    const t = setup();

    const [groupId, roleId] = await t.run(async (ctx) => {
      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "remove_role_group",
        description: "Test",
      });

      const roleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "remove_role",
        description: "Test",
        scopes: ["test"],
      });

      await ctx.runMutation(api.api.assignAuthRoleToGroup, {
        groupId,
        roleId,
      });

      return [groupId, roleId];
    });

    await t.mutation(api.api.removeAuthRoleFromGroup, {
      groupId,
      roleId,
    });

    const roles = await t.query(api.api.getAuthGroupRoles, {
      groupId,
    });

    expect(roles.length).toBe(0);
  });
});

describe("auth API - User-Role Assignments", () => {
  it("should assign role directly to user", async () => {
    const t = setup();

    const [userId, roleId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "direct_user_role",
        description: "Test",
        scopes: ["test"],
      });

      return [userId, roleId];
    });

    const assignmentId = await t.mutation(api.api.assignAuthRoleToUser, {
      userId,
      roleId,
    });

    expect(assignmentId).toBeDefined();

    const roles = await t.query(api.api.getUserAuthRoles, {
      userId,
    });

    expect(roles.length).toBe(1);
    expect(roles[0]?._id).toBe(roleId);
  });

  it("should get user roles including group roles", async () => {
    const t = setup();

    const [userId, directRoleId, groupRoleId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create group and assign role to it
      const groupId = await ctx.runMutation(api.api.createAuthGroup, {
        name: "user_roles_group",
        description: "Test",
      });

      const groupRoleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "group_role",
        description: "Test",
        scopes: ["group:read"],
      });

      await ctx.runMutation(api.api.assignAuthRoleToGroup, {
        groupId,
        roleId: groupRoleId,
      });

      // Add user to group
      await ctx.runMutation(api.api.addUserToAuthGroup, {
        userId,
        groupId,
      });

      // Create direct role and assign to user
      const directRoleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "direct_role",
        description: "Test",
        scopes: ["direct:read"],
      });

      await ctx.runMutation(api.api.assignAuthRoleToUser, {
        userId,
        roleId: directRoleId,
      });

      return [userId, directRoleId, groupRoleId];
    });

    const roles = await t.query(api.api.getUserAuthRoles, {
      userId,
    });

    expect(roles.length).toBe(2);
    const roleIds = roles.map((r) => r?._id);
    expect(roleIds).toContain(directRoleId);
    expect(roleIds).toContain(groupRoleId);
  });

  it("should remove role from user", async () => {
    const t = setup();

    const [userId, roleId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.runMutation(api.api.createAuthRole, {
        name: "remove_user_role",
        description: "Test",
        scopes: ["test"],
      });

      await ctx.runMutation(api.api.assignAuthRoleToUser, {
        userId,
        roleId,
      });

      return [userId, roleId];
    });

    await t.mutation(api.api.removeAuthRoleFromUser, {
      userId,
      roleId,
    });

    const roles = await t.query(api.api.getUserAuthRoles, {
      userId,
    });

    expect(roles.length).toBe(0);
  });
});
