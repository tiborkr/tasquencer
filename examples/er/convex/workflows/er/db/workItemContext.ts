import type { DatabaseReader } from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { EntityNotFoundError } from "@repo/tasquencer";
import { getPatientByWorkflowId } from "./patients";
import { helpers } from "../../../tasquencer";

export async function getRootWorkflowAndPatientForWorkItem(
  db: DatabaseReader,
  workItemId: Id<"tasquencerWorkItems">
): Promise<{
  rootWorkflowId: Id<"tasquencerWorkflows">;
  patient: Doc<"erPatients">;
}> {
  const rootWorkflowId = await helpers.getRootWorkflowIdForWorkItem(
    db,
    workItemId
  );
  const patient = await getPatientByWorkflowId(db, rootWorkflowId);
  if (!patient) {
    throw new EntityNotFoundError("Patient", { workItemId, rootWorkflowId });
  }
  return { rootWorkflowId, patient };
}

export async function getWorkflowIdsForWorkItem(
  db: DatabaseReader,
  workItemId: Id<"tasquencerWorkItems">
): Promise<{
  workflowId: Id<"tasquencerWorkflows">;
  rootWorkflowId: Id<"tasquencerWorkflows">;
}> {
  const [workflowId, rootWorkflowId] = await Promise.all([
    helpers.getWorkflowIdForWorkItem(db, workItemId),
    helpers.getRootWorkflowIdForWorkItem(db, workItemId),
  ]);
  return { workflowId, rootWorkflowId };
}
