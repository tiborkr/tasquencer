/**
 * Work item lifecycle helpers for the deal-to-delivery workflow.
 * Provides common patterns for starting, claiming, and managing work items.
 */
import type { MutationCtx } from "../../../_generated/server";
import type { Id, Doc } from "../../../_generated/dataModel";
import { authComponent } from "../../../auth";
import { assertAuthenticatedUser, assertDealExists } from "../exceptions";
import { DealToDeliveryWorkItemHelpers } from "../helpers";
import {
  getDealByWorkflowId,
  updateDealStage,
} from "../db/deals";
import { ConstraintViolationError, DataIntegrityError } from "@repo/tasquencer";

/**
 * Helper function to authenticate, claim, and start a work item.
 * This encapsulates the common pattern used across all deal-to-delivery work items.
 *
 * @param mutationCtx - The mutation context
 * @param workItem - The work item handle with id and start method
 * @throws Error if user is not authenticated or claiming fails
 */
export async function startAndClaimWorkItem(
  mutationCtx: MutationCtx,
  workItem: { id: Id<"tasquencerWorkItems">; start: () => Promise<void> }
): Promise<void> {
  const authUser = await authComponent.safeGetAuthUser(mutationCtx);
  assertAuthenticatedUser(authUser, {
    operation: "startAndClaimWorkItem",
    workItemId: workItem.id,
  });

  const userId = authUser.userId as Id<"users">;
  try {
    await DealToDeliveryWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId);
  } catch (error) {
    if (error instanceof ConstraintViolationError) {
      throw error;
    }

    throw new ConstraintViolationError("WORK_ITEM_CLAIM_FAILED", {
      workItemId: workItem.id,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
  // Claim and start run inside the same mutation transaction, so any throw rolls back both operations.
  await workItem.start();
}

/**
 * Common pattern: Fetch deal from parent workflow and initialize work item.
 *
 * This is used by most deal-to-delivery work items in their onEnabled handlers to:
 * 1. Get the deal associated with the parent workflow
 * 2. Verify the deal exists
 * 3. Initialize the work item with the deal ID
 *
 * @param mutationCtx - The mutation context
 * @param parentWorkflow - The parent workflow containing the workflow ID
 * @param workItem - The work item to initialize
 * @returns The deal document and work item ID
 */
export async function initializeWorkItemWithDeal(
  mutationCtx: MutationCtx,
  parentWorkflow: { id: Id<"tasquencerWorkflows"> },
  workItem: {
    initialize: (payload: {
      dealId: Id<"deals">;
    }) => Promise<Id<"tasquencerWorkItems">>;
  }
): Promise<{
  deal: Doc<"deals">;
  workItemId: Id<"tasquencerWorkItems">;
}> {
  const deal = await getDealByWorkflowId(
    mutationCtx.db,
    parentWorkflow.id
  );
  assertDealExists(deal, { workflowId: parentWorkflow.id });

  const workItemId = await workItem.initialize({ dealId: deal._id });

  return { deal, workItemId };
}

type DealStage = Doc<"deals">["stage"];

/**
 * Transition deal stage for a work item, storing previous stage in metadata for rollback.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The work item ID
 * @param dealId - The deal ID to update
 * @param nextStage - The new stage to transition to
 */
export async function transitionDealStageForWorkItem(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">,
  dealId: Id<"deals">,
  nextStage: DealStage
): Promise<void> {
  const deal = await mutationCtx.db.get(dealId);
  assertDealExists(deal, { dealId });

  if (deal.stage === nextStage) {
    return;
  }

  const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );
  if (!metadata) {
    throw new DataIntegrityError("WORK_ITEM_METADATA_MISSING", {
      workItemId,
    });
  }

  // Store previous stage for rollback
  // Use type assertion since not all payload types have previousStage in their union
  const payloadWithStage = metadata.payload as Record<string, unknown>;
  if (payloadWithStage.previousStage === undefined) {
    await mutationCtx.db.patch(metadata._id, {
      payload: {
        ...metadata.payload,
        previousStage: deal.stage,
      } as any, // Type assertion needed for discriminated union
    });
  }

  await updateDealStage(mutationCtx.db, dealId, nextStage);
}

/**
 * Revert deal stage to previous value stored in work item metadata.
 * Used during cancellation or failure to restore state.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The work item ID
 * @param dealId - The deal ID to revert
 */
export async function revertDealStageForWorkItem(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">,
  dealId: Id<"deals">
): Promise<void> {
  const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );
  if (!metadata) {
    return;
  }

  const payloadWithStage = metadata.payload as Record<string, unknown> & {
    previousStage?: DealStage;
  };
  const previousStage = payloadWithStage.previousStage;
  if (previousStage === undefined) {
    return;
  }

  const deal = await mutationCtx.db.get(dealId);
  if (deal && deal.stage !== previousStage) {
    await updateDealStage(mutationCtx.db, dealId, previousStage);
  }

  const { previousStage: _ignored, ...restPayload } = payloadWithStage;
  await mutationCtx.db.patch(metadata._id, {
    payload: restPayload as Doc<"dealToDeliveryWorkItems">["payload"],
  });
}

/**
 * Clean up work item metadata on cancel or failure.
 * Reverts deal stage and deletes the metadata record.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The work item ID to clean up
 */
export async function cleanupWorkItemOnCancel(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">
): Promise<void> {
  const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );

  if (metadata) {
    // Get deal ID from metadata's aggregate table reference
    const dealId = metadata.aggregateTableId as Id<"deals">;
    if (dealId) {
      await revertDealStageForWorkItem(mutationCtx, workItemId, dealId);
    }
    await mutationCtx.db.delete(metadata._id);
  }
}
