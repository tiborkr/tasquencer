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
      .route(async ({ route }) => {
      return [route.toTask('sendViaEmail'), route.toTask('sendViaPdf'), route.toTask('sendViaPortal')]
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
      .route(async ({ route }) => {
      const routes = [route.toTask('generateInvoice'), route.toTask('completeBilling')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('completeBilling', (to) => to.condition('end'))