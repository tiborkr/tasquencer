/**
 * Phase 1: Initiation work items
 *
 * This phase handles campaign request submission, intake review, and owner assignment.
 * Flow: submitRequest -> intakeReview -> (approved) assignOwner -> strategy phase
 *                                    -> (rejected) end
 *                                    -> (needs_changes) submitRequest
 */

export { submitRequestTask, submitRequestWorkItem } from './submitRequest.workItem'
export { intakeReviewTask, intakeReviewWorkItem } from './intakeReview.workItem'
export { assignOwnerTask, assignOwnerWorkItem } from './assignOwner.workItem'
