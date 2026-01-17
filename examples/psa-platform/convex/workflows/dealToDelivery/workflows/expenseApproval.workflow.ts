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
      .route(async ({ route }) => {
        // TODO: Track approval decision in work item metadata to enable proper routing
        // For now, default to approve path. Rejection would require storing decision during reviewExpense completion.
        // Reference: .review/recipes/psa-platform/specs/10-workflow-expense-approval.md
        return route.toTask('approveExpense')
      })
  )
  .connectTask('approveExpense', (to) => to.task('completeExpenseApproval'))
  .connectTask('rejectExpense', (to) => to.task('reviseExpense'))
  .connectTask('reviseExpense', (to) => to.task('reviewExpense'))
  .connectTask('completeExpenseApproval', (to) => to.condition('end'))