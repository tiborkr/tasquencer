import type { DatabaseReader, DatabaseWriter } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function insertDailyCheckAssessment(
  db: DatabaseWriter,
  assessment: Omit<Doc<'erDailyCheckAssessments'>, '_id' | '_creationTime'>,
): Promise<Id<'erDailyCheckAssessments'>> {
  return await db.insert('erDailyCheckAssessments', assessment)
}

export async function getLatestDailyCheckAssessment(
  db: DatabaseReader,
  workflowId: Id<'tasquencerWorkflows'>,
): Promise<Doc<'erDailyCheckAssessments'> | null> {
  const assessments = await db
    .query('erDailyCheckAssessments')
    .withIndex('by_workflow_id', (q) => q.eq('workflowId', workflowId))
    .order('desc')
    .take(1)

  return assessments[0] ?? null
}

export async function listDailyCheckAssessmentsForPatient(
  db: DatabaseReader,
  patientId: Id<'erPatients'>,
  options: { workflowId?: Id<'tasquencerWorkflows'> } = {},
): Promise<Array<Doc<'erDailyCheckAssessments'>>> {
  const workflowIdFilter = options.workflowId
  if (workflowIdFilter) {
    return await db
      .query('erDailyCheckAssessments')
      .withIndex('by_patient_id_and_root_workflow_id', (q) =>
        q.eq('patientId', patientId).eq('rootWorkflowId', workflowIdFilter),
      )
      .order('desc')
      .collect()
  }

  return await db
    .query('erDailyCheckAssessments')
    .withIndex('by_patient_id', (q) => q.eq('patientId', patientId))
    .order('desc')
    .collect()
}
