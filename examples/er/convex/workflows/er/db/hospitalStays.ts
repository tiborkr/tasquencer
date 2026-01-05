import type {
  DatabaseReader,
  DatabaseWriter,
} from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { DataIntegrityError, EntityNotFoundError } from "@repo/tasquencer";

const ACTIVE_STATUS_SEARCH_LIMIT = 10;

export async function insertHospitalStay(
  db: DatabaseWriter,
  hospitalStay: Omit<Doc<"erHospitalStays">, "_id" | "_creationTime">
): Promise<Id<"erHospitalStays">> {
  const existing = await db
    .query("erHospitalStays")
    .withIndex("by_workflow_id", (q) =>
      q.eq("workflowId", hospitalStay.workflowId)
    )
    .unique();

  if (existing) {
    throw new DataIntegrityError("Hospital stay already exists", {
      workflowId: hospitalStay.workflowId,
      existingHospitalStayId: existing._id,
    });
  }

  return await db.insert("erHospitalStays", hospitalStay);
}

export async function getHospitalStayByWorkflowId(
  db: DatabaseReader,
  workflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"erHospitalStays"> | null> {
  return await db
    .query("erHospitalStays")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", workflowId))
    .unique();
}

export async function updateHospitalStay(
  db: DatabaseWriter,
  hospitalStayId: Id<"erHospitalStays">,
  updates: Partial<Omit<Doc<"erHospitalStays">, "_id" | "_creationTime">>
): Promise<void> {
  const hospitalStay = await db.get(hospitalStayId);
  if (!hospitalStay) {
    throw new EntityNotFoundError("HospitalStay", { hospitalStayId });
  }

  const merged = {
    ...hospitalStay,
    ...updates,
  };

  if ("decision" in updates && updates.decision === undefined) {
    delete (merged as Record<string, unknown>).decision;
  }

  await db.replace(hospitalStayId, merged);
}

export async function getActiveHospitalStayForPatient(
  db: DatabaseReader,
  patientId: Id<"erPatients">
): Promise<Doc<"erHospitalStays"> | null> {
  const candidates = await db
    .query("erHospitalStays")
    .withIndex("by_patient_id_and_status", (q) => q.eq("patientId", patientId))
    .order("desc")
    .take(ACTIVE_STATUS_SEARCH_LIMIT);

  return candidates.find((stay) => stay.status !== "completed") ?? null;
}

export async function getHospitalStayForPatientWorkflow(
  db: DatabaseReader,
  patientId: Id<"erPatients">,
  rootWorkflowId: Id<"tasquencerWorkflows">
): Promise<Doc<"erHospitalStays"> | null> {
  const hospitalStayWorkflow = await db
    .query("tasquencerWorkflows")
    .withIndex(
      "by_parent_workflow_id_task_name_task_generation_state_and_name",
      (q) =>
        q
          .eq("parent.workflowId", rootWorkflowId)
          .eq("parent.taskName", "hospitalStay")
    )
    .order("desc")
    .first();

  if (!hospitalStayWorkflow) {
    return null;
  }

  const stay = await getHospitalStayByWorkflowId(
    db,
    hospitalStayWorkflow._id as Id<"tasquencerWorkflows">
  );

  return stay && stay.patientId === patientId ? stay : null;
}
