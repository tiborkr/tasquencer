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
      .route(async ({ route }) => {
      const routes = [route.toTask('invoiceTimeAndMaterials'), route.toTask('invoiceFixedFee'), route.toTask('invoiceMilestone'), route.toTask('invoiceRecurring')]
      return routes[Math.floor(Math.random() * routes.length)]!
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
      .route(async ({ route }) => {
      const routes = [route.toTask('editDraft'), route.toTask('finalizeInvoice')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('editDraft', (to) => to.task('reviewDraft'))
  .connectTask('finalizeInvoice', (to) => to.condition('end'))