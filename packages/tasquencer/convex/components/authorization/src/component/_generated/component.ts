/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    api: {
      addUserToAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { expiresAt?: number; groupId: string; userId: string },
        string,
        Name
      >;
      assignAuthRoleToGroup: FunctionReference<
        "mutation",
        "internal",
        { assignedBy?: string; groupId: string; roleId: string },
        string,
        Name
      >;
      assignAuthRoleToUser: FunctionReference<
        "mutation",
        "internal",
        {
          assignedBy?: string;
          expiresAt?: number;
          roleId: string;
          userId: string;
        },
        string,
        Name
      >;
      createAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { description: string; metadata?: any; name: string },
        string,
        Name
      >;
      createAuthRole: FunctionReference<
        "mutation",
        "internal",
        {
          description: string;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        },
        string,
        Name
      >;
      deleteAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { groupId: string },
        null,
        Name
      >;
      deleteAuthRole: FunctionReference<
        "mutation",
        "internal",
        { roleId: string },
        null,
        Name
      >;
      getAuthGroup: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        } | null,
        Name
      >;
      getAuthGroupByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        } | null,
        Name
      >;
      getAuthGroupMemberCount: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        number,
        Name
      >;
      getAuthGroupRoles: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        }>,
        Name
      >;
      getAuthRole: FunctionReference<
        "query",
        "internal",
        { roleId: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        } | null,
        Name
      >;
      getAuthRoleByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        } | null,
        Name
      >;
      getGroupByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        } | null,
        Name
      >;
      getGroupMembers: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        Array<string>,
        Name
      >;
      getRoleByName: FunctionReference<
        "query",
        "internal",
        { name: string },
        {
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        } | null,
        Name
      >;
      getRoleScopes: FunctionReference<
        "query",
        "internal",
        { roleId: string },
        Array<string>,
        Name
      >;
      getUserAuthGroupMemberships: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          expiresAt?: number;
          groupId: string;
          joinedAt: number;
          userId: string;
        }>,
        Name
      >;
      getUserAuthGroups: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        }>,
        Name
      >;
      getUserAuthRoleAssignments: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          assignedAt: number;
          assignedBy?: string;
          expiresAt?: number;
          roleId: string;
          userId: string;
        }>,
        Name
      >;
      getUserAuthRoles: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        }>,
        Name
      >;
      getUserScopes: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<string>,
        Name
      >;
      getUsersWithScope: FunctionReference<
        "query",
        "internal",
        { scope: string },
        Array<string>,
        Name
      >;
      insertAuthGroupRoleAssignments: FunctionReference<
        "mutation",
        "internal",
        {
          assignments: Array<{
            assignedAt: number;
            assignedBy?: string;
            groupId: string;
            roleId: string;
          }>;
        },
        Array<string>,
        Name
      >;
      insertAuthGroups: FunctionReference<
        "mutation",
        "internal",
        {
          groups: Array<{
            description: string;
            isActive: boolean;
            name: string;
          }>;
        },
        Array<string>,
        Name
      >;
      insertAuthRoles: FunctionReference<
        "mutation",
        "internal",
        {
          roles: Array<{
            description: string;
            isActive: boolean;
            name: string;
            scopes: Array<string>;
          }>;
        },
        Array<string>,
        Name
      >;
      listAuthGroupRoleAssignments: FunctionReference<
        "query",
        "internal",
        any,
        Array<{
          _creationTime: number;
          _id: string;
          assignedAt: number;
          assignedBy?: string;
          groupId: string;
          roleId: string;
        }>,
        Name
      >;
      listAuthGroups: FunctionReference<
        "query",
        "internal",
        { isActive?: boolean },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
        }>,
        Name
      >;
      listAuthRoles: FunctionReference<
        "query",
        "internal",
        { isActive?: boolean },
        Array<{
          _creationTime: number;
          _id: string;
          description: string;
          isActive: boolean;
          metadata?: any;
          name: string;
          scopes: Array<string>;
        }>,
        Name
      >;
      removeAuthRoleFromGroup: FunctionReference<
        "mutation",
        "internal",
        { groupId: string; roleId: string },
        null,
        Name
      >;
      removeAuthRoleFromUser: FunctionReference<
        "mutation",
        "internal",
        { roleId: string; userId: string },
        null,
        Name
      >;
      removeUserFromAuthGroup: FunctionReference<
        "mutation",
        "internal",
        { groupId: string; userId: string },
        null,
        Name
      >;
      updateAuthGroup: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          groupId: string;
          isActive?: boolean;
          metadata?: any;
          name?: string;
        },
        null,
        Name
      >;
      updateAuthRole: FunctionReference<
        "mutation",
        "internal",
        {
          description?: string;
          isActive?: boolean;
          metadata?: any;
          name?: string;
          roleId: string;
          scopes?: Array<string>;
        },
        null,
        Name
      >;
      updateUserAuthGroupMemberships: FunctionReference<
        "mutation",
        "internal",
        { groupIds: Array<string>; userId: string },
        null,
        Name
      >;
      updateUserAuthRoleAssignments: FunctionReference<
        "mutation",
        "internal",
        { roleIds: Array<string>; userId: string },
        null,
        Name
      >;
      userInGroup: FunctionReference<
        "query",
        "internal",
        { groupId: string; userId: string },
        boolean,
        Name
      >;
    };
  };
