import { Builder } from '../../../tasquencer'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import { reviewTimesheetTask } from '../workItems/reviewTimesheet.workItem'
import { approveTimesheetTask } from '../workItems/approveTimesheet.workItem'
import { rejectTimesheetTask } from '../workItems/rejectTimesheet.workItem'
import { reviseTimesheetTask } from '../workItems/reviseTimesheet.workItem'
const completeApprovalTask = Builder.dummyTask()
export const timesheetApprovalWorkflow = Builder.workflow('timesheetApproval')
  .startCondition('start')
  .endCondition('end')
  .task('reviewTimesheet', reviewTimesheetTask.withJoinType('xor').withSplitType('xor'))
  .task('approveTimesheet', approveTimesheetTask)
  .task('rejectTimesheet', rejectTimesheetTask)
  .task('reviseTimesheet', reviseTimesheetTask)
  .dummyTask('completeApproval', completeApprovalTask)
  .connectCondition('start', (to) => to.task('reviewTimesheet'))
  .connectTask('reviewTimesheet', (to) =>
    to
      .task('approveTimesheet')
      .task('rejectTimesheet')
      .route(async ({ mutationCtx, route, workItem }) => {
        // Get all completed work items for the reviewTimesheet task
        const workItemIds = await workItem.getAllWorkItemIds()

        // Get the most recent completed work item's metadata to check the decision
        // In practice there should only be one work item per task execution
        for (const workItemId of workItemIds) {
          const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
            mutationCtx.db,
            workItemId
          )

          if (metadata?.payload.type === 'reviewTimesheet' && metadata.payload.decision) {
            if (metadata.payload.decision === 'approve') {
              return route.toTask('approveTimesheet')
            } else if (metadata.payload.decision === 'reject') {
              return route.toTask('rejectTimesheet')
            }
          }
        }

        // Fallback: if no decision found, default to approve
        // This should not happen in normal operation
        return route.toTask('approveTimesheet')
      })
  )
  .connectTask('approveTimesheet', (to) => to.task('completeApproval'))
  .connectTask('rejectTimesheet', (to) => to.task('reviseTimesheet'))
  .connectTask('reviseTimesheet', (to) => to.task('reviewTimesheet'))
  .connectTask('completeApproval', (to) => to.condition('end'))