import { components } from "../../../../_generated/api";
import type { Id, Doc } from "../../../../_generated/dataModel";
import type { QueryCtx } from "../../../../_generated/server";
import {
  isHumanClaim,
  isHumanOffer,
  type WorkItemClaim,
} from "@repo/tasquencer";

type ErWorkItemMetadata = Doc<"erWorkItems">;

type ErWorkItem = {
  _id: Id<"tasquencerWorkItems">;
  name: string;
  state: string;
} | null;

type AuthGroup = {
  name: string;
} | null;

/**
 * Derives the status of a work item based on its state and claim metadata.
 */
export function deriveWorkItemStatus(
  workItem: { state: string } | null,
  metadata: { claim?: WorkItemClaim }
): "pending" | "claimed" | "completed" {
  if (workItem?.state === "completed") return "completed";
  if (metadata.claim) return "claimed";
  return "pending";
}

/**
 * Maps ER work item metadata to a standardized response format.
 * Used across multiple queries to ensure consistent response shapes.
 */
export function mapErWorkItemToResponse(
  metadata: ErWorkItemMetadata,
  workItem: ErWorkItem,
  group?: AuthGroup,
  options: { includeGroupName?: boolean; includeWorkItemState?: boolean } = {}
) {
  // Extract common fields from the discriminated union payload
  const taskName = metadata.payload.taskName ?? workItem?.name ?? "Task";
  const priority = metadata.payload.priority;
  const taskType = (metadata.payload as { type: string }).type;

  if (!isHumanOffer(metadata.offer)) {
    throw new Error("ER work items must be offered to humans");
  }

  const baseResponse = {
    _id: metadata._id,
    _creationTime: metadata._creationTime,
    workItemId: metadata.workItemId, // Use the ID from metadata, not the workItem doc
    patientId: metadata.aggregateTableId,
    taskName,
    taskType,
    status: deriveWorkItemStatus(workItem, metadata),
    requiredScope: metadata.offer.requiredScope,
    requiredGroupId: metadata.offer.requiredGroupId,
    claimedBy: isHumanClaim(metadata.claim) ? metadata.claim.userId : undefined,
    priority,
    payload: metadata.payload,
  };

  return {
    ...baseResponse,
    ...(options.includeGroupName && { requiredGroupName: group?.name }),
    ...(options.includeWorkItemState && { workItemState: workItem?.state }),
  };
}

/**
 * Batch loads auth groups to prevent N+1 queries.
 * Returns a map for O(1) lookups.
 */
export async function batchLoadAuthGroups(
  ctx: QueryCtx,
  groupIds: Array<string | undefined>
): Promise<Map<string, AuthGroup>> {
  const uniqueGroupIds = [
    ...new Set(groupIds.filter((id) => id !== undefined)),
  ];

  const groups = await Promise.all(
    uniqueGroupIds.map((id) =>
      ctx.runQuery(components.tasquencerAuthorization.api.getAuthGroup, {
        groupId: id,
      })
    )
  );

  const groupMap = new Map<string, AuthGroup>();
  groups.forEach((group, idx) => {
    if (group) groupMap.set(uniqueGroupIds[idx], group);
  });

  return groupMap;
}
