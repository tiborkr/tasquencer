import { Builder } from '../../../tasquencer'
import { reviewExpenseTask } from '../workItems/reviewExpense.workItem'
import { approveExpenseTask } from '../workItems/approveExpense.workItem'
import { rejectExpenseTask } from '../workItems/rejectExpense.workItem'
import { reviseExpenseTask } from '../workItems/reviseExpense.workItem'

const completeExpenseApprovalTask = Builder.dummyTask()

export const expenseApprovalWorkflow = Builder.workflow('expenseApproval')
  .startCondition('start')
  .endCondition('end')
  .task('reviewExpense', reviewExpenseTask.withJoinType('xor').withSplitType('xor'))
  .task('approveExpense', approveExpenseTask)
  .task('rejectExpense', rejectExpenseTask)
  .task('reviseExpense', reviseExpenseTask)
  .dummyTask('completeExpenseApproval', completeExpenseApprovalTask)
  .connectCondition('start', (to) => to.task('reviewExpense'))
  .connectTask('reviewExpense', (to) =>
    to
      .task('approveExpense')
      .task('rejectExpense')
      .route(async ({ route, mutationCtx }) => {
        // Query the most recent reviewExpense work item metadata to get the decision
        // Use descending sort to get the most recent item (loop-safe pattern)
        const workItems = await mutationCtx.db
          .query('dealToDeliveryWorkItems')
          .filter((q) => q.eq(q.field('payload.type'), 'reviewExpense'))
          .collect()

        // Sort by creation time descending to get the most recent
        const sortedWorkItems = workItems.sort(
          (a, b) => b._creationTime - a._creationTime
        )
        const mostRecentMetadata = sortedWorkItems[0]

        // Get the decision from the payload
        const payload = mostRecentMetadata?.payload as {
          type: 'reviewExpense'
          decision?: 'approve' | 'reject'
        } | undefined

        const decision = payload?.decision

        // Route based on the decision
        if (decision === 'approve') {
          return route.toTask('approveExpense')
        } else {
          // Default to reject if no decision or decision is 'reject'
          return route.toTask('rejectExpense')
        }
      })
  )
  .connectTask('approveExpense', (to) => to.task('completeExpenseApproval'))
  .connectTask('rejectExpense', (to) => to.task('reviseExpense'))
  .connectTask('reviseExpense', (to) => to.task('reviewExpense'))
  .connectTask('completeExpenseApproval', (to) => to.condition('end'))
