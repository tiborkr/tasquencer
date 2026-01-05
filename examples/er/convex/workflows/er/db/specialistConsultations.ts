import type {
  DatabaseReader,
  DatabaseWriter,
} from "../../../_generated/server";
import type { Doc, Id } from "../../../_generated/dataModel";
import { EntityNotFoundError } from "@repo/tasquencer";
import { assertSpecialistConsultationPending } from "../exceptions";

export async function createPendingSpecialistConsultation(
  db: DatabaseWriter,
  args: {
    patientId: Id<"erPatients">;
    workflowId: Id<"tasquencerWorkflows">;
    rootWorkflowId: Id<"tasquencerWorkflows">;
    workItemId: Id<"tasquencerWorkItems">;
    specialty: Doc<"erSpecialistConsultations">["specialty"];
  }
): Promise<Id<"erSpecialistConsultations">> {
  const existing = await getSpecialistConsultationByWorkItemId(
    db,
    args.workItemId
  );
  if (existing) {
    if (existing.state.status === "completed") {
      await db.replace(existing._id, {
        ...existing,
        state: {
          status: "pending",
          initializedAt: Date.now(),
        },
      });
    }
    return existing._id;
  }

  return await db.insert("erSpecialistConsultations", {
    patientId: args.patientId,
    workflowId: args.workflowId,
    rootWorkflowId: args.rootWorkflowId,
    workItemId: args.workItemId,
    specialty: args.specialty,
    state: {
      status: "pending",
      initializedAt: Date.now(),
    },
  });
}

export async function listSpecialistConsultationsForPatient(
  db: DatabaseReader,
  patientId: Id<"erPatients">,
  options: { workflowId?: Id<"tasquencerWorkflows"> } = {}
): Promise<Array<Doc<"erSpecialistConsultations">>> {
  const workflowIdFilter = options.workflowId;
  if (workflowIdFilter) {
    return await db
      .query("erSpecialistConsultations")
      .withIndex("by_patient_id_and_root_workflow_id", (q) =>
        q.eq("patientId", patientId).eq("rootWorkflowId", workflowIdFilter)
      )
      .order("desc")
      .collect();
  }

  return await db
    .query("erSpecialistConsultations")
    .withIndex("by_patient_id", (q) => q.eq("patientId", patientId))
    .order("desc")
    .collect();
}

export async function getSpecialistConsultationByWorkItemId(
  db: DatabaseReader,
  workItemId: Id<"tasquencerWorkItems">
): Promise<Doc<"erSpecialistConsultations"> | null> {
  return await db
    .query("erSpecialistConsultations")
    .withIndex("by_work_item_id", (q) => q.eq("workItemId", workItemId))
    .unique();
}

export async function getSpecialistConsultationForPatientAndSpecialty(
  db: DatabaseReader,
  patientId: Id<"erPatients">,
  specialty: Doc<"erSpecialistConsultations">["specialty"]
): Promise<Doc<"erSpecialistConsultations"> | null> {
  return await db
    .query("erSpecialistConsultations")
    .withIndex("by_patient_specialty", (q) =>
      q.eq("patientId", patientId).eq("specialty", specialty)
    )
    .order("desc")
    .first();
}

export async function completeSpecialistConsultation(
  db: DatabaseWriter,
  args: {
    workItemId: Id<"tasquencerWorkItems">;
    recommendations: string;
    prescribeMedication: boolean;
    title?: string;
    description?: string;
  }
): Promise<void> {
  const consultation = await getSpecialistConsultationByWorkItemId(
    db,
    args.workItemId
  );
  if (!consultation) {
    throw new EntityNotFoundError("SpecialistConsultation", args);
  }

  assertSpecialistConsultationPending(consultation, {
    workItemId: args.workItemId,
    patientId: consultation.patientId,
  });

  const { initializedAt } = consultation.state;

  const completedState: Exclude<
    Doc<"erSpecialistConsultations">["state"],
    { status: "pending"; initializedAt: number }
  > = {
    status: "completed",
    initializedAt,
    recommendations: args.recommendations,
    prescribeMedication: args.prescribeMedication,
    completedAt: Date.now(),
  };

  if (args.title) {
    completedState.title = args.title;
  }

  if (args.description) {
    completedState.description = args.description;
  }

  await db.replace(consultation._id, {
    ...consultation,
    state: completedState,
  });
}
