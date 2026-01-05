import type { MutationCtx } from "../../../_generated/server";
import type { Id, Doc } from "../../../_generated/dataModel";
import { authComponent } from "../../../auth";
import { assertAuthenticatedUser, assertPatientExists } from "../exceptions";
import { ErWorkItemHelpers } from "../helpers";
import {
  getPatientByWorkflowId,
  getRootWorkflowAndPatientForWorkItem,
  updatePatientStatus,
} from "../db";
import { ConstraintViolationError, DataIntegrityError } from "@repo/tasquencer";

/**
 * Helper function to authenticate, claim, and start a work item.
 * This encapsulates the common pattern used across all ER work items.
 *
 * @param mutationCtx - The mutation context
 * @param workItem - The work item handle with id and start method
 * @throws Error if user is not authenticated
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
    await ErWorkItemHelpers.claimWorkItem(mutationCtx, workItem.id, userId);
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
 * Common pattern: Fetch patient from parent workflow and initialize work item.
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
export async function initializeWorkItemWithPatient(
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

type PatientStatus = Doc<"erPatients">["status"];

export async function transitionPatientStatusForWorkItem(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">,
  nextStatus: PatientStatus
): Promise<void> {
  const { patient } = await getRootWorkflowAndPatientForWorkItem(
    mutationCtx.db,
    workItemId
  );

  if (patient.status === nextStatus) {
    return;
  }

  const metadata = await ErWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );
  if (!metadata) {
    throw new DataIntegrityError("ER_WORK_ITEM_METADATA_MISSING", {
      workItemId,
    });
  }

  if ((metadata.payload as any).previousStatus === undefined) {
    await mutationCtx.db.patch(metadata._id, {
      payload: {
        ...metadata.payload,
        previousStatus: patient.status,
      },
    });
  }

  await updatePatientStatus(mutationCtx.db, patient._id, nextStatus);
}

export async function revertPatientStatusForWorkItem(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">
): Promise<void> {
  const metadata = await ErWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );
  if (!metadata) {
    return;
  }

  const payloadWithStatus = metadata.payload as Record<string, unknown> & {
    previousStatus?: PatientStatus;
  };
  const previousStatus = payloadWithStatus.previousStatus;
  if (previousStatus === undefined) {
    return;
  }

  const { patient } = await getRootWorkflowAndPatientForWorkItem(
    mutationCtx.db,
    workItemId
  );

  if (patient.status !== previousStatus) {
    await updatePatientStatus(mutationCtx.db, patient._id, previousStatus);
  }

  const { previousStatus: _ignored, ...restPayload } = payloadWithStatus;
  await mutationCtx.db.patch(metadata._id, {
    payload: restPayload as Doc<"erWorkItems">["payload"],
  });
}

export async function cleanupErWorkItemOnCancel(
  mutationCtx: MutationCtx,
  workItemId: Id<"tasquencerWorkItems">
): Promise<void> {
  await revertPatientStatusForWorkItem(mutationCtx, workItemId);

  const metadata = await ErWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );

  if (metadata) {
    await mutationCtx.db.delete(metadata._id);
  }
}
