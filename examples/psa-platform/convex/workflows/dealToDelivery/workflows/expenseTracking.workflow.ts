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
import { DealToDeliveryWorkItemHelpers } from '../helpers'

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
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the work item ID from the completed task
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1] // Get the most recent
        if (!workItemId) {
          return route.toTask('logOtherExpense')
        }

        // Get the selected expense type from the work item metadata
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on the selected expense type
        if (metadata?.payload.type === 'selectExpenseType' && metadata.payload.expenseType) {
          switch (metadata.payload.expenseType) {
            case 'Software':
              return route.toTask('logSoftwareExpense')
            case 'Travel':
              return route.toTask('logTravelExpense')
            case 'Materials':
              return route.toTask('logMaterialsExpense')
            case 'Subcontractor':
              return route.toTask('logSubcontractorExpense')
            case 'Other':
              return route.toTask('logOtherExpense')
          }
        }

        // Default to Other expense if no type selected
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
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the work item ID from the completed task
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1] // Get the most recent
        if (!workItemId) {
          return route.toTask('submitExpense')
        }

        // Get the billable decision from the work item metadata
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on the billable decision
        // If marked as billable, go to setBillableRate to set markup
        // If not billable, skip directly to submitExpense
        if (metadata?.payload.type === 'markBillable' && metadata.payload.billable === true) {
          return route.toTask('setBillableRate')
        }

        return route.toTask('submitExpense')
      })
  )
  .connectTask('setBillableRate', (to) => to.task('submitExpense'))
  .connectTask('submitExpense', (to) => to.condition('end'))