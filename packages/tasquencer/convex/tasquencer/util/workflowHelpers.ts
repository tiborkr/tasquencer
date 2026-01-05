import type { Doc, Id } from '../../_generated/dataModel'
import { StructuralIntegrityError } from '../exceptions'

export function getWorkflowRootWorkflowId(
  workflow: Doc<'tasquencerWorkflows'>,
) {
  const rootWorkflowId =
    workflow.realizedPath.length > 0
      ? (workflow.realizedPath[0] as Id<'tasquencerWorkflows'>)
      : workflow._id
  if (!rootWorkflowId) {
    throw new StructuralIntegrityError('Workflow has no root workflow ID')
  }
  return rootWorkflowId
}

export function getWorkItemRootWorkflowId(
  workItem: Doc<'tasquencerWorkItems'>,
) {
  const rootWorkflowId = workItem.realizedPath[0] as Id<'tasquencerWorkflows'>
  if (!rootWorkflowId) {
    throw new StructuralIntegrityError('Work item has no root workflow ID')
  }
  return rootWorkflowId
}
