import { Builder } from '../../../tasquencer'
import { evaluateConditionTask } from '../workItems/evaluateCondition.workItem'
import { executePrimaryBranchTask } from '../workItems/executePrimaryBranch.workItem'
import { executeAlternateBranchTask } from '../workItems/executeAlternateBranch.workItem'

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
      .route(async ({ route }) => {
        // TODO: Track condition evaluation result in work item metadata
        // For now, default to primary branch (happy path).
        // The evaluateCondition work item should store its result for proper routing.
        // Reference: Internal scaffolder pattern - conditional execution
        return route.toTask('executePrimaryBranch')
      })
  )
  .connectTask('executePrimaryBranch', (to) => to.task('mergeOutcomes'))
  .connectTask('executeAlternateBranch', (to) => to.task('mergeOutcomes'))
  .connectTask('mergeOutcomes', (to) => to.condition('end'))