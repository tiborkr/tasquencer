/**
 * Authorization-specific work item helpers for the deal-to-delivery workflow.
 * Provides typed metadata initialization for work items with scope-based authorization.
 */
import type { MutationCtx } from "../../../_generated/server";
import type { Id, Doc } from "../../../_generated/dataModel";
import { assertDealExists } from "../exceptions";
import { getDealByWorkflowId } from "../db/deals";

/**
 * Initializes typed deal-to-delivery work item metadata using auth scope-based authorization.
 * This provides full type safety with discriminated union payloads.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The ID of the work item to initialize metadata for
 * @param config - Configuration object containing scope, optional group, deal ID, and typed payload
 */
export async function initializeDealWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">,
  config: {
    scope: string;
    groupId?: string;
    dealId: Id<"deals">;
    payload: Doc<"dealToDeliveryWorkItems">["payload"];
  }
): Promise<Id<"dealToDeliveryWorkItems">> {
  return await mutationCtx.db.insert("dealToDeliveryWorkItems", {
    workItemId,
    workflowName: "dealToDelivery",
    offer: {
      type: "human" as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    } as any,
    aggregateTableId: config.dealId,
    payload: config.payload,
  });
}

/**
 * Common pattern: Fetch deal from parent workflow and initialize work item.
 * Auth version that includes scope-based authorization.
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
export async function initializeWorkItemWithDealAuth(
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
