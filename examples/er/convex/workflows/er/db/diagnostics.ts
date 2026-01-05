import type {
  DatabaseReader,
  DatabaseWriter,
} from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { EntityNotFoundError } from "@repo/tasquencer";

export async function insertDiagnostics(
  db: DatabaseWriter,
  diagnostics: Omit<Doc<"erDiagnostics">, "_id" | "_creationTime">
): Promise<Id<"erDiagnostics">> {
  return await db.insert("erDiagnostics", diagnostics);
}

export async function getDiagnosticsByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"erDiagnostics"> | null> {
  return await db
    .query("erDiagnostics")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", workflowId))
    .unique();
}

export async function updateDiagnostics(
  db: DatabaseWriter,
  diagnosticsId: Id<"erDiagnostics">,
  updates: Partial<Omit<Doc<"erDiagnostics">, "_id" | "_creationTime">>
): Promise<void> {
  const diagnostics = await db.get(diagnosticsId);
  if (!diagnostics) {
    throw new EntityNotFoundError("Diagnostics", { diagnosticsId });
  }

  await db.replace(diagnosticsId, { ...diagnostics, ...updates });
}

export async function getDiagnosticsByPatientId(
  db: DatabaseReader,
  patientId: Id<"erPatients">,
  options: { workflowId?: Id<"tasquencerWorkflows"> } = {}
): Promise<Doc<"erDiagnostics"> | null> {
  const workflowIdFilter = options.workflowId;
  if (workflowIdFilter) {
    return await db
      .query("erDiagnostics")
      .withIndex("by_patient_id_and_root_workflow_id", (q) =>
        q.eq("patientId", patientId).eq("rootWorkflowId", workflowIdFilter)
      )
      .order("desc")
      .first();
  }

  return await db
    .query("erDiagnostics")
    .withIndex("by_patient_id", (q) => q.eq("patientId", patientId))
    .order("desc")
    .first();
}
