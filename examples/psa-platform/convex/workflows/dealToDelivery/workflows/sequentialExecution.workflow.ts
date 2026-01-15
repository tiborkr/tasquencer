import { Builder } from '../../../tasquencer'
import { getNextTaskTask } from '../workItems/getNextTask.workItem'
import { executeTaskTask } from '../workItems/executeTask.workItem'
import { completeTaskTask } from '../workItems/completeTask.workItem'
const finishSequenceTask = Builder.dummyTask()
export const sequentialExecutionWorkflow = Builder.workflow('sequentialExecution')
  .startCondition('start')
  .endCondition('end')
  .task('getNextTask', getNextTaskTask.withJoinType('xor'))
  .task('executeTask', executeTaskTask)
  .task('completeTask', completeTaskTask.withSplitType('xor'))
  .dummyTask('finishSequence', finishSequenceTask)
  .connectCondition('start', (to) => to.task('getNextTask'))
  .connectTask('getNextTask', (to) => to.task('executeTask'))
  .connectTask('executeTask', (to) => to.task('completeTask'))
  .connectTask('completeTask', (to) =>
    to
      .task('getNextTask')
      .task('finishSequence')
      .route(async ({ route }) => {
      const routes = [route.toTask('getNextTask'), route.toTask('finishSequence')]
      return routes[Math.floor(Math.random() * routes.length)]!
    })
  )
  .connectTask('finishSequence', (to) => to.condition('end'))