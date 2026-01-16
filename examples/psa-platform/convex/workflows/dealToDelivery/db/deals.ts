/**
 * Database functions for deals (the aggregate root for deal-to-delivery workflow)
 */
import type {
  DatabaseReader,
  DatabaseWriter,
} from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { EntityNotFoundError } from "@repo/tasquencer";
import { helpers } from "../../../tasquencer";

export type DealStage = Doc<"deals">["stage"];

export async function insertDeal(
  db: DatabaseWriter,
  deal: Omit<Doc<"deals">, "_id" | "_creationTime">
): Promise<Id<"deals">> {
  return await db.insert("deals", deal);
}

export async function getDeal(
  db: DatabaseReader,
  dealId: Id<"deals">
): Promise<Doc<"deals"> | null> {
  return await db.get(dealId);
}

export async function getDealByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"deals"> | null> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId);
  return await db
    .query("deals")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", rootWorkflowId))
    .unique();
}

export async function updateDealStage(
  db: DatabaseWriter,
  dealId: Id<"deals">,
  stage: DealStage
): Promise<void> {
  const deal = await db.get(dealId);
  if (!deal) {
    throw new EntityNotFoundError("Deal", { dealId });
  }
  await db.patch(dealId, { stage });
}

export async function updateDeal(
  db: DatabaseWriter,
  dealId: Id<"deals">,
  updates: Partial<Omit<Doc<"deals">, "_id" | "_creationTime" | "organizationId">>
): Promise<void> {
  const deal = await db.get(dealId);
  if (!deal) {
    throw new EntityNotFoundError("Deal", { dealId });
  }
  await db.patch(dealId, updates);
}

export async function listDealsByOrganization(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  limit = 50
): Promise<Array<Doc<"deals">>> {
  return await db
    .query("deals")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .order("desc")
    .take(limit);
}

export async function listDealsByStage(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  stage: DealStage,
  limit = 50
): Promise<Array<Doc<"deals">>> {
  return await db
    .query("deals")
    .withIndex("by_stage", (q) =>
      q.eq("organizationId", organizationId).eq("stage", stage)
    )
    .order("desc")
    .take(limit);
}

export async function listDealsByOwner(
  db: DatabaseReader,
  ownerId: Id<"users">,
  limit = 50
): Promise<Array<Doc<"deals">>> {
  return await db
    .query("deals")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(limit);
}
