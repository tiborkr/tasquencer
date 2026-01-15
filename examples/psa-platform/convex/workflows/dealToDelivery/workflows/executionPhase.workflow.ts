import { Builder } from '../../../tasquencer'
import { createAndAssignTasksTask } from '../workItems/createAndAssignTasks.workItem'
import { monitorBudgetBurnTask } from '../workItems/monitorBudgetBurn.workItem'
import { pauseWorkTask } from '../workItems/pauseWork.workItem'
import { requestChangeOrderTask } from '../workItems/requestChangeOrder.workItem'
import { getChangeOrderApprovalTask } from '../workItems/getChangeOrderApproval.workItem'
import { timeTrackingWorkflow } from './timeTracking.workflow'
import { expenseTrackingWorkflow } from './expenseTracking.workflow'
import { sequentialExecutionWorkflow } from './sequentialExecution.workflow'
import {
  getProjectByWorkflowId,
  calculateProjectBudgetBurn,
  listChangeOrdersByProject,
} from '../db'
// Note: parallelExecutionWorkflow and conditionalExecutionWorkflow exist but are not used
// They can be enabled with dynamicCompositeTask when proper version managers are set up
const finalizeTimeTrackingTask = Builder.dummyTask()

const finalizeExpenseTrackingTask = Builder.dummyTask()

const reviewExecutionTask = Builder.dummyTask()
  .withJoinType('or')

const completeExecutionTask = Builder.dummyTask()
  .withJoinType('xor')
export const executionPhaseWorkflow = Builder.workflow('executionPhase')
  .startCondition('start')
  .endCondition('end')
  .task('createAndAssignTasks', createAndAssignTasksTask)
  .compositeTask('executeProjectWork', Builder.compositeTask(sequentialExecutionWorkflow))
  .compositeTask('trackTime', Builder.compositeTask(timeTrackingWorkflow).withJoinType('xor'))
  .dummyTask('finalizeTimeTracking', finalizeTimeTrackingTask)
  .compositeTask('trackExpenses', Builder.compositeTask(expenseTrackingWorkflow).withJoinType('xor'))
  .dummyTask('finalizeExpenseTracking', finalizeExpenseTrackingTask)
  .dummyTask('reviewExecution', reviewExecutionTask)
  .task('monitorBudgetBurn', monitorBudgetBurnTask.withJoinType('xor').withSplitType('xor'))
  .task('pauseWork', pauseWorkTask)
  .task('requestChangeOrder', requestChangeOrderTask)
  .task('getChangeOrderApproval', getChangeOrderApprovalTask.withSplitType('xor'))
  .dummyTask('completeExecution', completeExecutionTask)
  .connectCondition('start', (to) => to.task('createAndAssignTasks'))
  .connectTask('createAndAssignTasks', (to) => to.task('executeProjectWork').task('trackTime').task('trackExpenses'))
  .connectTask('trackTime', (to) => to.task('finalizeTimeTracking'))
  .connectTask('trackExpenses', (to) => to.task('finalizeExpenseTracking'))
  .connectTask('executeProjectWork', (to) => to.task('reviewExecution'))
  .connectTask('finalizeTimeTracking', (to) => to.task('reviewExecution'))
  .connectTask('finalizeExpenseTracking', (to) => to.task('reviewExecution'))
  .connectTask('reviewExecution', (to) => to.task('monitorBudgetBurn'))
  .connectTask('monitorBudgetBurn', (to) =>
    to
      .task('completeExecution')
      .task('pauseWork')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get project and calculate budget burn
        const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!project) {
          throw new Error('Project not found for workflow')
        }

        const burnMetrics = await calculateProjectBudgetBurn(mutationCtx.db, project._id)

        // Route based on budget burn rate (90% threshold)
        // budgetOk (< 90%) → completeExecution
        // budgetOverrun (>= 90%) → pauseWork
        const budgetOk = burnMetrics.burnRate < 90
        return budgetOk
          ? route.toTask('completeExecution')
          : route.toTask('pauseWork')
      })
  )
  .connectTask('pauseWork', (to) => to.task('requestChangeOrder'))
  .connectTask('requestChangeOrder', (to) => to.task('getChangeOrderApproval'))
  .connectTask('getChangeOrderApproval', (to) =>
    to
      .task('monitorBudgetBurn')
      .task('completeExecution')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get project and find the most recent change order
        const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!project) {
          throw new Error('Project not found for workflow')
        }

        const changeOrders = await listChangeOrdersByProject(mutationCtx.db, project._id)
        // Get the most recently processed change order
        const latestChangeOrder = changeOrders
          .filter((co) => co.status !== 'Pending') // Exclude still-pending ones
          .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))[0]

        // Route based on change order approval status
        // Approved → resume work, go back to monitorBudgetBurn
        // Rejected → end workflow, go to completeExecution
        if (latestChangeOrder?.status === 'Approved') {
          return route.toTask('monitorBudgetBurn')
        }
        return route.toTask('completeExecution')
      })
  )
  .connectTask('completeExecution', (to) => to.condition('end'))