/**
 * Phase 4: Creative Development
 *
 * Workflow: createBrief → developConcepts → internalReview →
 *   XOR split based on decision:
 *     - approved → legalReview →
 *         XOR split based on decision:
 *           - approved → finalApproval → (Phase 5)
 *           - needs_changes → legalRevise → (loop to legalReview)
 *     - needs_revision → reviseAssets → (loop to internalReview)
 */

export {
  createBriefWorkItem,
  createBriefTask,
} from './createBrief.workItem'

export {
  developConceptsWorkItem,
  developConceptsTask,
} from './developConcepts.workItem'

export {
  internalReviewWorkItem,
  internalReviewTask,
} from './internalReview.workItem'

export {
  reviseAssetsWorkItem,
  reviseAssetsTask,
} from './reviseAssets.workItem'

export {
  legalReviewWorkItem,
  legalReviewTask,
} from './legalReview.workItem'

export {
  legalReviseWorkItem,
  legalReviseTask,
} from './legalRevise.workItem'

export {
  finalApprovalWorkItem,
  finalApprovalTask,
} from './finalApproval.workItem'
