import { Builder } from '../../../tasquencer'
import { initParallelTasksTask } from '../workItems/initParallelTasks.workItem'
import { executeParallelTaskTask } from '../workItems/executeParallelTask.workItem'
import { syncParallelTasksTask } from '../workItems/syncParallelTasks.workItem'
export const parallelExecutionWorkflow = Builder.workflow('parallelExecution')
  .startCondition('start')
  .endCondition('end')
  .task('initParallelTasks', initParallelTasksTask)
  .task('executeParallelTask', executeParallelTaskTask)
  .task('syncParallelTasks', syncParallelTasksTask)
  .connectCondition('start', (to) => to.task('initParallelTasks'))
  .connectTask('initParallelTasks', (to) => to.task('executeParallelTask'))
  .connectTask('executeParallelTask', (to) => to.task('syncParallelTasks'))
  .connectTask('syncParallelTasks', (to) => to.condition('end'))