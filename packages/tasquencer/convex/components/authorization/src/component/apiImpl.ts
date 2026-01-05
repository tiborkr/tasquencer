import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export async function createAuthGroup(
  db: DatabaseWriter,
  args: { name: string; description: string; metadata?: any }
): Promise<Id<"authGroups">> {
  const existing = await db
    .query("authGroups")
    .withIndex("by_name", (q) => q.eq("name", args.name))
    .unique();

  if (existing) {
    throw new Error(`Group with name '${args.name}' already exists`);
  }

  const groupId = await db.insert("authGroups", {
    name: args.name,
    description: args.description,
    isActive: true,
    metadata: args.metadata,
  });

  return groupId;
}

export async function updateAuthGroup(
  db: DatabaseWriter,
  args: {
    groupId: Id<"authGroups">;
    name?: string;
    description?: string;
    isActive?: boolean;
    metadata?: any;
  }
): Promise<void> {
  const { groupId, ...updates } = args;

  const group = await db.get(groupId);
  if (!group) {
    throw new Error(`Group not found: ${groupId}`);
  }

  // If updating name, check for duplicates
  if (updates.name !== undefined && updates.name !== group.name) {
    const existing = await db
      .query("authGroups")
      .withIndex("by_name", (q) => q.eq("name", updates.name!))
      .unique();

    if (existing) {
      throw new Error(`Group with name '${updates.name}' already exists`);
    }
  }

  await db.patch(groupId, updates);
}

export async function deleteAuthGroup(
  db: DatabaseWriter,
  groupId: Id<"authGroups">
): Promise<void> {
  const group = await db.get(groupId);
  if (!group) {
    throw new Error(`Group not found: ${groupId}`);
  }

  // Delete all group memberships
  const memberships = await db
    .query("authUserGroupMembers")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();

  for (const membership of memberships) {
    await db.delete(membership._id);
  }

  // Delete all group role assignments
  const roleAssignments = await db
    .query("authGroupRoleAssignments")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();

  for (const assignment of roleAssignments) {
    await db.delete(assignment._id);
  }

  // Delete the group
  await db.delete(groupId);
}

export async function listAuthGroups(db: DatabaseReader, isActive?: boolean) {
  if (isActive !== undefined) {
    return await db
      .query("authGroups")
      .withIndex("by_isActive", (q) => q.eq("isActive", isActive!))
      .collect();
  }

  return await db.query("authGroups").collect();
}

export async function getAuthGroup(
  db: DatabaseReader,
  groupId: Id<"authGroups">
) {
  return await db.get(groupId);
}

export async function getAuthGroupByName(db: DatabaseReader, name: string) {
  return await db
    .query("authGroups")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

export async function createAuthRole(
  db: DatabaseWriter,
  args: { name: string; description: string; scopes: string[]; metadata?: any }
) {
  const existing = await db
    .query("authRoles")
    .withIndex("by_name", (q) => q.eq("name", args.name))
    .unique();
  if (existing) {
    throw new Error(`Role with name '${args.name}' already exists`);
  }
  return await db.insert("authRoles", {
    name: args.name,
    description: args.description,
    scopes: args.scopes,
    isActive: true,
    metadata: args.metadata,
  });
}

export async function updateAuthRole(
  db: DatabaseWriter,
  args: {
    roleId: Id<"authRoles">;
    name?: string;
    description?: string;
    scopes?: string[];
    isActive?: boolean;
    metadata?: any;
  }
) {
  const { roleId, ...updates } = args;
  const role = await db.get(roleId);
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }

  // If updating name, check for duplicates
  if (updates.name !== undefined && updates.name !== role.name) {
    const existing = await db
      .query("authRoles")
      .withIndex("by_name", (q) => q.eq("name", updates.name!))
      .unique();
    if (existing) {
      throw new Error(`Role with name '${updates.name}' already exists`);
    }
  }

  await db.patch(roleId, updates);
}

export async function deleteAuthRole(
  db: DatabaseWriter,
  roleId: Id<"authRoles">
) {
  const role = await db.get(roleId);
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }
  // Delete all group role assignments
  const groupAssignments = await db
    .query("authGroupRoleAssignments")
    .withIndex("by_roleId", (q) => q.eq("roleId", roleId))
    .collect();

  for (const assignment of groupAssignments) {
    await db.delete(assignment._id);
  }

  // Delete all user role assignments
  const userAssignments = await db
    .query("authUserRoleAssignments")
    .withIndex("by_roleId", (q) => q.eq("roleId", roleId))
    .collect();

  for (const assignment of userAssignments) {
    await db.delete(assignment._id);
  }

  // Delete the role
  await db.delete(roleId);
}

