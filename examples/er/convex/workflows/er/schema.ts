import { defineTable } from "convex/server";
import { v } from "convex/values";
import { defineWorkItemMetadataTable } from "@repo/tasquencer";
// ER Patient Journey workflow domain
const patientStatus = v.union(
  v.literal("triage"),
  v.literal("diagnostics"),
  v.literal("emergency_surgery"),
  v.literal("review"),
  v.literal("consultation"),
  v.literal("treatment"),
  v.literal("admitted"),
  v.literal("ready_for_discharge"),
  v.literal("discharged")
);

const erPatients = defineTable({
  name: v.string(),
  complaint: v.string(),
  workflowId: v.id("tasquencerWorkflows"),
  triageSeverity: v.optional(
    v.union(v.literal("routine"), v.literal("urgent"), v.literal("critical"))
  ),
  triageVitalSigns: v.optional(v.string()),
  triageCompletedAt: v.optional(v.number()),
  status: patientStatus,
}).index("by_workflow_id", ["workflowId"]);

const erUsers = defineTable({
  name: v.string(),
  role: v.union(
    v.literal("triage_nurse"),
    v.literal("senior_doctor"),
    v.literal("cardiologist"),
    v.literal("neurologist"),
    v.literal("floor_nurse"),
    v.literal("surgeon"),
    v.literal("radiologist"),
    v.literal("lab_technician"),
    v.literal("admissions_clerk"),
    v.literal("discharge_coordinator")
  ),
});

const erDiagnostics = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  xrayFindings: v.optional(v.string()),
  xrayIsCritical: v.optional(v.boolean()),
  xrayCompletedAt: v.optional(v.number()),
  bloodResults: v.optional(v.string()),
  bloodResultsRecordedAt: v.optional(v.number()),
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed")
  ),
})
  .index("by_patient_id", ["patientId"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_root_workflow_id", ["rootWorkflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"]);

const erHospitalStays = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  roomNumber: v.optional(v.string()),
  ward: v.optional(v.string()),
  dischargeInstructions: v.optional(v.string()),
  admissionDate: v.optional(v.number()),
  decision: v.optional(
    v.union(
      v.object({
        decision: v.literal("readyForDischarge"),
      }),
      v.object({
        decision: v.literal("inCare"),
        needsMedication: v.boolean(),
      })
    )
  ),
  followUpRequired: v.optional(v.boolean()),
  followUpRecordedAt: v.optional(v.number()),
  status: v.union(
    v.literal("pending"),
    v.literal("admitted"),
    v.literal("in_care"),
    v.literal("ready_for_discharge"),
    v.literal("completed")
  ),
})
  .index("by_patient_id", ["patientId"])
  .index("by_patient_id_and_status", ["patientId", "status"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_root_workflow_id", ["rootWorkflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"]);

const erDiagnosticReviews = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  workItemId: v.id("tasquencerWorkItems"),
  consultationsNeeded: v.array(
    v.union(v.literal("cardiologist"), v.literal("neurologist"))
  ),
  treatmentPlan: v.string(),
  prescribeMedication: v.boolean(),
  completedAt: v.number(),
})
  .index("by_patient_id", ["patientId"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"])
  .index("by_work_item_id", ["workItemId"]);

const erSpecialistConsultations = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  workItemId: v.id("tasquencerWorkItems"),
  specialty: v.union(v.literal("cardiologist"), v.literal("neurologist")),
  state: v.union(
    v.object({
      status: v.literal("pending"),
      initializedAt: v.number(),
    }),
    v.object({
      status: v.literal("completed"),
      initializedAt: v.number(),
      recommendations: v.string(),
      prescribeMedication: v.boolean(),
      completedAt: v.number(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
    })
  ),
})
  .index("by_patient_id", ["patientId"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"])
  .index("by_patient_specialty", ["patientId", "specialty"])
  .index("by_work_item_id", ["workItemId"]);

const erDailyCheckAssessments = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  workItemId: v.id("tasquencerWorkItems"),
  vitalSigns: v.string(),
  decision: v.optional(
    v.union(v.literal("readyForDischarge"), v.literal("needsMedication"))
  ),
  completedAt: v.number(),
})
  .index("by_patient_id", ["patientId"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_root_workflow_id", ["rootWorkflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"])
  .index("by_work_item_id", ["workItemId"]);

const erMedicationAdministrations = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  workItemId: v.id("tasquencerWorkItems"),
  medicationsAdministered: v.string(),
  administeredAt: v.number(),
  source: v.union(
    v.literal("initial"),
    v.literal("daily"),
    v.literal("discharge")
  ),
})
  .index("by_patient_id", ["patientId"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"])
  .index("by_work_item_id", ["workItemId"]);

const erSurgeryEvents = defineTable({
  patientId: v.id("erPatients"),
  workflowId: v.id("tasquencerWorkflows"),
  rootWorkflowId: v.optional(v.id("tasquencerWorkflows")),
  workItemId: v.id("tasquencerWorkItems"),
  notes: v.string(),
  completedAt: v.number(),
})
  .index("by_patient_id", ["patientId"])
  .index("by_workflow_id", ["workflowId"])
  .index("by_patient_id_and_root_workflow_id", ["patientId", "rootWorkflowId"])
  .index("by_work_item_id", ["workItemId"]);

// ER Workflow Work Items - Typed metadata table for all ER work items
const erWorkItems = defineWorkItemMetadataTable("erPatients").withPayload(
  v.union(
    v.object({
      type: v.literal("triagePatient"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("conductXRay"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("analyzeBloodSample"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("reviewDiagnostics"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("specialistConsult"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
      specialty: v.union(v.literal("cardiologist"), v.literal("neurologist")),
    }),
    v.object({
      type: v.literal("administerMedication"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("performSurgery"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("admitToHospital"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("performDailyCheck"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("administerDailyMedication"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    }),
    v.object({
      type: v.literal("prepareForDischarge"),
      taskName: v.string(),
      priority: v.union(
        v.literal("routine"),
        v.literal("urgent"),
        v.literal("critical")
      ),
      previousStatus: v.optional(patientStatus),
    })
  )
);

export default {
  erPatients,
  erUsers,
  erDiagnostics,
  erHospitalStays,
  erDiagnosticReviews,
  erSpecialistConsultations,
  erDailyCheckAssessments,
  erMedicationAdministrations,
  erSurgeryEvents,
  erWorkItems,
};
