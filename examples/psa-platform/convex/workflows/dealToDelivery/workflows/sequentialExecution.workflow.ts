import { Builder } from '../../../tasquencer'
import { getNextTaskTask } from '../workItems/getNextTask.workItem'
import { executeTaskTask } from '../workItems/executeTask.workItem'
import { completeTaskTask } from '../workItems/completeTask.workItem'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

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
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the hasMoreTasks flag from the work item metadata
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1]
        if (!workItemId) {
          return route.toTask('finishSequence')
        }
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on whether there are more tasks to execute
        if (metadata?.payload.type === 'completeTask' && metadata.payload.hasMoreTasks === true) {
          return route.toTask('getNextTask')
        }

        return route.toTask('finishSequence')
      })
  )
  .connectTask('finishSequence', (to) => to.condition('end'))