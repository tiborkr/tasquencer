import type { MutationCtx } from "../../../_generated/server";
import type { Id, Doc } from "../../../_generated/dataModel";
import { assertPatientExists } from "../exceptions";
import { getPatientByWorkflowId } from "../db";

/**
 * Initializes typed ER work item metadata using auth scope-based authorization.
 * This provides full type safety with discriminated union payloads.
 *
 * @param mutationCtx - The mutation context
 * @param workItemId - The ID of the work item to initialize metadata for
 * @param config - Configuration object containing scope, optional group, patient ID, and typed payload
 */
export async function initializeErWorkItemAuth(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">,
  config: {
    scope: string;
    groupId?: string;
    patientId: Id<"erPatients">;
    payload: Doc<"erWorkItems">["payload"];
  }
): Promise<Id<"erWorkItems">> {
  return await mutationCtx.db.insert("erWorkItems", {
    workItemId,
    workflowName: "erPatientJourney",
    offer: {
      type: "human" as const,
      requiredScope: config.scope,
      ...(config.groupId !== undefined && { requiredGroupId: config.groupId }),
    } as any,
    aggregateTableId: config.patientId,
    payload: config.payload,
  });
}

/**
 * Common pattern: Fetch patient from parent workflow and initialize work item.
 * Auth version.
 *
 * This is used by most ER work items in their onEnabled handlers to:
 * 1. Get the patient associated with the parent workflow
 * 2. Verify the patient exists
 * 3. Initialize the work item with the patient ID
 *
 * @param mutationCtx - The mutation context
 * @param parentWorkflow - The parent workflow containing the workflow ID
 * @param workItem - The work item to initialize
 * @returns The patient document and work item ID
 */
export async function initializeWorkItemWithPatientAuth(
  mutationCtx: MutationCtx,
  parentWorkflow: { id: Id<"tasquencerWorkflows"> },
  workItem: {
    initialize: (payload: {
      patientId: Id<"erPatients">;
    }) => Promise<Id<"tasquencerWorkItems">>;
  }
): Promise<{
  patient: Doc<"erPatients">;
  workItemId: Id<"tasquencerWorkItems">;
}> {
  const patient = await getPatientByWorkflowId(
    mutationCtx.db,
    parentWorkflow.id
  );
  assertPatientExists(patient, parentWorkflow.id);

  const workItemId = await workItem.initialize({ patientId: patient._id });

  return { patient, workItemId };
}
