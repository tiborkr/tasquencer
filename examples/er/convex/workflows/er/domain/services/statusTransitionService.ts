import type { DatabaseWriter } from '../../../../_generated/server'
import type { Id } from '../../../../_generated/dataModel'
import {
  updatePatientStatus,
  getActiveHospitalStayForPatient,
  updateHospitalStay,
} from '../../db'

function buildFollowUpUpdates(followUpRequired: boolean | undefined) {
  return followUpRequired === undefined
    ? {}
    : {
        followUpRequired,
        followUpRecordedAt: Date.now(),
      }
}

export async function markPatientReadyForDischarge(
  db: DatabaseWriter,
  patientId: Id<'erPatients'>,
  rootWorkflowId: Id<'tasquencerWorkflows'>,
  options: { followUpRequired?: boolean } = {},
): Promise<void> {
  await updatePatientStatus(db, patientId, 'ready_for_discharge')

  const hospitalStay = await getActiveHospitalStayForPatient(db, patientId)
  if (!hospitalStay) {
    return
  }

  if (hospitalStay.rootWorkflowId !== rootWorkflowId) {
    return
  }

  const followUpUpdates = buildFollowUpUpdates(options.followUpRequired)

  await updateHospitalStay(db, hospitalStay._id, {
    status: 'ready_for_discharge',
    decision: {
      decision: 'readyForDischarge',
    },
    ...(hospitalStay.followUpRequired !== undefined &&
    options.followUpRequired === undefined
      ? {
          followUpRequired: hospitalStay.followUpRequired,
          followUpRecordedAt: hospitalStay.followUpRecordedAt,
        }
      : {}),
    ...followUpUpdates,
  })
}

export async function markPatientDischarged(
  db: DatabaseWriter,
  patientId: Id<'erPatients'>,
  rootWorkflowId: Id<'tasquencerWorkflows'>,
): Promise<void> {
  await updatePatientStatus(db, patientId, 'discharged')

  const hospitalStay = await getActiveHospitalStayForPatient(db, patientId)
  if (!hospitalStay || hospitalStay.status === 'completed') {
    return
  }

  if (hospitalStay.rootWorkflowId !== rootWorkflowId) {
    return
  }

  const completionUpdates: Partial<{
    followUpRequired: boolean
    followUpRecordedAt?: number
  }> =
    hospitalStay.followUpRequired !== undefined
      ? {
          followUpRequired: hospitalStay.followUpRequired,
          followUpRecordedAt: hospitalStay.followUpRecordedAt,
        }
      : {}

  await updateHospitalStay(db, hospitalStay._id, {
    status: 'completed',
    decision: {
      decision: 'readyForDischarge',
    },
    ...completionUpdates,
  })
}
