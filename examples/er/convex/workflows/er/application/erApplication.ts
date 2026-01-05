import { type DatabaseWriter } from '../../../_generated/server'
import { type Id, type Doc } from '../../../_generated/dataModel'
import {
  insertPatient,
  updatePatientStatus,
  getWorkflowIdsForWorkItem,
  getRootWorkflowAndPatientForWorkItem,
  getDiagnosticsByWorkflowId,
  updateDiagnostics,
  insertDiagnosticReview,
  completeSpecialistConsultation,
  getSpecialistConsultationByWorkItemId,
  insertMedicationAdministration,
  insertSurgeryEvent,
  getHospitalStayByWorkflowId,
  updateHospitalStay,
  insertDailyCheckAssessment,
  getActiveHospitalStayForPatient,
} from '../db'
import type { SpecialtyType } from '../domain/services/consultationDecisionService'
import { markPatientReadyForDischarge } from '../domain/services/statusTransitionService'
import {
  assertDiagnosticsExists,
  assertHospitalStayExists,
  assertPatientMatches,
  assertSpecialistConsultationExists,
  assertSpecialistConsultationPending,
} from '../exceptions'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get and verify patient for a work item.
 * Common pattern: fetch patient, verify it matches expected ID.
 */
async function getVerifiedPatient(
  db: DatabaseWriter,
  workItemId: Id<'tasquencerWorkItems'>,
  expectedPatientId: Id<'erPatients'>,
  stage: string,
): Promise<{
  patient: Doc<'erPatients'>
  rootWorkflowId: Id<'tasquencerWorkflows'>
}> {
  const { patient, rootWorkflowId } =
    await getRootWorkflowAndPatientForWorkItem(db, workItemId)

  assertPatientMatches(patient._id, expectedPatientId, {
    workItemId,
    stage,
  })

  return { patient, rootWorkflowId }
}

/**
 * Get diagnostics for a work item's workflow.
 * Common pattern: get workflow ID, fetch diagnostics, verify exists.
 */
async function getDiagnosticsForWorkItem(
  db: DatabaseWriter,
  workItemId: Id<'tasquencerWorkItems'>,
): Promise<{
  diagnostics: Doc<'erDiagnostics'>
  workflowId: Id<'tasquencerWorkflows'>
}> {
  const { workflowId } = await getWorkflowIdsForWorkItem(db, workItemId)
  const diagnostics = await getDiagnosticsByWorkflowId(db, workflowId)
  assertDiagnosticsExists(diagnostics, workflowId)

  return { diagnostics, workflowId }
}

/**
 * Get hospital stay for a work item's workflow.
 * Common pattern: get workflow ID, fetch hospital stay, verify exists.
 */
async function getHospitalStayForWorkItem(
  db: DatabaseWriter,
  workItemId: Id<'tasquencerWorkItems'>,
): Promise<{
  hospitalStay: Doc<'erHospitalStays'>
  workflowId: Id<'tasquencerWorkflows'>
  rootWorkflowId: Id<'tasquencerWorkflows'>
}> {
  const { workflowId, rootWorkflowId } = await getWorkflowIdsForWorkItem(
    db,
    workItemId,
  )
  const hospitalStay = await getHospitalStayByWorkflowId(db, workflowId)
  assertHospitalStayExists(hospitalStay, workflowId)

  return { hospitalStay, workflowId, rootWorkflowId }
}

// ============================================================================
// Application Functions
// ============================================================================

export type InitializePatientPayload = {
  name: string
  complaint: string
}

export async function createPatientAdmission(
  db: DatabaseWriter,
  workflowId: Id<'tasquencerWorkflows'>,
  payload: InitializePatientPayload,
): Promise<Id<'erPatients'>> {
  const patientId = await insertPatient(db, {
    name: payload.name,
    complaint: payload.complaint,
    workflowId,
    status: 'triage',
  })

  return patientId
}

