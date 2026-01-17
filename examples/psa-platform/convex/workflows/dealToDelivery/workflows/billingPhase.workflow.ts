import { Builder } from '../../../tasquencer'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
import { sendInvoiceTask } from '../workItems/sendInvoice.workItem'
import { sendViaEmailTask } from '../workItems/sendViaEmail.workItem'
import { sendViaPdfTask } from '../workItems/sendViaPdf.workItem'
import { sendViaPortalTask } from '../workItems/sendViaPortal.workItem'
import { recordPaymentTask } from '../workItems/recordPayment.workItem'
import { checkMoreBillingTask } from '../workItems/checkMoreBilling.workItem'
import { timesheetApprovalWorkflow } from './timesheetApproval.workflow'
import { expenseApprovalWorkflow } from './expenseApproval.workflow'
import { invoiceGenerationWorkflow } from './invoiceGeneration.workflow'
import { getProjectByWorkflowId } from '../db/projects'
import { listBillableUninvoicedTimeEntries } from '../db/timeEntries'
import { listBillableUninvoicedExpenses } from '../db/expenses'
import { assertProjectExists } from '../exceptions'
const startApprovalsTask = Builder.dummyTask()

const confirmDeliveryTask = Builder.dummyTask()
  .withJoinType('xor')

const completeBillingTask = Builder.dummyTask()
export const billingPhaseWorkflow = Builder.workflow('billingPhase')
  .startCondition('start')
  .endCondition('end')
  .dummyTask('startApprovals', startApprovalsTask)
  .compositeTask('approveTimesheets', Builder.compositeTask(timesheetApprovalWorkflow))
  .compositeTask('approveExpenses', Builder.compositeTask(expenseApprovalWorkflow))
  .compositeTask('generateInvoice', Builder.compositeTask(invoiceGenerationWorkflow).withJoinType('xor'))
  .task('sendInvoice', sendInvoiceTask.withSplitType('xor'))
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
      .route(async ({ mutationCtx, route, workItem }) => {
        // Get the selected delivery method from work item metadata
        // The sendInvoice work item stores the user's method choice on completion
        const workItemIds = await workItem.getAllWorkItemIds()

        for (const workItemId of workItemIds) {
          const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
            mutationCtx.db,
            workItemId
          )

          if (metadata?.payload.type === 'sendInvoice' && metadata.payload.method) {
            switch (metadata.payload.method) {
              case 'email':
                return route.toTask('sendViaEmail')
              case 'pdf':
                return route.toTask('sendViaPdf')
              case 'portal':
                return route.toTask('sendViaPortal')
            }
          }
        }

        // Fallback: if no method found, default to email
        // This should not happen in normal operation
        return route.toTask('sendViaEmail')
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
      .route(async ({ mutationCtx, route, parent }) => {
      // Check for uninvoiced billable items
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      assertProjectExists(project, { workflowId: parent.workflow.id })

      const uninvoicedTime = await listBillableUninvoicedTimeEntries(mutationCtx.db, project._id)
      const uninvoicedExpenses = await listBillableUninvoicedExpenses(mutationCtx.db, project._id)

      if (uninvoicedTime.length > 0 || uninvoicedExpenses.length > 0) {
        return route.toTask('generateInvoice')
      }
      return route.toTask('completeBilling')
    })
  )
  .connectTask('completeBilling', (to) => to.condition('end'))