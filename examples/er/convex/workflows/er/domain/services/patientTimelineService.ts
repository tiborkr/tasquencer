import type { Doc } from '../../../../_generated/dataModel'

export type TimelineEvent = {
  id: string
  timestamp: number
  type:
    | 'admission'
    | 'triage'
    | 'hospital_admission'
    | 'diagnostics_started'
    | 'xray_completed'
    | 'blood_results'
    | 'diagnostic_review'
    | 'consult_requested'
    | 'consult_completed'
    | 'daily_check'
    | 'medication'
    | 'daily_medication'
    | 'discharge_medication'
    | 'surgery'
    | 'discharge_follow_up'
  title: string
  description?: string
  metadata?: Record<string, unknown>
}

type TimelineData = {
  patient: Doc<'erPatients'> | null
  diagnostics: Doc<'erDiagnostics'> | null
  hospitalStay: Doc<'erHospitalStays'> | null
  diagnosticReviews: Doc<'erDiagnosticReviews'>[]
  consultations: Doc<'erSpecialistConsultations'>[]
  medications: Doc<'erMedicationAdministrations'>[]
  surgeries: Doc<'erSurgeryEvents'>[]
  dailyChecks: Doc<'erDailyCheckAssessments'>[]
}

const toTitleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const pushEvent = (
  timeline: TimelineEvent[],
  event: TimelineEvent | null | undefined,
) => {
  if (!event) return
  if (typeof event.timestamp !== 'number' || Number.isNaN(event.timestamp)) {
    return
  }
  timeline.push(event)
}

function buildAdmissionEvent(patient: Doc<'erPatients'>): TimelineEvent {
  return {
    id: `patient-${patient._id}-admitted`,
    timestamp: patient._creationTime,
    type: 'admission',
    title: 'Patient admitted',
    description: patient.complaint,
  }
}