export async function listAuthRoles(db: DatabaseReader, isActive?: boolean) {
  if (isActive !== undefined) {
    return await db
      .query("authRoles")
      .withIndex("by_isActive", (q) => q.eq("isActive", isActive!))
      .collect();
  }

  return await db.query("authRoles").collect();
}

export async function getAuthRole(db: DatabaseReader, roleId: Id<"authRoles">) {
  return await db.get(roleId);
}

export async function getAuthRoleByName(db: DatabaseReader, name: string) {
  return await db
    .query("authRoles")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

export async function addUserToAuthGroup(
  db: DatabaseWriter,
  args: { userId: string; groupId: Id<"authGroups">; expiresAt?: number }
) {
  // Check if membership already exists
  const existing = await db
    .query("authUserGroupMembers")
    .withIndex("by_userId_groupId", (q) =>
      q.eq("userId", args.userId).eq("groupId", args.groupId)
    )
    .unique();

  if (existing) {
    throw new Error(
      `User ${args.userId} is already a member of group ${args.groupId}`
    );
  }
  // Verify group exists
  const group = await db.get(args.groupId);
  if (!group) {
    throw new Error(`Group not found: ${args.groupId}`);
  }

  const membershipId = await db.insert("authUserGroupMembers", {
    userId: args.userId,
    groupId: args.groupId,
    joinedAt: Date.now(),
    expiresAt: args.expiresAt,
  });

  return membershipId;
}

export async function removeUserFromAuthGroup(
  db: DatabaseWriter,
  args: { userId: string; groupId: Id<"authGroups"> }
) {
  const membership = await db
    .query("authUserGroupMembers")
    .withIndex("by_userId_groupId", (q) =>
      q.eq("userId", args.userId).eq("groupId", args.groupId)
    )
    .unique();
  if (!membership) {
    throw new Error(
      `User ${args.userId} is not a member of group ${args.groupId}`
    );
  }
  await db.delete(membership._id);
}

export async function getUserAuthGroups(db: DatabaseReader, userId: string) {
  const now = Date.now();
  const memberships = await db
    .query("authUserGroupMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const groupIds = memberships
    .filter((m) => !m.expiresAt || m.expiresAt > now)
    .map((m) => m.groupId);

  const groups = await Promise.all(groupIds.map((id) => db.get(id)));

  return groups.filter((g) => g !== null);
}

export async function assignAuthRoleToGroup(
  db: DatabaseWriter,
  args: {
    groupId: Id<"authGroups">;
    roleId: Id<"authRoles">;
    assignedBy?: string;
  }
) {
  const existing = await db
    .query("authGroupRoleAssignments")
    .withIndex("by_groupId_roleId", (q) =>
      q.eq("groupId", args.groupId).eq("roleId", args.roleId)
    )
    .unique();

  if (existing) {
    throw new Error(
      `Role ${args.roleId} is already assigned to group ${args.groupId}`
    );
  }

  // Verify group exists
  const group = await db.get(args.groupId);
  if (!group) {
    throw new Error(`Group not found: ${args.groupId}`);
  }

  // Verify role exists
  const role = await db.get(args.roleId);
  if (!role) {
    throw new Error(`Role not found: ${args.roleId}`);
  }

  const assignmentId = await db.insert("authGroupRoleAssignments", {
    groupId: args.groupId,
    roleId: args.roleId,
    assignedAt: Date.now(),
    assignedBy: args.assignedBy,
  });

  return assignmentId;
}

export async function removeAuthRoleFromGroup(
  db: DatabaseWriter,
  args: { groupId: Id<"authGroups">; roleId: Id<"authRoles"> }
) {
  const assignment = await db
    .query("authGroupRoleAssignments")
    .withIndex("by_groupId_roleId", (q) =>
      q.eq("groupId", args.groupId).eq("roleId", args.roleId)
    )
    .unique();
  if (!assignment) {
    throw new Error(
      `Role ${args.roleId} is not assigned to group ${args.groupId}`
    );
  }
  await db.delete(assignment._id);
}

export async function getAuthGroupRoles(
  db: DatabaseReader,
  groupId: Id<"authGroups">
) {
  const assignments = await db
    .query("authGroupRoleAssignments")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();

  const roleIds = assignments.map((a) => a.roleId);
  const roles = await Promise.all(roleIds.map((id) => db.get(id)));

  return roles.filter((r) => r !== null);
}

export async function assignAuthRoleToUser(
  db: DatabaseWriter,
  args: {
    userId: string;
    roleId: Id<"authRoles">;
    assignedBy?: string;
    expiresAt?: number;
  }
) {
  const existing = await db
    .query("authUserRoleAssignments")
    .withIndex("by_userId_roleId", (q) =>
      q.eq("userId", args.userId).eq("roleId", args.roleId)
    )
    .unique();

  if (existing) {
    throw new Error(
      `Role ${args.roleId} is already assigned to user ${args.userId}`
    );
  }

  // Verify role exists
  const role = await db.get(args.roleId);
  if (!role) {
    throw new Error(`Role not found: ${args.roleId}`);
  }

  const assignmentId = await db.insert("authUserRoleAssignments", {
    userId: args.userId,
    roleId: args.roleId,
    assignedAt: Date.now(),
    assignedBy: args.assignedBy,
    expiresAt: args.expiresAt,
  });

  return assignmentId;
}

export async function removeAuthRoleFromUser(
  db: DatabaseWriter,
  args: { userId: string; roleId: Id<"authRoles"> }
) {
  const assignment = await db
    .query("authUserRoleAssignments")
    .withIndex("by_userId_roleId", (q) =>
      q.eq("userId", args.userId).eq("roleId", args.roleId)
    )
    .unique();
  if (!assignment) {
    throw new Error(
      `Role ${args.roleId} is not assigned to user ${args.userId}`
    );
  }
  await db.delete(assignment._id);
}

export async function getUserAuthRoles(db: DatabaseReader, userId: string) {
  const now = Date.now();

  // Get direct role assignments
  const directAssignments = await db
    .query("authUserRoleAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const directRoleIds = directAssignments
    .filter((a) => !a.expiresAt || a.expiresAt > now)
    .map((a) => a.roleId);

  // Get roles via group memberships
  const groupMemberships = await db
    .query("authUserGroupMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const activeGroupIds = groupMemberships
    .filter((m) => !m.expiresAt || m.expiresAt > now)
    .map((m) => m.groupId);

  const groupRoleIds = new Set<Id<"authRoles">>();
  for (const groupId of activeGroupIds) {
    const groupAssignments = await db
      .query("authGroupRoleAssignments")
      .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
      .collect();

    groupAssignments.forEach((a) => groupRoleIds.add(a.roleId));
  }

  // Combine and deduplicate role IDs
  const allRoleIds = Array.from(new Set([...directRoleIds, ...groupRoleIds]));

  const roles = await Promise.all(allRoleIds.map((id) => db.get(id)));

  return roles.filter(
    (r) => r !== null && r.isActive
  ) as unknown as Doc<"authRoles">[];
}

export async function listAuthGroupRoleAssignments(db: DatabaseReader) {
  return await db.query("authGroupRoleAssignments").collect();
}

export async function getAuthGroupMemberCount(
  db: DatabaseReader,
  groupId: Id<"authGroups">
) {
  const now = Date.now();
  const memberships = await db
    .query("authUserGroupMembers")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();

  return memberships.filter((m) => !m.expiresAt || m.expiresAt > now).length;
}

export async function getUserAuthGroupMemberships(
  db: DatabaseReader,
  userId: string
) {
  const now = Date.now();
  return await db
    .query("authUserGroupMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .filter((q) =>
      q.or(
        q.eq(q.field("expiresAt"), undefined),
        q.gt(q.field("expiresAt"), now)
      )
    )
    .collect();
}

export async function getUserAuthRoleAssignments(
  db: DatabaseReader,
  userId: string
) {
  const now = Date.now();
  return await db
    .query("authUserRoleAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .filter((q) =>
      q.or(
        q.eq(q.field("expiresAt"), undefined),
        q.gt(q.field("expiresAt"), now)
      )
    )
    .collect();
}

export async function updateUserAuthGroupMemberships(
  db: DatabaseWriter,
  args: { userId: string; groupIds: Id<"authGroups">[] }
) {
  const currentMemberships = await db
    .query("authUserGroupMembers")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .collect();

  const currentGroupIds = new Set(currentMemberships.map((m) => m.groupId));
  const newGroupIds = new Set(args.groupIds);

  // Remove memberships that are no longer in the list
  for (const membership of currentMemberships) {
    if (!newGroupIds.has(membership.groupId)) {
      await db.delete(membership._id);
    }
  }

  // Add new memberships
  for (const groupId of args.groupIds) {
    if (!currentGroupIds.has(groupId)) {
      await db.insert("authUserGroupMembers", {
        userId: args.userId,
        groupId: groupId,
        joinedAt: Date.now(),
      });
    }
  }
}

export async function updateUserAuthRoleAssignments(
  db: DatabaseWriter,
  args: { userId: string; roleIds: Id<"authRoles">[] }
) {
  const currentAssignments = await db
    .query("authUserRoleAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .collect();

  const currentRoleIds = new Set(currentAssignments.map((a) => a.roleId));
  const newRoleIds = new Set(args.roleIds);

  // Remove assignments that are no longer in the list
  for (const assignment of currentAssignments) {
    if (!newRoleIds.has(assignment.roleId)) {
      await db.delete(assignment._id);
    }
  }

  // Add new assignments
  for (const roleId of args.roleIds) {
    if (!currentRoleIds.has(roleId)) {
      await db.insert("authUserRoleAssignments", {
        userId: args.userId,
        roleId: roleId,
        assignedAt: Date.now(),
      });
    }
  }
}

export async function getRoleScopes(
  db: DatabaseReader,
  roleId: Id<"authRoles">
) {
  const role = await db.get(roleId);
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }
  if (!role.isActive) {
    return [];
  }
  return role.scopes;
}

export async function getUserScopes(db: DatabaseReader, userId: string) {
  const roles = await getUserAuthRoles(db, userId);
  const scopes = await Promise.all(
    roles.map((role) => getRoleScopes(db, role._id))
  );
  return Array.from(new Set(scopes.flat()));
}

export async function userInGroup(
  db: DatabaseReader,
  userId: string,
  groupId: Id<"authGroups">
) {
  const now = Date.now();
  const membership = await db
    .query("authUserGroupMembers")
    .withIndex("by_userId_groupId", (q) =>
      q.eq("userId", userId).eq("groupId", groupId)
    )
    .unique();
  if (!membership) {
    return false;
  }
  if (membership.expiresAt && membership.expiresAt <= now) {
    return false;
  }
  return true;
}

export async function getGroupMembers(
  db: DatabaseReader,
  groupId: Id<"authGroups">
) {
  const now = Date.now();
  const memberships = await db
    .query("authUserGroupMembers")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();
  return memberships
    .filter((m) => !m.expiresAt || m.expiresAt > now)
    .map((m) => m.userId);
}

export async function getUsersWithScope(db: DatabaseReader, scope: string) {
  const roles = await db.query("authRoles").collect();
  const rolesWithScope = roles.filter(
    (role) => role.isActive && role.scopes.includes(scope)
  );
  const roleIds = rolesWithScope.map((r) => r._id);

  if (roleIds.length === 0) {
    return [];
  }

  const userIds = new Set<string>();
  const now = Date.now();

  // Get users with direct role assignments
  for (const roleId of roleIds) {
    const assignments = await db
      .query("authUserRoleAssignments")
      .withIndex("by_roleId", (q) => q.eq("roleId", roleId))
      .collect();

    for (const assignment of assignments) {
      if (!assignment.expiresAt || assignment.expiresAt > now) {
        userIds.add(assignment.userId);
      }
    }
  }

  // Get users via group role assignments
  for (const roleId of roleIds) {
    const groupAssignments = await db
      .query("authGroupRoleAssignments")
      .withIndex("by_roleId", (q) => q.eq("roleId", roleId))
      .collect();

    for (const assignment of groupAssignments) {
      const members = await getGroupMembers(db, assignment.groupId);
      members.forEach((userId) => userIds.add(userId));
    }
  }

  return Array.from(userIds);
}

export async function getGroupByName(db: DatabaseReader, name: string) {
  return await db
    .query("authGroups")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

export async function getRoleByName(db: DatabaseReader, name: string) {
  return await db
    .query("authRoles")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

export async function insertAuthRoles(
  db: DatabaseWriter,
  roles: {
    name: string;
    description: string;
    scopes: string[];
    isActive: boolean;
    metadata?: any;
  }[]
) {
  return await Promise.all(roles.map((role) => db.insert("authRoles", role)));
}

export async function insertAuthGroups(
  db: DatabaseWriter,
  groups: {
    name: string;
    description: string;
    isActive: boolean;
    metadata?: any;
  }[]
) {
  return await Promise.all(
    groups.map((group) => db.insert("authGroups", group))
  );
}

export async function insertAuthGroupRoleAssignments(
  db: DatabaseWriter,
  assignments: {
    groupId: Id<"authGroups">;
    roleId: Id<"authRoles">;
    assignedAt: number;
    assignedBy?: string;
  }[]
) {
  return await Promise.all(
    assignments.map((assignment) =>
      db.insert("authGroupRoleAssignments", assignment)
    )
  );
}
