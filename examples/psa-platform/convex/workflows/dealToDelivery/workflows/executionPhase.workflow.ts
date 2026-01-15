import { Builder } from '../../../tasquencer'
import { createAndAssignTasksTask } from '../workItems/createAndAssignTasks.workItem'
import { monitorBudgetBurnTask } from '../workItems/monitorBudgetBurn.workItem'
import { pauseWorkTask } from '../workItems/pauseWork.workItem'
import { requestChangeOrderTask } from '../workItems/requestChangeOrder.workItem'
import { getChangeOrderApprovalTask } from '../workItems/getChangeOrderApproval.workItem'
import { timeTrackingWorkflow } from './timeTracking.workflow'
import { expenseTrackingWorkflow } from './expenseTracking.workflow'
import { sequentialExecutionWorkflow } from './sequentialExecution.workflow'
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
      .route(async ({ route }) => {
      const routes = [route.toTask('completeExecution'), route.toTask('pauseWork')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('pauseWork', (to) => to.task('requestChangeOrder'))
  .connectTask('requestChangeOrder', (to) => to.task('getChangeOrderApproval'))
  .connectTask('getChangeOrderApproval', (to) =>
    to
      .task('monitorBudgetBurn')
      .task('completeExecution')
      .route(async ({ route }) => {
      const routes = [route.toTask('monitorBudgetBurn'), route.toTask('completeExecution')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('completeExecution', (to) => to.condition('end'))