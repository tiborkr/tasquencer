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
  .compositeTask('trackTime', Builder.compositeTask(timeTrackingWorkflow).withJoinType('xor').withSplitType('xor'))
  .dummyTask('finalizeTimeTracking', finalizeTimeTrackingTask)
  .compositeTask('trackExpenses', Builder.compositeTask(expenseTrackingWorkflow).withJoinType('xor').withSplitType('xor'))
  .dummyTask('finalizeExpenseTracking', finalizeExpenseTrackingTask)
  .dummyTask('reviewExecution', reviewExecutionTask)
  .task('monitorBudgetBurn', monitorBudgetBurnTask.withJoinType('xor').withSplitType('xor'))
  .task('pauseWork', pauseWorkTask)
  .task('requestChangeOrder', requestChangeOrderTask)
  .task('getChangeOrderApproval', getChangeOrderApprovalTask.withSplitType('xor'))
  .dummyTask('completeExecution', completeExecutionTask)
  .connectCondition('start', (to) => to.task('createAndAssignTasks'))
  .connectTask('createAndAssignTasks', (to) => to.task('executeProjectWork').task('trackTime').task('trackExpenses'))
  .connectTask('trackTime', (to) =>
    to
      .task('trackTime')
      .task('finalizeTimeTracking')
      .route(async ({ route }) => {
      const routes = [route.toTask('trackTime'), route.toTask('finalizeTimeTracking')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('trackExpenses', (to) =>
    to
      .task('trackExpenses')
      .task('finalizeExpenseTracking')
      .route(async ({ route }) => {
      const routes = [route.toTask('trackExpenses'), route.toTask('finalizeExpenseTracking')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
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