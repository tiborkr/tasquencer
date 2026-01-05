import { v } from "convex/values";
import { query } from "../../../_generated/server";
import { requireErStaffMember } from "../domain/services/authorizationService";
import { mapErWorkItemToResponse } from "../domain/services/workItemMappingService";
import { ErWorkItemHelpers } from "../helpers";
import { isHumanClaim, isHumanOffer } from "@repo/tasquencer";
import { components } from "../../../../../../packages/tasquencer/convex/_generated/api";

export const getMyAvailableTasks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireErStaffMember(ctx);

    const items = await ErWorkItemHelpers.getAvailableWorkItemsForUser(
      ctx,
      userId
    );

    return items.map((item) => {
      return mapErWorkItemToResponse(item.metadata, item.workItem);
    });
  },
});

export const getMyClaimedTasks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireErStaffMember(ctx);

    const items = await ErWorkItemHelpers.getClaimedWorkItemsByUser(
      ctx.db,
      userId
    );

    return items.map((item) => {
      return mapErWorkItemToResponse(item.metadata, item.workItem);
    });
  },
});

/**
 * Admin view: Returns ALL available ER work items across the system.
 * This query bypasses role-based authorization and shows all tasks,
 * intended for administrative dashboards and system monitoring.
 */
export const getAllAvailableTasks = query({
  args: {},
  handler: async (ctx) => {
    await requireErStaffMember(ctx);
    const allMetadata = await ctx.db.query("erWorkItems").collect();

    // Load all work items in parallel
    const workItems = await Promise.all(
      allMetadata.map((metadata) => ctx.db.get(metadata.workItemId))
    );

    // Filter to only active work items (initialized or started)
    const activeItems = allMetadata
      .map((metadata, idx) => ({ metadata, workItem: workItems[idx] }))
      .filter(
        ({ workItem }) =>
          workItem?.state === "initialized" || workItem?.state === "started"
      )
      .filter(({ metadata }) => isHumanOffer(metadata.offer));

    // Load auth groups for items that have requiredGroupId
    const groupIds = activeItems
      .map(({ metadata }) =>
        isHumanOffer(metadata.offer)
          ? metadata.offer.requiredGroupId
          : undefined
      )
      .filter((id): id is typeof id & {} => id !== undefined);

    const uniqueGroupIds = [...new Set(groupIds)];
    const groups = await Promise.all(
      uniqueGroupIds.map((id) =>
        ctx.runQuery(components.tasquencerAuthorization.api.getAuthGroup, {
          groupId: id,
        })
      )
    );
    const groupMap = new Map(
      groups.map((group, idx) => [uniqueGroupIds[idx], group])
    );

    return activeItems.map(({ metadata, workItem }) => {
      const group =
        isHumanOffer(metadata.offer) && metadata.offer.requiredGroupId
          ? (groupMap.get(metadata.offer.requiredGroupId) ?? null)
          : null;
      return mapErWorkItemToResponse(metadata, workItem, group, {
        includeGroupName: true,
      });
    });
  },
});

export const getTasksByPatient = query({
  args: { patientId: v.id("erPatients") },
  handler: async (ctx, args) => {
    await requireErStaffMember(ctx);
    const allMetadata = await ctx.db
      .query("erWorkItems")
      .withIndex("by_aggregateTableId", (q) =>
        q.eq("aggregateTableId", args.patientId)
      )
      .collect();

    // Load all work items in parallel
    const workItems = await Promise.all(
      allMetadata.map((metadata) => ctx.db.get(metadata.workItemId))
    );

    const humanItems = allMetadata
      .map((metadata, idx) => ({
        metadata,
        workItem: workItems[idx],
      }))
      .filter(({ metadata }) => isHumanOffer(metadata.offer));

    return humanItems.map(({ metadata, workItem }) => {
      return mapErWorkItemToResponse(metadata, workItem, undefined, {
        includeWorkItemState: true,
      });
    });
  },
});

export const getWorkItemMetadataByWorkItemId = query({
  args: { workItemId: v.id("tasquencerWorkItems") },
  handler: async (ctx, args) => {
    await requireErStaffMember(ctx);
    const metadata = await ctx.db
      .query("erWorkItems")
      .withIndex("by_workItemId", (q) => q.eq("workItemId", args.workItemId))
      .first();
    if (!metadata) return null;

    const workItem = await ctx.db.get(args.workItemId);
    const humanOffer = isHumanOffer(metadata.offer) ? metadata.offer : null;

    // TODO: Update to use auth role/group mapping service
    // For now, return work item without role/group enrichment
    return {
      _id: metadata._id,
      _creationTime: metadata._creationTime,
      workItemId: metadata.workItemId,
      patientId: metadata.aggregateTableId,
      taskName: metadata.payload.taskName ?? workItem?.name ?? "Task",
      status: (workItem?.state === "completed"
        ? "completed"
        : metadata.claim
          ? "claimed"
          : "pending") as "pending" | "claimed" | "completed",
      requiredScope: humanOffer?.requiredScope,
      requiredGroupId: humanOffer?.requiredGroupId,
      claimedBy: isHumanClaim(metadata.claim)
        ? metadata.claim.userId
        : undefined,
      priority: metadata.payload.priority,
      workItemState: workItem?.state,
      payload: metadata.payload,
    };
  },
});
