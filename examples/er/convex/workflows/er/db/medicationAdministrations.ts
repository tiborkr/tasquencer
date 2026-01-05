import type { DatabaseReader, DatabaseWriter } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'

export async function insertMedicationAdministration(
  db: DatabaseWriter,
  record: Omit<Doc<'erMedicationAdministrations'>, '_id' | '_creationTime'>,
): Promise<Id<'erMedicationAdministrations'>> {
  return await db.insert('erMedicationAdministrations', record)
}

export async function listMedicationAdministrationsForPatient(
  db: DatabaseReader,
  patientId: Id<'erPatients'>,
  options: { workflowId?: Id<'tasquencerWorkflows'> } = {},
): Promise<Array<Doc<'erMedicationAdministrations'>>> {
  const workflowIdFilter = options.workflowId
  if (workflowIdFilter) {
    return await db
      .query('erMedicationAdministrations')
      .withIndex('by_patient_id_and_root_workflow_id', (q) =>
        q.eq('patientId', patientId).eq('rootWorkflowId', workflowIdFilter),
      )
      .order('desc')
      .collect()
  }

  return await db
    .query('erMedicationAdministrations')
    .withIndex('by_patient_id', (q) => q.eq('patientId', patientId))
    .order('desc')
    .collect()
}
