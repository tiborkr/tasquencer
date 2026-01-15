import { Builder } from '../../../tasquencer'
import { sendInvoiceTask } from '../workItems/sendInvoice.workItem'
import { sendViaEmailTask } from '../workItems/sendViaEmail.workItem'
import { sendViaPdfTask } from '../workItems/sendViaPdf.workItem'
import { sendViaPortalTask } from '../workItems/sendViaPortal.workItem'
import { recordPaymentTask } from '../workItems/recordPayment.workItem'
import { checkMoreBillingTask } from '../workItems/checkMoreBilling.workItem'
import { timesheetApprovalWorkflow } from './timesheetApproval.workflow'
import { expenseApprovalWorkflow } from './expenseApproval.workflow'
import { invoiceGenerationWorkflow } from './invoiceGeneration.workflow'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
const startApprovalsTask = Builder.dummyTask()

const confirmDeliveryTask = Builder.dummyTask()
  .withJoinType('or')

const completeBillingTask = Builder.dummyTask()
export const billingPhaseWorkflow = Builder.workflow('billingPhase')
  .startCondition('start')
  .endCondition('end')
  .dummyTask('startApprovals', startApprovalsTask)
  .compositeTask('approveTimesheets', Builder.compositeTask(timesheetApprovalWorkflow))
  .compositeTask('approveExpenses', Builder.compositeTask(expenseApprovalWorkflow))
  .compositeTask('generateInvoice', Builder.compositeTask(invoiceGenerationWorkflow).withJoinType('xor'))
  .task('sendInvoice', sendInvoiceTask.withSplitType('or'))
  .task('sendViaEmail', sendViaEmailTask)
  .task('sendViaPdf', sendViaPdfTask)
  .task('sendViaPortal', sendViaPortalTask)
  .dummyTask('confirmDelivery', confirmDeliveryTask)
  .task('recordPayment', recordPaymentTask)
  .task('checkMoreBilling', checkMoreBillingTask.withSplitType('xor'))
  .dummyTask('completeBilling', completeBillingTask)
  .connectCondition('start', (to) => to.task('startApprovals'))
  .connectTask('startApprovals', (to) => to.task('approveTimesheets').task('approveExpenses'))
  .connectTask('approveTimesheets', (to) => to.task('generateInvoice'))
  .connectTask('approveExpenses', (to) => to.task('generateInvoice'))
  .connectTask('generateInvoice', (to) => to.task('sendInvoice'))
  .connectTask('sendInvoice', (to) =>
    to
      .task('sendViaEmail')
      .task('sendViaPdf')
      .task('sendViaPortal')
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the selected delivery method from the work item metadata
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1]
        if (!workItemId) {
          return [route.toTask('sendViaEmail')]
        }
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on the selected delivery method
        if (metadata?.payload.type === 'sendInvoice' && metadata.payload.selectedMethod) {
          switch (metadata.payload.selectedMethod) {
            case 'email':
              return [route.toTask('sendViaEmail')]
            case 'pdf':
              return [route.toTask('sendViaPdf')]
            case 'portal':
              return [route.toTask('sendViaPortal')]
          }
        }

        // Default to email delivery if no method selected
        return [route.toTask('sendViaEmail')]
      })
  )
  .connectTask('sendViaEmail', (to) => to.task('confirmDelivery'))
  .connectTask('sendViaPdf', (to) => to.task('confirmDelivery'))
  .connectTask('sendViaPortal', (to) => to.task('confirmDelivery'))
  .connectTask('confirmDelivery', (to) => to.task('recordPayment'))
  .connectTask('recordPayment', (to) => to.task('checkMoreBilling'))
  .connectTask('checkMoreBilling', (to) =>
    to
      .task('generateInvoice')
      .task('completeBilling')
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the billing check result from the work item metadata
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1]
        if (!workItemId) {
          return route.toTask('completeBilling')
        }
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on whether more billing cycles are needed
        if (metadata?.payload.type === 'checkMoreBilling' && metadata.payload.moreBillingCycles === true) {
          return route.toTask('generateInvoice')
        }

        return route.toTask('completeBilling')
      })
  )
  .connectTask('completeBilling', (to) => to.condition('end'))