import type { DatabaseReader, DatabaseWriter } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function insertDiagnosticReview(
  db: DatabaseWriter,
  review: Omit<Doc<'erDiagnosticReviews'>, '_id' | '_creationTime'>,
): Promise<Id<'erDiagnosticReviews'>> {
  return await db.insert('erDiagnosticReviews', review)
}

export async function getLatestDiagnosticReviewForPatient(
  db: DatabaseReader,
  patientId: Id<'erPatients'>,
  options: { workflowId?: Id<'tasquencerWorkflows'> } = {},
): Promise<Doc<'erDiagnosticReviews'> | null> {
  const workflowIdFilter = options.workflowId
  if (workflowIdFilter) {
    const reviews = await db
      .query('erDiagnosticReviews')
      .withIndex('by_patient_id_and_root_workflow_id', (q) =>
        q.eq('patientId', patientId).eq('rootWorkflowId', workflowIdFilter),
      )
      .order('desc')
      .take(1)

    return reviews[0] ?? null
  }

  const reviews = await db
    .query('erDiagnosticReviews')
    .withIndex('by_patient_id', (q) => q.eq('patientId', patientId))
    .order('desc')
    .take(1)

  return reviews[0] ?? null
}

export async function listDiagnosticReviewsForPatient(
  db: DatabaseReader,
  patientId: Id<'erPatients'>,
  options: { workflowId?: Id<'tasquencerWorkflows'> } = {},
): Promise<Array<Doc<'erDiagnosticReviews'>>> {
  const workflowIdFilter = options.workflowId
  if (workflowIdFilter) {
    return await db
      .query('erDiagnosticReviews')
      .withIndex('by_patient_id_and_root_workflow_id', (q) =>
        q.eq('patientId', patientId).eq('rootWorkflowId', workflowIdFilter),
      )
      .order('desc')
      .collect()
  }

  return await db
    .query('erDiagnosticReviews')
    .withIndex('by_patient_id', (q) => q.eq('patientId', patientId))
    .order('desc')
    .collect()
}
