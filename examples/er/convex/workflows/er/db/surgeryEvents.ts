import type { DatabaseReader, DatabaseWriter } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function insertSurgeryEvent(
  db: DatabaseWriter,
  event: Omit<Doc<'erSurgeryEvents'>, '_id' | '_creationTime'>,
): Promise<Id<'erSurgeryEvents'>> {
  return await db.insert('erSurgeryEvents', event)
}

export async function listSurgeryEventsForPatient(
  db: DatabaseReader,
  patientId: Id<'erPatients'>,
  options: { workflowId?: Id<'tasquencerWorkflows'> } = {},
): Promise<Array<Doc<'erSurgeryEvents'>>> {
  const workflowIdFilter = options.workflowId
  if (workflowIdFilter) {
    return await db
      .query('erSurgeryEvents')
      .withIndex('by_patient_id_and_root_workflow_id', (q) =>
        q.eq('patientId', patientId).eq('rootWorkflowId', workflowIdFilter),
      )
      .order('desc')
      .collect()
  }

  return await db
    .query('erSurgeryEvents')
    .withIndex('by_patient_id', (q) => q.eq('patientId', patientId))
    .order('desc')
    .collect()
}
