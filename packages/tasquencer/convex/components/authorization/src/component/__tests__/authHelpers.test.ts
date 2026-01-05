import { setup } from "./setup.test";
import { describe, it, expect } from "vitest";

import { api } from "../_generated/api";

// Helper function to create a test user
async function createTestUser(ctx: any) {
  return await ctx.db.insert("users", {});
}

describe("auth Helpers - User Groups", () => {
  it("should return empty array for user with no groups", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      return await createTestUser(ctx);
    });

    const groups = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthGroups, { userId });
    });

    expect(groups).toEqual([]);
  });

  it("should return active group memberships", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now(),
      });

      return [userId, groupId];
    });

    const groupById = await t.run(async (ctx) => {
      return await ctx.db.get(groupId);
    });

    const groups = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthGroups, { userId });
    });

    expect(groups).toEqual([groupById]);
  });

  it("should filter out expired group memberships", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "expired_group",
        description: "Expired Group",
        isActive: true,
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now() - 10000,
        expiresAt: Date.now() - 5000, // Expired 5 seconds ago
      });

      return userId;
    });

    const groups = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthGroups, { userId });
    });

    expect(groups).toEqual([]);
  });
});

describe("auth Helpers - User Roles", () => {
  it("should return direct role assignments", async () => {
    const t = setup();

    const [userId, roleId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.db.insert("authRoles", {
        name: "test_role",
        description: "Test Role",
        scopes: ["test:read"],
        isActive: true,
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId,
        assignedAt: Date.now(),
      });

      return [userId, roleId];
    });

    const roleById = await t.run(async (ctx) => {
      return await ctx.db.get(roleId);
    });

    const roles = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthRoles, { userId });
    });

    expect(roles).toEqual([roleById]);
  });

  it("should return roles via group memberships", async () => {
    const t = setup();

    const [userId, roleId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      const roleId = await ctx.db.insert("authRoles", {
        name: "test_role",
        description: "Test Role",
        scopes: ["test:read"],
        isActive: true,
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now(),
      });

      await ctx.db.insert("authGroupRoleAssignments", {
        groupId,
        roleId,
        assignedAt: Date.now(),
      });

      return [userId, roleId];
    });

    const roleById = await t.run(async (ctx) => {
      return await ctx.db.get(roleId);
    });

    const roles = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthRoles, { userId });
    });

    expect(roles).toEqual([roleById]);
  });

  it("should combine direct and group role assignments", async () => {
    const t = setup();

    const [userId, directRoleId, groupRoleId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const directRoleId = await ctx.db.insert("authRoles", {
        name: "direct_role",
        description: "Direct Role",
        scopes: ["direct:read"],
        isActive: true,
      });

      const groupRoleId = await ctx.db.insert("authRoles", {
        name: "group_role",
        description: "Group Role",
        scopes: ["group:read"],
        isActive: true,
      });

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      // Direct role assignment
      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId: directRoleId,
        assignedAt: Date.now(),
      });

      // Group membership and role assignment
      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now(),
      });

      await ctx.db.insert("authGroupRoleAssignments", {
        groupId,
        roleId: groupRoleId,
        assignedAt: Date.now(),
      });

      return [userId, directRoleId, groupRoleId];
    });

    const roles = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthRoles, { userId });
    });

    const roleIds = roles.map((r) => r?._id);

    expect(roleIds).toHaveLength(2);
    expect(roleIds).toContain(directRoleId);
    expect(roleIds).toContain(groupRoleId);
  });

  it("should filter out expired direct role assignments", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.db.insert("authRoles", {
        name: "expired_role",
        description: "Expired Role",
        scopes: ["test:read"],
        isActive: true,
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId,
        assignedAt: Date.now() - 10000,
        expiresAt: Date.now() - 5000, // Expired 5 seconds ago
      });

      return userId;
    });

    const roles = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserAuthRoles, { userId });
    });

    expect(roles).toEqual([]);
  });
});

