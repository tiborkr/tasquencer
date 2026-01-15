import { Builder } from '../../../tasquencer'
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
      .route(async ({ route, mutationCtx }) => {
        // Query the most recent reviewTimesheet work item metadata to get the decision
        // Use descending sort to get the most recent item (loop-safe pattern)
        const workItems = await mutationCtx.db
          .query('dealToDeliveryWorkItems')
          .filter((q) => q.eq(q.field('payload.type'), 'reviewTimesheet'))
          .collect()

        // Sort by creation time descending to get the most recent
        const sortedWorkItems = workItems.sort(
          (a, b) => b._creationTime - a._creationTime
        )
        const mostRecentMetadata = sortedWorkItems[0]

        // Get the decision from the payload
        const payload = mostRecentMetadata?.payload as {
          type: 'reviewTimesheet'
          decision?: 'approve' | 'reject'
        } | undefined

        const decision = payload?.decision

        // Route based on the decision
        if (decision === 'approve') {
          return route.toTask('approveTimesheet')
        } else {
          // Default to reject if no decision or decision is 'reject'
          return route.toTask('rejectTimesheet')
        }
      })
  )
  .connectTask('approveTimesheet', (to) => to.task('completeApproval'))
  .connectTask('rejectTimesheet', (to) => to.task('reviseTimesheet'))
  .connectTask('reviseTimesheet', (to) => to.task('reviewTimesheet'))
  .connectTask('completeApproval', (to) => to.condition('end'))