function buildTriageEvent(
  patient: Doc<'erPatients'>,
): TimelineEvent | null | undefined {
  if (!patient.triageCompletedAt) return null

  const descriptionParts = [
    patient.triageSeverity
      ? `Severity: ${toTitleCase(patient.triageSeverity)}`
      : null,
    patient.triageVitalSigns ? `Vitals: ${patient.triageVitalSigns}` : null,
  ].filter(Boolean)

  const metadata: Record<string, unknown> = {}
  if (patient.triageSeverity) {
    metadata.severity = patient.triageSeverity
  }
  if (patient.triageVitalSigns) {
    metadata.vitalSigns = patient.triageVitalSigns
  }

  return {
    id: `patient-${patient._id}-triage`,
    timestamp: patient.triageCompletedAt,
    type: 'triage',
    title: 'Triage completed',
    description: descriptionParts.length
      ? descriptionParts.join(' · ')
      : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

function buildHospitalAdmissionEvent(
  hospitalStay: Doc<'erHospitalStays'>,
): TimelineEvent | null | undefined {
  if (!hospitalStay.admissionDate) return null

  return {
    id: `hospitalStay-${hospitalStay._id}-admission`,
    timestamp: hospitalStay.admissionDate,
    type: 'hospital_admission',
    title: 'Hospital stay started',
    description:
      [hospitalStay.ward, hospitalStay.roomNumber]
        .filter(Boolean)
        .join(' · ') || undefined,
    metadata: {
      followUpRequired: hospitalStay.followUpRequired ?? false,
    },
  }
}

function buildFollowUpEvent(
  hospitalStay: Doc<'erHospitalStays'>,
): TimelineEvent | null | undefined {
  if (
    hospitalStay.followUpRequired === undefined ||
    !hospitalStay.followUpRecordedAt
  )
    return null

  return {
    id: `hospitalStay-${hospitalStay._id}-followup`,
    timestamp: hospitalStay.followUpRecordedAt,
    type: 'discharge_follow_up',
    title: hospitalStay.followUpRequired
      ? 'Follow-up required'
      : 'No follow-up needed',
    description: hospitalStay.followUpRequired
      ? 'Schedule follow-up visit before discharge completion.'
      : 'Patient cleared without follow-up obligations.',
    metadata: {
      followUpRequired: hospitalStay.followUpRequired,
      ...(hospitalStay.dischargeInstructions
        ? { dischargeInstructions: hospitalStay.dischargeInstructions }
        : {}),
    },
  }
}

function buildDiagnosticsEvents(
  diagnostics: Doc<'erDiagnostics'>,
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  events.push({
    id: `diagnostics-${diagnostics._id}-start`,
    timestamp: diagnostics._creationTime,
    type: 'diagnostics_started',
    title: 'Diagnostics initiated',
    description: `Status: ${diagnostics.status.replace(/_/g, ' ')}`,
  })

  if (diagnostics.xrayCompletedAt) {
    events.push({
      id: `diagnostics-${diagnostics._id}-xray`,
      timestamp: diagnostics.xrayCompletedAt,
      type: 'xray_completed',
      title: diagnostics.xrayIsCritical
        ? 'X-Ray flagged emergency findings'
        : 'X-Ray completed',
      description: diagnostics.xrayFindings ?? 'Results recorded',
      metadata: {
        critical: diagnostics.xrayIsCritical ?? false,
      },
    })
  }

  if (diagnostics.bloodResultsRecordedAt) {
    events.push({
      id: `diagnostics-${diagnostics._id}-blood`,
      timestamp: diagnostics.bloodResultsRecordedAt,
      type: 'blood_results',
      title: 'Blood work completed',
      description: diagnostics.bloodResults ?? 'Results recorded',
    })
  }

  return events
}

function buildDiagnosticReviewEvent(
  review: Doc<'erDiagnosticReviews'>,
): TimelineEvent {
  return {
    id: `review-${review._id}`,
    timestamp: review.completedAt,
    type: 'diagnostic_review',
    title: 'Diagnostic review completed',
    description: [
      review.consultationsNeeded.length
        ? `Consults requested: ${review.consultationsNeeded.join(', ')}`
        : null,
      `Treatment plan: ${review.treatmentPlan}`,
      review.prescribeMedication ? 'Medication prescribed' : null,
    ]
      .filter(Boolean)
      .join(' · '),
    metadata: {
      prescribeMedication: review.prescribeMedication,
    },
  }
}

function buildConsultationEvents(
  consultation: Doc<'erSpecialistConsultations'>,
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  events.push({
    id: `consult-${consultation._id}-requested`,
    timestamp: consultation.state.initializedAt,
    type: 'consult_requested',
    title: `${toTitleCase(consultation.specialty)} consultation requested`,
  })

  if (consultation.state.status === 'completed') {
    events.push({
      id: `consult-${consultation._id}-completed`,
      timestamp: consultation.state.completedAt,
      type: 'consult_completed',
      title: `${toTitleCase(consultation.specialty)} consultation completed`,
      description:
        consultation.state.recommendations || 'Recommendations recorded',
      metadata: {
        prescribeMedication: consultation.state.prescribeMedication,
      },
    })
  }

  return events
}

function buildDailyCheckEvent(
  assessment: Doc<'erDailyCheckAssessments'>,
): TimelineEvent {
  const decisionLabel =
    assessment.decision === 'readyForDischarge'
      ? 'Decision: Ready for discharge'
      : assessment.decision === 'needsMedication'
        ? 'Decision: Needs medication'
        : 'Decision: Continue observation'

  const decisionMetadata =
    assessment.decision === 'readyForDischarge'
      ? 'readyForDischarge'
      : assessment.decision === 'needsMedication'
        ? 'needsMedication'
        : 'observation'

  return {
    id: `daily-check-${assessment._id}`,
    timestamp: assessment.completedAt,
    type: 'daily_check',
    title: 'Daily check completed',
    description: [
      assessment.vitalSigns ? `Vitals: ${assessment.vitalSigns}` : null,
      decisionLabel,
    ]
      .filter(Boolean)
      .join(' · '),
    metadata: {
      decision: decisionMetadata,
    },
  }
}

function buildMedicationEvent(
  record: Doc<'erMedicationAdministrations'>,
): TimelineEvent {
  const typeMap: Record<typeof record.source, TimelineEvent['type']> = {
    initial: 'medication',
    daily: 'daily_medication',
    discharge: 'discharge_medication',
  }

  const titleMap: Record<typeof record.source, string> = {
    initial: 'Medication administered',
    daily: 'Daily medication administered',
    discharge: 'Discharge medication administered',
  }

  return {
    id: `medication-${record._id}`,
    timestamp: record.administeredAt,
    type: typeMap[record.source] ?? 'medication',
    title: titleMap[record.source] ?? 'Medication administered',
    description: record.medicationsAdministered,
    metadata: {
      source: record.source,
    },
  }
}

function buildSurgeryEvent(surgery: Doc<'erSurgeryEvents'>): TimelineEvent {
  return {
    id: `surgery-${surgery._id}`,
    timestamp: surgery.completedAt,
    type: 'surgery',
    title: 'Emergency surgery performed',
    description: surgery.notes,
  }
}

/**
 * Builds a chronologically sorted timeline of patient journey events.
 *
 * @param data - All patient-related data from the database
 * @returns Array of timeline events sorted by timestamp
 */
export function buildPatientTimeline(data: TimelineData): TimelineEvent[] {
  const timeline: TimelineEvent[] = []

  // Patient admission
  if (data.patient) {
    pushEvent(timeline, buildAdmissionEvent(data.patient))
  }

  // Triage
  if (data.patient) {
    pushEvent(timeline, buildTriageEvent(data.patient))
  }

  // Hospital admission
  if (data.hospitalStay) {
    pushEvent(timeline, buildHospitalAdmissionEvent(data.hospitalStay))
  }

  // Follow-up decision
  if (data.hospitalStay) {
    pushEvent(timeline, buildFollowUpEvent(data.hospitalStay))
  }

  // Diagnostics
  if (data.diagnostics) {
    buildDiagnosticsEvents(data.diagnostics).forEach((event) =>
      pushEvent(timeline, event),
    )
  }

  // Diagnostic reviews
  data.diagnosticReviews.forEach((review) => {
    pushEvent(timeline, buildDiagnosticReviewEvent(review))
  })

  // Consultations
  data.consultations.forEach((consultation) => {
    buildConsultationEvents(consultation).forEach((event) =>
      pushEvent(timeline, event),
    )
  })

  // Daily checks
  data.dailyChecks.forEach((assessment) => {
    pushEvent(timeline, buildDailyCheckEvent(assessment))
  })

  // Medications
  data.medications.forEach((record) => {
    pushEvent(timeline, buildMedicationEvent(record))
  })

  // Surgeries
  data.surgeries.forEach((surgery) => {
    pushEvent(timeline, buildSurgeryEvent(surgery))
  })

  return timeline.sort((a, b) => a.timestamp - b.timestamp)
}
