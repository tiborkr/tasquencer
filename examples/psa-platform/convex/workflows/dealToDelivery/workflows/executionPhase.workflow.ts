import { Builder } from '../../../tasquencer'
import { createAndAssignTasksTask } from '../workItems/createAndAssignTasks.workItem'
import { monitorBudgetBurnTask } from '../workItems/monitorBudgetBurn.workItem'
import { pauseWorkTask } from '../workItems/pauseWork.workItem'
import { requestChangeOrderTask } from '../workItems/requestChangeOrder.workItem'
import { getChangeOrderApprovalTask } from '../workItems/getChangeOrderApproval.workItem'
import { timeTrackingWorkflow } from './timeTracking.workflow'
import { expenseTrackingWorkflow } from './expenseTracking.workflow'
import { sequentialExecutionWorkflow } from './sequentialExecution.workflow'
import { parallelExecutionWorkflow } from './parallelExecution.workflow'
import { conditionalExecutionWorkflow } from './conditionalExecution.workflow'
import { getProjectByWorkflowId } from '../db/projects'
import { listChangeOrdersByProject } from '../db/changeOrders'
import { assertProjectExists } from '../exceptions'
import { DealToDeliveryWorkItemHelpers } from '../helpers'
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
  .dynamicCompositeTask('executeProjectWork', Builder.dynamicCompositeTask([sequentialExecutionWorkflow, parallelExecutionWorkflow, conditionalExecutionWorkflow]))
  .compositeTask('trackTime', Builder.compositeTask(timeTrackingWorkflow)
    .withJoinType('xor')
    .withSplitType('xor')
    .withActivities({
      onEnabled: async ({ workflow }) => {
        // Initialize the time tracking child workflow when this composite task is enabled
        await workflow.initialize()
      },
    })
  )
  .dummyTask('finalizeTimeTracking', finalizeTimeTrackingTask)
  .compositeTask('trackExpenses', Builder.compositeTask(expenseTrackingWorkflow)
    .withJoinType('xor')
    .withSplitType('xor')
    .withActivities({
      onEnabled: async ({ workflow }) => {
        // Initialize the expense tracking child workflow when this composite task is enabled
        await workflow.initialize()
      },
    })
  )
  .dummyTask('finalizeExpenseTracking', finalizeExpenseTrackingTask)
  .dummyTask('reviewExecution', reviewExecutionTask)
  .task('monitorBudgetBurn', monitorBudgetBurnTask.withJoinType('xor').withSplitType('xor'))
  .task('pauseWork', pauseWorkTask)
  .task('requestChangeOrder', requestChangeOrderTask)
  .task('getChangeOrderApproval', getChangeOrderApprovalTask.withSplitType('xor'))
  .dummyTask('completeExecution', completeExecutionTask)
  .connectCondition('start', (to) => to.task('createAndAssignTasks'))
  .connectTask('createAndAssignTasks', (to) => to.task('executeProjectWork').task('trackTime').task('trackExpenses'))
  // Note: Self-loops on composite tasks are not supported in workflow type system.
  // Time tracking completion now flows directly to finalize step.
  // TODO: If looping is needed, add an intermediate condition node. (deferred:execution-phase-loops)
  .connectTask('trackTime', (to) =>
    to.task('finalizeTimeTracking').route(async ({ route }) => route.toTask('finalizeTimeTracking'))
  )
  .connectTask('trackExpenses', (to) =>
    to.task('finalizeExpenseTracking').route(async ({ route }) => route.toTask('finalizeExpenseTracking'))
  )
  .connectTask('executeProjectWork', (to) => to.task('reviewExecution'))
  .connectTask('finalizeTimeTracking', (to) => to.task('reviewExecution'))
  .connectTask('finalizeExpenseTracking', (to) => to.task('reviewExecution'))
  .connectTask('reviewExecution', (to) => to.task('monitorBudgetBurn'))
  .connectTask('monitorBudgetBurn', (to) =>
    to
      .task('completeExecution')
      .task('pauseWork')
      .route(async ({ mutationCtx, route, workItem }) => {
      // Get the budget burn result from work item metadata
      // The monitorBudgetBurn work item calculates burn and stores budgetOk in metadata
      const workItemIds = await workItem.getAllWorkItemIds()

      for (const workItemId of workItemIds) {
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        if (metadata?.payload.type === 'monitorBudgetBurn' && metadata.payload.budgetOk !== undefined) {
          if (metadata.payload.budgetOk) {
            // Budget OK (burn <= 90%) - continue to completion
            return route.toTask('completeExecution')
          } else {
            // Budget overrun (burn > 90%) - pause work and request change order
            return route.toTask('pauseWork')
          }
        }
      }

      // Fallback: if no budget data found, default to completeExecution
      // This should not happen in normal operation
      return route.toTask('completeExecution')
    })
  )
  .connectTask('pauseWork', (to) => to.task('requestChangeOrder'))
  .connectTask('requestChangeOrder', (to) => to.task('getChangeOrderApproval'))
  .connectTask('getChangeOrderApproval', (to) =>
    to
      .task('monitorBudgetBurn')
      .task('completeExecution')
      .route(async ({ mutationCtx, route, parent }) => {
      // Check change order status
      const project = await getProjectByWorkflowId(mutationCtx.db, parent.workflow.id)
      assertProjectExists(project, { workflowId: parent.workflow.id })

      const changeOrders = await listChangeOrdersByProject(mutationCtx.db, project._id)
      const latestChangeOrder = changeOrders[0] // Most recent

      if (latestChangeOrder?.status === 'Approved') {
        return route.toTask('monitorBudgetBurn')
      }
      // Rejected or no change order - complete execution
      return route.toTask('completeExecution')
    })
  )
  .connectTask('completeExecution', (to) => to.condition('end'))