export async function completeTriageTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    severity: 'routine' | 'urgent' | 'critical'
    vitalSigns: string
  },
): Promise<void> {
  const { patient } = await getVerifiedPatient(
    db,
    args.workItemId,
    args.patientId,
    'triage',
  )

  await db.replace(patient._id, {
    ...patient,
    status: 'diagnostics',
    triageSeverity: args.severity,
    triageVitalSigns: args.vitalSigns,
    triageCompletedAt: Date.now(),
  })
}

export async function completeXRayTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    findings: string
    isCritical: boolean
  },
): Promise<void> {
  const { diagnostics } = await getDiagnosticsForWorkItem(db, args.workItemId)

  await updateDiagnostics(db, diagnostics._id, {
    xrayFindings: args.findings,
    xrayIsCritical: args.isCritical,
    xrayCompletedAt: Date.now(),
    ...(diagnostics.status === 'completed' ? {} : { status: 'in_progress' }),
  })
}

export async function completeBloodWorkTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    results: string
  },
): Promise<void> {
  const { diagnostics } = await getDiagnosticsForWorkItem(db, args.workItemId)

  await updateDiagnostics(db, diagnostics._id, {
    bloodResults: args.results,
    bloodResultsRecordedAt: Date.now(),
    status: 'completed',
  })
}

export async function completeSurgeryTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    notes: string
  },
): Promise<void> {
  const { rootWorkflowId, patient } = await getVerifiedPatient(
    db,
    args.workItemId,
    args.patientId,
    'surgery',
  )

  await insertSurgeryEvent(db, {
    patientId: patient._id,
    workflowId: rootWorkflowId,
    rootWorkflowId,
    workItemId: args.workItemId,
    notes: args.notes,
    completedAt: Date.now(),
  })

  await updatePatientStatus(db, patient._id, 'treatment')
}

export async function completeReviewTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    consultationsNeeded: SpecialtyType[]
    treatmentPlan: string
    prescribeMedication?: boolean
  },
): Promise<void> {
  const { rootWorkflowId, patient } =
    await getRootWorkflowAndPatientForWorkItem(db, args.workItemId)

  assertPatientMatches(patient._id, args.patientId, {
    workItemId: args.workItemId,
    stage: 'diagnosticReview',
  })

  await insertDiagnosticReview(db, {
    patientId: patient._id,
    workflowId: rootWorkflowId,
    rootWorkflowId,
    workItemId: args.workItemId,
    consultationsNeeded: args.consultationsNeeded,
    treatmentPlan: args.treatmentPlan,
    prescribeMedication: args.prescribeMedication ?? false,
    completedAt: Date.now(),
  })

  if (args.consultationsNeeded.length > 0) {
    await updatePatientStatus(db, patient._id, 'consultation')
  } else {
    await updatePatientStatus(db, patient._id, 'treatment')
  }
}

export async function completeConsultTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    recommendations: string
    prescribeMedication?: boolean
    title?: string
    description?: string
  },
): Promise<void> {
  const { patient } = await getRootWorkflowAndPatientForWorkItem(
    db,
    args.workItemId,
  )

  const consultation = await getSpecialistConsultationByWorkItemId(
    db,
    args.workItemId,
  )
  assertSpecialistConsultationExists(consultation, {
    workItemId: args.workItemId,
  })

  assertPatientMatches(consultation.patientId, patient._id, {
    workItemId: args.workItemId,
    stage: 'specialistConsult',
  })

  assertSpecialistConsultationPending(consultation, {
    workItemId: args.workItemId,
    patientId: consultation.patientId,
  })

  await completeSpecialistConsultation(db, {
    workItemId: consultation.workItemId,
    recommendations: args.recommendations,
    prescribeMedication: args.prescribeMedication ?? false,
    title: args.title,
    description: args.description,
  })
}

