import type {
  DatabaseReader,
  DatabaseWriter,
} from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { EntityNotFoundError } from "@repo/tasquencer";
import { helpers } from "../../../tasquencer";

export async function insertPatient(
  db: DatabaseWriter,
  patient: Omit<Doc<"erPatients">, "_id" | "_creationTime">
): Promise<Id<"erPatients">> {
  return await db.insert("erPatients", patient);
}

export async function getPatientByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"erPatients"> | null> {
  const rootWorkflowId = await helpers.getRootWorkflowId(db, workflowId);
  return await db
    .query("erPatients")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", rootWorkflowId))
    .unique();
}

export async function updatePatientStatus(
  db: DatabaseWriter,
  patientId: Id<"erPatients">,
  status: Doc<"erPatients">["status"]
): Promise<void> {
  const patient = await db.get(patientId);
  if (!patient) {
    throw new EntityNotFoundError("Patient", { patientId });
  }

  await db.replace(patientId, { ...patient, status });
}

export async function getPatient(
  db: DatabaseReader,
  patientId: Id<"erPatients">
): Promise<Doc<"erPatients"> | null> {
  return await db.get(patientId);
}

export async function listPatients(
  db: DatabaseReader
): Promise<Array<Doc<"erPatients">>> {
  return await db.query("erPatients").order("desc").take(50);
}
