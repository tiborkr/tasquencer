import { v } from "convex/values";
import { query } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import { authComponent } from "../../../auth";
import { assertUserHasScope } from "../../../authorization";
import { ErWorkItemHelpers } from "../helpers";

export const canAdmitPatient = query({
  args: {},
  handler: async (ctx) => {
    try {
      await assertUserHasScope(ctx, "er:staff");
      return true;
    } catch (error) {
      return false;
    }
  },
});

export const canClaimWorkItem = query({
  args: { workItemId: v.id("tasquencerWorkItems") },
  handler: async (ctx, args) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser) return false;

    const userId = authUser.userId as Id<"users">;

    return await ErWorkItemHelpers.canUserClaimWorkItem(
      ctx,
      userId,
      args.workItemId
    );
  },
});
