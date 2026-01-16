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
      const routes = [route.toTask('approveExpense'), route.toTask('rejectExpense')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('approveExpense', (to) => to.task('completeExpenseApproval'))
  .connectTask('rejectExpense', (to) => to.task('reviseExpense'))
  .connectTask('reviseExpense', (to) => to.task('reviewExpense'))
  .connectTask('completeExpenseApproval', (to) => to.condition('end'))