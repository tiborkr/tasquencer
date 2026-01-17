import { Builder } from '../../../tasquencer'
import { selectExpenseTypeTask } from '../workItems/selectExpenseType.workItem'
import { logSoftwareExpenseTask } from '../workItems/logSoftwareExpense.workItem'
import { logTravelExpenseTask } from '../workItems/logTravelExpense.workItem'
import { logMaterialsExpenseTask } from '../workItems/logMaterialsExpense.workItem'
import { logSubcontractorExpenseTask } from '../workItems/logSubcontractorExpense.workItem'
import { logOtherExpenseTask } from '../workItems/logOtherExpense.workItem'
import { attachReceiptTask } from '../workItems/attachReceipt.workItem'
import { markBillableTask } from '../workItems/markBillable.workItem'
import { setBillableRateTask } from '../workItems/setBillableRate.workItem'
import { submitExpenseTask } from '../workItems/submitExpense.workItem'
export const expenseTrackingWorkflow = Builder.workflow('expenseTracking')
  .startCondition('start')
  .endCondition('end')
  .task('selectExpenseType', selectExpenseTypeTask.withSplitType('xor'))
  .task('logSoftwareExpense', logSoftwareExpenseTask)
  .task('logTravelExpense', logTravelExpenseTask)
  .task('logMaterialsExpense', logMaterialsExpenseTask)
  .task('logSubcontractorExpense', logSubcontractorExpenseTask)
  .task('logOtherExpense', logOtherExpenseTask)
  .task('attachReceipt', attachReceiptTask.withJoinType('xor'))
  .task('markBillable', markBillableTask.withSplitType('xor'))
  .task('setBillableRate', setBillableRateTask)
  .task('submitExpense', submitExpenseTask.withJoinType('xor'))
  .connectCondition('start', (to) => to.task('selectExpenseType'))
  .connectTask('selectExpenseType', (to) =>
    to
      .task('logSoftwareExpense')
      .task('logTravelExpense')
      .task('logMaterialsExpense')
      .task('logSubcontractorExpense')
      .task('logOtherExpense')
      .route(async ({ route }) => {
      // TODO: Track selected expense type in work item metadata to enable proper routing
      // For now, default to logOtherExpense.
      // Reference: .review/recipes/psa-platform/specs/08-workflow-expense-tracking.md
      return route.toTask('logOtherExpense')
    })
  )
  .connectTask('logSoftwareExpense', (to) => to.task('attachReceipt'))
  .connectTask('logTravelExpense', (to) => to.task('attachReceipt'))
  .connectTask('logMaterialsExpense', (to) => to.task('attachReceipt'))
  .connectTask('logSubcontractorExpense', (to) => to.task('attachReceipt'))
  .connectTask('logOtherExpense', (to) => to.task('attachReceipt'))
  .connectTask('attachReceipt', (to) => to.task('markBillable'))
  .connectTask('markBillable', (to) =>
    to
      .task('setBillableRate')
      .task('submitExpense')
      .route(async ({ route }) => {
      // TODO: Track billable decision in work item metadata to enable proper routing
      // For now, default to submitExpense (non-billable path).
      // Reference: .review/recipes/psa-platform/specs/08-workflow-expense-tracking.md
      return route.toTask('submitExpense')
    })
  )
  .connectTask('setBillableRate', (to) => to.task('submitExpense'))
  .connectTask('submitExpense', (to) => to.condition('end'))