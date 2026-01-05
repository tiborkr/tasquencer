import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// auth tables - scope-based authorization system
const authGroups = defineTable({
  name: v.string(),
  description: v.string(),
  isActive: v.boolean(),
  metadata: v.optional(v.any()),
})
  .index("by_name", ["name"])
  .index("by_isActive", ["isActive"]);

const authRoles = defineTable({
  name: v.string(),
  description: v.string(),
  scopes: v.array(v.string()),
  isActive: v.boolean(),
  metadata: v.optional(v.any()),
})
  .index("by_name", ["name"])
  .index("by_isActive", ["isActive"]);

const authUserGroupMembers = defineTable({
  userId: v.string(),
  groupId: v.id("authGroups"),
  joinedAt: v.number(),
  expiresAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"])
  .index("by_groupId", ["groupId"])
  .index("by_userId_groupId", ["userId", "groupId"]);

const authGroupRoleAssignments = defineTable({
  groupId: v.id("authGroups"),
  roleId: v.id("authRoles"),
  assignedAt: v.number(),
  assignedBy: v.optional(v.string()),
})
  .index("by_groupId", ["groupId"])
  .index("by_roleId", ["roleId"])
  .index("by_groupId_roleId", ["groupId", "roleId"]);

const authUserRoleAssignments = defineTable({
  userId: v.string(),
  roleId: v.id("authRoles"),
  assignedAt: v.number(),
  assignedBy: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"])
  .index("by_roleId", ["roleId"])
  .index("by_userId_roleId", ["userId", "roleId"]);

export default defineSchema({
  authGroups,
  authRoles,
  authUserGroupMembers,
  authGroupRoleAssignments,
  authUserRoleAssignments,
});
