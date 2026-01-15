import { Builder } from '../../../tasquencer'
import { evaluateConditionTask } from '../workItems/evaluateCondition.workItem'
import { executePrimaryBranchTask } from '../workItems/executePrimaryBranch.workItem'
import { executeAlternateBranchTask } from '../workItems/executeAlternateBranch.workItem'
import { DealToDeliveryWorkItemHelpers } from '../helpers'

const mergeOutcomesTask = Builder.dummyTask()
  .withJoinType('xor')

export const conditionalExecutionWorkflow = Builder.workflow('conditionalExecution')
  .startCondition('start')
  .endCondition('end')
  .task('evaluateCondition', evaluateConditionTask.withSplitType('xor'))
  .task('executePrimaryBranch', executePrimaryBranchTask)
  .task('executeAlternateBranch', executeAlternateBranchTask)
  .dummyTask('mergeOutcomes', mergeOutcomesTask)
  .connectCondition('start', (to) => to.task('evaluateCondition'))
  .connectTask('evaluateCondition', (to) =>
    to
      .task('executePrimaryBranch')
      .task('executeAlternateBranch')
      .route(async ({ mutationCtx, workItem, route }) => {
        // Get the conditionMet flag from the work item metadata
        const workItemIds = await workItem.getAllWorkItemIds()
        const workItemId = workItemIds[workItemIds.length - 1]
        if (!workItemId) {
          return route.toTask('executeAlternateBranch')
        }
        const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
          mutationCtx.db,
          workItemId
        )

        // Route based on condition evaluation result
        // conditionMet = true → primary branch, false → alternate branch
        if (metadata?.payload.type === 'evaluateCondition' && metadata.payload.conditionMet === true) {
          return route.toTask('executePrimaryBranch')
        }

        return route.toTask('executeAlternateBranch')
      })
  )
  .connectTask('executePrimaryBranch', (to) => to.task('mergeOutcomes'))
  .connectTask('executeAlternateBranch', (to) => to.task('mergeOutcomes'))
  .connectTask('mergeOutcomes', (to) => to.condition('end'))