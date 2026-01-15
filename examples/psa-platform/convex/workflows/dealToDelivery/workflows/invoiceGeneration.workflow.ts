import { Builder } from '../../../tasquencer'
import { selectInvoicingMethodTask } from '../workItems/selectInvoicingMethod.workItem'
import { invoiceTimeAndMaterialsTask } from '../workItems/invoiceTimeAndMaterials.workItem'
import { invoiceFixedFeeTask } from '../workItems/invoiceFixedFee.workItem'
import { invoiceMilestoneTask } from '../workItems/invoiceMilestone.workItem'
import { invoiceRecurringTask } from '../workItems/invoiceRecurring.workItem'
import { reviewDraftTask } from '../workItems/reviewDraft.workItem'
import { editDraftTask } from '../workItems/editDraft.workItem'
import { finalizeInvoiceTask } from '../workItems/finalizeInvoice.workItem'

export const invoiceGenerationWorkflow = Builder.workflow('invoiceGeneration')
  .startCondition('start')
  .endCondition('end')
  .task('selectInvoicingMethod', selectInvoicingMethodTask.withSplitType('xor'))
  .task('invoiceTimeAndMaterials', invoiceTimeAndMaterialsTask)
  .task('invoiceFixedFee', invoiceFixedFeeTask)
  .task('invoiceMilestone', invoiceMilestoneTask)
  .task('invoiceRecurring', invoiceRecurringTask)
  .task('reviewDraft', reviewDraftTask.withJoinType('xor').withSplitType('xor'))
  .task('editDraft', editDraftTask)
  .task('finalizeInvoice', finalizeInvoiceTask)
  .connectCondition('start', (to) => to.task('selectInvoicingMethod'))
  .connectTask('selectInvoicingMethod', (to) =>
    to
      .task('invoiceTimeAndMaterials')
      .task('invoiceFixedFee')
      .task('invoiceMilestone')
      .task('invoiceRecurring')
      .route(async ({ route, mutationCtx }) => {
        // Query the most recent selectInvoicingMethod work item metadata
        // Use descending sort to get the most recent item (loop-safe pattern)
        const workItems = await mutationCtx.db
          .query('dealToDeliveryWorkItems')
          .filter((q) => q.eq(q.field('payload.type'), 'selectInvoicingMethod'))
          .collect()

        // Sort by creation time descending to get the most recent
        const sortedWorkItems = workItems.sort(
          (a, b) => b._creationTime - a._creationTime
        )
        const mostRecentMetadata = sortedWorkItems[0]

        // Get the selected method from the payload
        const payload = mostRecentMetadata?.payload as {
          type: 'selectInvoicingMethod'
          selectedMethod?: 'TimeAndMaterials' | 'FixedFee' | 'Milestone' | 'Recurring'
        } | undefined

        const method = payload?.selectedMethod || 'TimeAndMaterials'

        // Route based on the selected method
        switch (method) {
          case 'FixedFee':
            return route.toTask('invoiceFixedFee')
          case 'Milestone':
            return route.toTask('invoiceMilestone')
          case 'Recurring':
            return route.toTask('invoiceRecurring')
          case 'TimeAndMaterials':
          default:
            return route.toTask('invoiceTimeAndMaterials')
        }
      })
  )
  .connectTask('invoiceTimeAndMaterials', (to) => to.task('reviewDraft'))
  .connectTask('invoiceFixedFee', (to) => to.task('reviewDraft'))
  .connectTask('invoiceMilestone', (to) => to.task('reviewDraft'))
  .connectTask('invoiceRecurring', (to) => to.task('reviewDraft'))
  .connectTask('reviewDraft', (to) =>
    to
      .task('editDraft')
      .task('finalizeInvoice')
      .route(async ({ route, mutationCtx }) => {
        // Query the most recent reviewDraft work item metadata
        // Use descending sort to get the most recent item (loop-safe pattern)
        const workItems = await mutationCtx.db
          .query('dealToDeliveryWorkItems')
          .filter((q) => q.eq(q.field('payload.type'), 'reviewDraft'))
          .collect()

        // Sort by creation time descending to get the most recent
        const sortedWorkItems = workItems.sort(
          (a, b) => b._creationTime - a._creationTime
        )
        const mostRecentMetadata = sortedWorkItems[0]

        // Get the approval decision from the payload
        const payload = mostRecentMetadata?.payload as {
          type: 'reviewDraft'
          approved?: boolean
        } | undefined

        const approved = payload?.approved ?? false

        // Route based on the decision
        if (approved) {
          return route.toTask('finalizeInvoice')
        } else {
          return route.toTask('editDraft')
        }
      })
  )
  .connectTask('editDraft', (to) => to.task('reviewDraft'))
  .connectTask('finalizeInvoice', (to) => to.condition('end'))