describe("auth Helpers - User Scopes", () => {
  it("should return scopes from user roles", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.db.insert("authRoles", {
        name: "test_role",
        description: "Test Role",
        scopes: ["test:read", "test:write"],
        isActive: true,
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId,
        assignedAt: Date.now(),
      });

      return userId;
    });

    const scopes = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserScopes, { userId });
    });

    expect(scopes).toHaveLength(2);
    expect(scopes).toContain("test:read");
    expect(scopes).toContain("test:write");
  });

  it("should deduplicate scopes from multiple roles", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const role1Id = await ctx.db.insert("authRoles", {
        name: "role1",
        description: "Role 1",
        scopes: ["test:read", "test:write"],
        isActive: true,
      });

      const role2Id = await ctx.db.insert("authRoles", {
        name: "role2",
        description: "Role 2",
        scopes: ["test:read", "test:delete"], // test:read overlaps
        isActive: true,
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId: role1Id,
        assignedAt: Date.now(),
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId: role2Id,
        assignedAt: Date.now(),
      });

      return userId;
    });

    const scopes = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserScopes, { userId });
    });

    expect(scopes).toHaveLength(3);
    expect(scopes).toContain("test:read");
    expect(scopes).toContain("test:write");
    expect(scopes).toContain("test:delete");
  });

  it("should not return scopes from inactive roles", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.db.insert("authRoles", {
        name: "inactive_role",
        description: "Inactive Role",
        scopes: ["test:read"],
        isActive: false, // Inactive
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId,
        assignedAt: Date.now(),
      });

      return userId;
    });

    const scopes = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUserScopes, { userId });
    });

    expect(scopes).toEqual([]);
  });
});

describe("auth Helpers - userInGroup", () => {
  it("should return true if user is in group", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now(),
      });

      return [userId, groupId];
    });

    const inGroup = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.userInGroup, { userId, groupId });
    });

    expect(inGroup).toBe(true);
  });

  it("should return false if user is not in group", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      return [userId, groupId];
    });

    const inGroup = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.userInGroup, { userId, groupId });
    });

    expect(inGroup).toBe(false);
  });

  it("should return false if membership expired", async () => {
    const t = setup();

    const [userId, groupId] = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now() - 10000,
        expiresAt: Date.now() - 5000, // Expired
      });

      return [userId, groupId];
    });

    const inGroup = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.userInGroup, { userId, groupId });
    });

    expect(inGroup).toBe(false);
  });
});

describe("auth Helpers - getGroupMembers", () => {
  it("should return all active members of a group", async () => {
    const t = setup();

    const [groupId, user1Id, user2Id] = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      const user1Id = await createTestUser(ctx);
      const user2Id = await createTestUser(ctx);

      await ctx.db.insert("authUserGroupMembers", {
        userId: user1Id,
        groupId,
        joinedAt: Date.now(),
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId: user2Id,
        groupId,
        joinedAt: Date.now(),
      });

      return [groupId, user1Id, user2Id];
    });

    const members = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getGroupMembers, { groupId });
    });

    expect(members).toHaveLength(2);
    expect(members).toContain(user1Id);
    expect(members).toContain(user2Id);
  });
});

describe("auth Helpers - getUsersWithScope", () => {
  it("should return users with direct role having the scope", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const roleId = await ctx.db.insert("authRoles", {
        name: "test_role",
        description: "Test Role",
        scopes: ["test:read", "test:write"],
        isActive: true,
      });

      await ctx.db.insert("authUserRoleAssignments", {
        userId,
        roleId,
        assignedAt: Date.now(),
      });

      return userId;
    });

    const users = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUsersWithScope, {
        scope: "test:read",
      });
    });

    expect(users).toContain(userId);
  });

  it("should return users with group role having the scope", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      const groupId = await ctx.db.insert("authGroups", {
        name: "test_group",
        description: "Test Group",
        isActive: true,
      });

      const roleId = await ctx.db.insert("authRoles", {
        name: "test_role",
        description: "Test Role",
        scopes: ["test:read"],
        isActive: true,
      });

      await ctx.db.insert("authUserGroupMembers", {
        userId,
        groupId,
        joinedAt: Date.now(),
      });

      await ctx.db.insert("authGroupRoleAssignments", {
        groupId,
        roleId,
        assignedAt: Date.now(),
      });

      return userId;
    });

    const users = await t.run(async (ctx) => {
      return await ctx.runQuery(api.api.getUsersWithScope, {
        scope: "test:read",
      });
    });

    expect(users).toContain(userId);
  });
});
