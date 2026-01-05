import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import * as impl from "./apiImpl";
import schema from "./schema";

const authGroupsDoc = schema.tables.authGroups.validator.extend({
  _id: v.id("authGroups"),
  _creationTime: v.number(),
});

const authRolesDoc = schema.tables.authRoles.validator.extend({
  _id: v.id("authRoles"),
  _creationTime: v.number(),
});

const authUserGroupMembersDoc =
  schema.tables.authUserGroupMembers.validator.extend({
    _id: v.id("authUserGroupMembers"),
    _creationTime: v.number(),
  });

const authGroupRoleAssignmentsDoc =
  schema.tables.authGroupRoleAssignments.validator.extend({
    _id: v.id("authGroupRoleAssignments"),
    _creationTime: v.number(),
  });

const authUserRoleAssignmentsDoc =
  schema.tables.authUserRoleAssignments.validator.extend({
    _id: v.id("authUserRoleAssignments"),
    _creationTime: v.number(),
  });

export const createAuthGroup = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    metadata: v.optional(v.any()),
  },
  returns: v.id("authGroups"),
  handler: async (ctx, args) => {
    return await impl.createAuthGroup(ctx.db, args);
  },
});

export const updateAuthGroup = mutation({
  args: {
    groupId: v.id("authGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.updateAuthGroup(ctx.db, args);
  },
});
export const deleteAuthGroup = mutation({
  args: {
    groupId: v.id("authGroups"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.deleteAuthGroup(ctx.db, args.groupId);
  },
});

export const listAuthGroups = query({
  args: {
    isActive: v.optional(v.boolean()),
  },
  returns: v.array(authGroupsDoc),
  handler: async (ctx, args) => {
    return await impl.listAuthGroups(ctx.db, args.isActive);
  },
});

export const getAuthGroup = query({
  args: {
    groupId: v.id("authGroups"),
  },
  returns: v.nullable(authGroupsDoc),
  handler: async (ctx, args) => {
    return await impl.getAuthGroup(ctx.db, args.groupId);
  },
});

export const getAuthGroupByName = query({
  args: {
    name: v.string(),
  },
  returns: v.nullable(authGroupsDoc),
  handler: async (ctx, args) => {
    return await impl.getAuthGroupByName(ctx.db, args.name);
  },
});

// ========================================
// Role Management
// ========================================

export const createAuthRole = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    scopes: v.array(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("authRoles"),
  handler: async (ctx, args) => {
    return await impl.createAuthRole(ctx.db, args);
  },
});

export const updateAuthRole = mutation({
  args: {
    roleId: v.id("authRoles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.updateAuthRole(ctx.db, args);
  },
});

export const deleteAuthRole = mutation({
  args: {
    roleId: v.id("authRoles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.deleteAuthRole(ctx.db, args.roleId);
  },
});

export const listAuthRoles = query({
  args: {
    isActive: v.optional(v.boolean()),
  },
  returns: v.array(authRolesDoc),
  handler: async (ctx, args) => {
    return await impl.listAuthRoles(ctx.db, args.isActive);
  },
});

export const getAuthRole = query({
  args: {
    roleId: v.id("authRoles"),
  },
  returns: v.nullable(authRolesDoc),
  handler: async (ctx, args) => {
    return await impl.getAuthRole(ctx.db, args.roleId);
  },
});

export const getAuthRoleByName = query({
  args: {
    name: v.string(),
  },
  returns: v.nullable(authRolesDoc),
  handler: async (ctx, args) => {
    return await impl.getAuthRoleByName(ctx.db, args.name);
  },
});

// ========================================
// User-Group Membership Management
// ========================================

export const addUserToAuthGroup = mutation({
  args: {
    userId: v.string(),
    groupId: v.id("authGroups"),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("authUserGroupMembers"),
  handler: async (ctx, args) => {
    return await impl.addUserToAuthGroup(ctx.db, args);
  },
});

export const removeUserFromAuthGroup = mutation({
  args: {
    userId: v.string(),
    groupId: v.id("authGroups"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<void> => {
    return await impl.removeUserFromAuthGroup(ctx.db, args);
  },
});

export const getUserAuthGroups = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(authGroupsDoc),
  handler: async (ctx, args) => {
    return await impl.getUserAuthGroups(ctx.db, args.userId);
  },
});

// ========================================
// Group-Role Assignment Management
// ========================================

export const assignAuthRoleToGroup = mutation({
  args: {
    groupId: v.id("authGroups"),
    roleId: v.id("authRoles"),
    assignedBy: v.optional(v.string()),
  },
  returns: v.id("authGroupRoleAssignments"),
  handler: async (ctx, args) => {
    return await impl.assignAuthRoleToGroup(ctx.db, args);
  },
});

export const removeAuthRoleFromGroup = mutation({
  args: {
    groupId: v.id("authGroups"),
    roleId: v.id("authRoles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.removeAuthRoleFromGroup(ctx.db, args);
  },
});

export const getAuthGroupRoles = query({
  args: {
    groupId: v.id("authGroups"),
  },
  returns: v.array(authRolesDoc),
  handler: async (ctx, args) => {
    return await impl.getAuthGroupRoles(ctx.db, args.groupId);
  },
});

// ========================================
// User-Role Assignment Management
// ========================================

export const assignAuthRoleToUser = mutation({
  args: {
    userId: v.string(),
    roleId: v.id("authRoles"),
    assignedBy: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("authUserRoleAssignments"),
  handler: async (ctx, args) => {
    return await impl.assignAuthRoleToUser(ctx.db, args);
  },
});

export const removeAuthRoleFromUser = mutation({
  args: {
    userId: v.string(),
    roleId: v.id("authRoles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.removeAuthRoleFromUser(ctx.db, args);
  },
});

export const getUserAuthRoles = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(authRolesDoc),
  handler: async (ctx, args) => {
    return await impl.getUserAuthRoles(ctx.db, args.userId);
  },
});

// ========================================
// Admin Queries for UI
// ========================================

export const listAuthGroupRoleAssignments = query({
  returns: v.array(authGroupRoleAssignmentsDoc),
  handler: async (ctx) => {
    return await impl.listAuthGroupRoleAssignments(ctx.db);
  },
});

export const getAuthGroupMemberCount = query({
  args: {
    groupId: v.id("authGroups"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    return await impl.getAuthGroupMemberCount(ctx.db, args.groupId);
  },
});

export const getUserAuthGroupMemberships = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(authUserGroupMembersDoc),
  handler: async (ctx, args) => {
    return await impl.getUserAuthGroupMemberships(ctx.db, args.userId);
  },
});

export const getUserAuthRoleAssignments = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(authUserRoleAssignmentsDoc),
  handler: async (ctx, args) => {
    return await impl.getUserAuthRoleAssignments(ctx.db, args.userId);
  },
});

export const updateUserAuthGroupMemberships = mutation({
  args: {
    userId: v.string(),
    groupIds: v.array(v.id("authGroups")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.updateUserAuthGroupMemberships(ctx.db, args);
  },
});

export const updateUserAuthRoleAssignments = mutation({
  args: {
    userId: v.string(),
    roleIds: v.array(v.id("authRoles")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.updateUserAuthRoleAssignments(ctx.db, args);
  },
});

export const getRoleScopes = query({
  args: {
    roleId: v.id("authRoles"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return await impl.getRoleScopes(ctx.db, args.roleId);
  },
});

export const getUserScopes = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return await impl.getUserScopes(ctx.db, args.userId);
  },
});

export const userInGroup = query({
  args: {
    userId: v.string(),
    groupId: v.id("authGroups"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await impl.userInGroup(ctx.db, args.userId, args.groupId);
  },
});

export const getGroupMembers = query({
  args: {
    groupId: v.id("authGroups"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return await impl.getGroupMembers(ctx.db, args.groupId);
  },
});

export const getUsersWithScope = query({
  args: {
    scope: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    return await impl.getUsersWithScope(ctx.db, args.scope);
  },
});

export const getGroupByName = query({
  args: {
    name: v.string(),
  },
  returns: v.nullable(authGroupsDoc),
  handler: async (ctx, args) => {
    return await impl.getGroupByName(ctx.db, args.name);
  },
});

export const getRoleByName = query({
  args: {
    name: v.string(),
  },
  returns: v.nullable(authRolesDoc),
  handler: async (ctx, args) => {
    return await impl.getRoleByName(ctx.db, args.name);
  },
});

export const insertAuthRoles = mutation({
  args: {
    roles: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        scopes: v.array(v.string()),
        isActive: v.boolean(),
      })
    ),
  },
  returns: v.array(v.id("authRoles")),
  handler: async (ctx, args) => {
    return await impl.insertAuthRoles(ctx.db, args.roles);
  },
});

export const insertAuthGroups = mutation({
  args: {
    groups: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        isActive: v.boolean(),
      })
    ),
  },
  returns: v.array(v.id("authGroups")),
  handler: async (ctx, args) => {
    return await impl.insertAuthGroups(ctx.db, args.groups);
  },
});

export const insertAuthGroupRoleAssignments = mutation({
  args: {
    assignments: v.array(
      v.object({
        groupId: v.id("authGroups"),
        roleId: v.id("authRoles"),
        assignedAt: v.number(),
        assignedBy: v.optional(v.string()),
      })
    ),
  },
  returns: v.array(v.id("authGroupRoleAssignments")),
  handler: async (ctx, args) => {
    return await impl.insertAuthGroupRoleAssignments(ctx.db, args.assignments);
  },
});
