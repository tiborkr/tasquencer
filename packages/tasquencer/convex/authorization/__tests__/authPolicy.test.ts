import { setup } from "./setup.test";
import { describe, it, expect } from "vitest";
import { internal } from "../../_generated/api";
import { PolicyResult } from "../../components/authorization/src/client/service/policy";
import { AuthorizationUserProvider } from "../../components/authorization/src/client/userProvider";
import {
  type AnyAuthorizationService,
  AuthorizationService,
} from "../../components/authorization/src/client/service";
import { components } from "../../_generated/api";

const authorizationUserProvider = AuthorizationUserProvider.initialize<any>()
  .withGetUser(async (ctx) => {
    return await ctx.db.query("users").first();
  })
  .withUserToUserId((user) => user._id);
const authorizationService = AuthorizationService.initialize<any>(
  components.tasquencerAuthorization
)
  .make(authorizationUserProvider)
  .build() as AnyAuthorizationService;

const {
  requireScope,
  requireAnyScope,
  requireAllScopes,
  anyPolicy,
  allPolicies,
} = authorizationService.policies;

// Helper function to create a test user
async function createTestUser(ctx: any) {
  return await ctx.db.insert("users", {});
}

// Helper to create a mock policy context
function createMockPolicyContext(ctx: any, userId: string) {
  return {
    mutationCtx: ctx,
    authorization: {
      scope: <T extends string>(scope: T) => scope,
      user: { userId: userId },
    },
  };
}

describe("auth Policy Helpers - requireScope", () => {
  it("should allow user with required scope", async () => {
    const t = setup();

    const [userId, scope] = await t.run(async (ctx) => {
      // Create user
      const userId = await createTestUser(ctx);

      // Create role with scope
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data"],
        }
      );

      // Assign role to user
      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return [userId, "read:data"];
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = requireScope(scope);
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.ALLOW);
  });

  it("should deny user without required scope", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      return await createTestUser(ctx);
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = requireScope("read:data");
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.DENY);
  });

  it("should deny when user is null", async () => {
    const t = setup();

    const result = await t.run(async (ctx) => {
      const policyCtx = {
        ...ctx,
        authorization: {
          scope: <T extends string>(scope: T) => scope,
          user: null,
        },
      };
      const policy = requireScope("read:data");
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.DENY);
  });
});

describe("auth Policy Helpers - requireAnyScope", () => {
  it("should allow user with at least one of the required scopes", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create role with one of the scopes
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data"],
        }
      );

      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return userId;
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = requireAnyScope(["read:data", "write:data"]);
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.ALLOW);
  });

  it("should deny user without any of the required scopes", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      return await createTestUser(ctx);
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = requireAnyScope(["read:data", "write:data"]);
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.DENY);
  });
});

describe("auth Policy Helpers - requireAllScopes", () => {
  it("should allow user with all required scopes", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create role with all scopes
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data", "write:data"],
        }
      );

      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return userId;
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = requireAllScopes(["read:data", "write:data"]);
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.ALLOW);
  });

  it("should deny user with only some of the required scopes", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create role with only one scope
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data"],
        }
      );

      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return userId;
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = requireAllScopes(["read:data", "write:data"]);
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.DENY);
  });
});

describe("auth Policy Helpers - anyPolicy", () => {
  it("should allow if any policy allows", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create role with one scope
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data"],
        }
      );

      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return userId;
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = anyPolicy(
        requireScope("read:data"),
        requireScope("write:data") // User doesn't have this
      );
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.ALLOW);
  });

  it("should deny if all policies deny", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      return await createTestUser(ctx);
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = anyPolicy(
        requireScope("read:data"),
        requireScope("write:data")
      );
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.DENY);
  });
});

describe("auth Policy Helpers - allPolicies", () => {
  it("should allow if all policies allow", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create role with both scopes
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data", "write:data"],
        }
      );

      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return userId;
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = allPolicies(
        requireScope("read:data"),
        requireScope("write:data")
      );
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.ALLOW);
  });

  it("should deny if any policy denies", async () => {
    const t = setup();

    const userId = await t.run(async (ctx) => {
      const userId = await createTestUser(ctx);

      // Create role with only one scope
      const roleId = await ctx.runMutation(
        components.tasquencerAuthorization.api.createAuthRole,
        {
          name: "test_role",
          description: "Test",
          scopes: ["read:data"],
        }
      );

      await ctx.runMutation(
        components.tasquencerAuthorization.api.assignAuthRoleToUser,
        {
          userId,
          roleId,
        }
      );

      return userId;
    });

    const result = await t.run(async (ctx) => {
      const policyCtx = createMockPolicyContext(ctx, userId);
      const policy = allPolicies(
        requireScope("read:data"),
        requireScope("write:data") // User doesn't have this
      );
      return await policy(policyCtx as any);
    });

    expect(result).toBe(PolicyResult.DENY);
  });
});
