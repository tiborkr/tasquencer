import { v } from 'convex/values'
import { mutation, query } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { api } from '../../../_generated/api'
import {
  getPatient,
  getPatientByWorkflowId,
  listPatients,
  getDiagnosticsByPatientId,
  listDiagnosticReviewsForPatient,
  listSpecialistConsultationsForPatient,
  listMedicationAdministrationsForPatient,
  listSurgeryEventsForPatient,
  listDailyCheckAssessmentsForPatient,
  getActiveHospitalStayForPatient,
  getHospitalStayForPatientWorkflow,
} from '../db'
import { assertPatientExists } from '../exceptions'
import { requireErStaffMember } from '../domain/services/authorizationService'
import { buildPatientTimeline } from '../domain/services/patientTimelineService'
import { erPatientJourneyVersionManager } from '../definition'

const {
  helpers: { getWorkflowTaskStates },
} = erPatientJourneyVersionManager.apiForVersion('v1')

export const listAllPatients = query({
  args: {},
  handler: async (ctx) => {
    await requireErStaffMember(ctx)
    return await listPatients(ctx.db)
  },
})

export const getPatientById = query({
  args: { patientId: v.id('erPatients') },
  handler: async (ctx, args) => {
    await requireErStaffMember(ctx)
    return await getPatient(ctx.db, args.patientId)
  },
})

export const getPatientJourneyDetails = query({
  args: { patientId: v.id('erPatients') },
  handler: async (ctx, args) => {
    await requireErStaffMember(ctx)
    const patient = await getPatient(ctx.db, args.patientId)
    const rootWorkflowId = patient?.workflowId ?? null

    // Create options object with optional workflowId for all queries
    const options = { workflowId: rootWorkflowId ?? undefined }

    // Execute all queries in parallel for ~7x performance improvement
    const [
      diagnostics,
      diagnosticReviews,
      consultations,
      medications,
      surgeries,
      dailyChecks,
      hospitalStay,
    ] = await Promise.all([
      getDiagnosticsByPatientId(ctx.db, args.patientId, options),
      listDiagnosticReviewsForPatient(ctx.db, args.patientId, options),
      listSpecialistConsultationsForPatient(ctx.db, args.patientId, options),
      listMedicationAdministrationsForPatient(ctx.db, args.patientId, options),
      listSurgeryEventsForPatient(ctx.db, args.patientId, options),
      listDailyCheckAssessmentsForPatient(ctx.db, args.patientId, options),
      rootWorkflowId && patient
        ? getHospitalStayForPatientWorkflow(
            ctx.db,
            args.patientId,
            rootWorkflowId,
          )
        : Promise.resolve(null),
    ])

    const timeline = buildPatientTimeline({
      patient,
      diagnostics,
      hospitalStay,
      diagnosticReviews,
      consultations,
      medications,
      surgeries,
      dailyChecks,
    })

    return {
      diagnostics,
      hospitalStay,
      latestReview: diagnosticReviews[0] ?? null,
      diagnosticReviews,
      consultations,
      medications,
      surgeries,
      dailyChecks,
      timeline,
    }
  },
})

export const getPatientJourneyTaskStates = query({
  args: { workflowId: v.id('tasquencerWorkflows') },

  handler: async (ctx, args) => {
    await requireErStaffMember(ctx)
    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'erPatientJourney',
      workflowId: args.workflowId,
    })
  },
})

export const getHospitalStayTaskStates = query({
  args: { patientId: v.id('erPatients') },

  handler: async (ctx, args) => {
    await requireErStaffMember(ctx)
    const patient = await getPatient(ctx.db, args.patientId)
    if (!patient) return null

    const hospitalStay = await getActiveHospitalStayForPatient(
      ctx.db,
      args.patientId,
    )

    if (!hospitalStay) return null

    return await getWorkflowTaskStates(ctx.db, {
      workflowName: 'hospitalStay',
      workflowId: hospitalStay.workflowId,
    })
  },
})

/**
 * Initializes a new patient journey workflow.
 * This is the entry point for admitting a new patient to the ER.
 *
 * @param args.name - Patient's name
 * @param args.complaint - Patient's chief complaint
 * @returns The newly created patient's ID
 */
export const initializePatientJourney = mutation({
  args: {
    name: v.string(),
    complaint: v.string(),
  },

  handler: async (ctx, args): Promise<Id<'erPatients'>> => {
    const workflowId = await ctx.runMutation(
      api.workflows.er.api.workflow.initializeRootWorkflow,
      {
        payload: {
          name: args.name,
          complaint: args.complaint,
        },
      },
    )

    const patient = await getPatientByWorkflowId(ctx.db, workflowId)
    assertPatientExists(patient, workflowId)

    return patient._id
  },
})