export async function completeMedicationTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    medicationsAdministered: string
  },
): Promise<void> {
  const { rootWorkflowId, patient } = await getVerifiedPatient(
    db,
    args.workItemId,
    args.patientId,
    'administerMedication',
  )

  await insertMedicationAdministration(db, {
    patientId: patient._id,
    workflowId: rootWorkflowId,
    rootWorkflowId,
    workItemId: args.workItemId,
    medicationsAdministered: args.medicationsAdministered,
    administeredAt: Date.now(),
    source: 'discharge',
  })

  const hospitalStay = await getActiveHospitalStayForPatient(db, patient._id)
  if (hospitalStay && hospitalStay.rootWorkflowId === rootWorkflowId) {
    await updateHospitalStay(db, hospitalStay._id, {
      status: 'in_care',
      decision: undefined,
    })
  }
}

export async function completeHospitalAdmissionTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    roomNumber: string
    ward: string
  },
): Promise<void> {
  const { hospitalStay } = await getHospitalStayForWorkItem(db, args.workItemId)

  assertPatientMatches(hospitalStay.patientId, args.patientId, {
    workItemId: args.workItemId,
    stage: 'hospitalAdmission',
  })

  await updateHospitalStay(db, hospitalStay._id, {
    roomNumber: args.roomNumber,
    ward: args.ward,
    admissionDate: Date.now(),
    status: 'admitted',
  })

  await updatePatientStatus(db, hospitalStay.patientId, 'admitted')
}

export async function completeDailyCheckTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    vitalSigns: string
    decision?: 'readyForDischarge' | 'needsMedication'
  },
): Promise<void> {
  const { hospitalStay, workflowId, rootWorkflowId } =
    await getHospitalStayForWorkItem(db, args.workItemId)

  assertPatientMatches(hospitalStay.patientId, args.patientId, {
    workItemId: args.workItemId,
    stage: 'dailyCheck',
  })

  await insertDailyCheckAssessment(db, {
    patientId: hospitalStay.patientId,
    workflowId,
    rootWorkflowId,
    workItemId: args.workItemId,
    vitalSigns: args.vitalSigns,
    completedAt: Date.now(),
    ...(args.decision ? { decision: args.decision } : {}),
  })

  const nextStatus =
    args.decision === 'readyForDischarge' ? 'ready_for_discharge' : 'in_care'

  const nextDecision =
    args.decision === 'readyForDischarge'
      ? {
          decision: 'readyForDischarge' as const,
        }
      : args.decision === 'needsMedication'
        ? {
            decision: 'inCare' as const,
            needsMedication: true as const,
          }
        : undefined

  await updateHospitalStay(db, hospitalStay._id, {
    status: nextStatus,
    decision: nextDecision,
  })
}

export async function completeDailyMedicationTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    medicationsAdministered: string
  },
): Promise<void> {
  const { hospitalStay, rootWorkflowId } = await getHospitalStayForWorkItem(
    db,
    args.workItemId,
  )
  assertPatientMatches(hospitalStay.patientId, args.patientId, {
    workItemId: args.workItemId,
    stage: 'dailyMedication',
  })

  await insertMedicationAdministration(db, {
    patientId: hospitalStay.patientId,
    workflowId: rootWorkflowId,
    rootWorkflowId,
    workItemId: args.workItemId,
    medicationsAdministered: args.medicationsAdministered,
    administeredAt: Date.now(),
    source: 'daily',
  })

  await updateHospitalStay(db, hospitalStay._id, {
    status: 'in_care',
    decision: undefined,
  })
}

export async function completeDischargePreparationTask(
  db: DatabaseWriter,
  args: {
    workItemId: Id<'tasquencerWorkItems'>
    patientId: Id<'erPatients'>
    dischargeInstructions: string
    followUpRequired: boolean
  },
): Promise<void> {
  const { hospitalStay, rootWorkflowId } = await getHospitalStayForWorkItem(
    db,
    args.workItemId,
  )

  assertPatientMatches(hospitalStay.patientId, args.patientId, {
    workItemId: args.workItemId,
    stage: 'dischargePreparation',
  })

  await updateHospitalStay(db, hospitalStay._id, {
    dischargeInstructions: args.dischargeInstructions,
  })

  await markPatientReadyForDischarge(db, args.patientId, rootWorkflowId, {
    followUpRequired: args.followUpRequired,
  })
}
