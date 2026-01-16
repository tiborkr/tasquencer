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
      const routes = [route.toTask('logSoftwareExpense'), route.toTask('logTravelExpense'), route.toTask('logMaterialsExpense'), route.toTask('logSubcontractorExpense'), route.toTask('logOtherExpense')]
      return routes[Math.floor(Math.random() * routes.length)]!
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
      const routes = [route.toTask('setBillableRate'), route.toTask('submitExpense')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('setBillableRate', (to) => to.task('submitExpense'))
  .connectTask('submitExpense', (to) => to.condition('end'))