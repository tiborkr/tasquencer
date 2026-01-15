import { Builder } from '../../../tasquencer'
import { createProjectTask } from '../workItems/createProject.workItem'
import { setBudgetTask } from '../workItems/setBudget.workItem'
import { resourcePlanningWorkflow } from './resourcePlanning.workflow'
export const planningPhaseWorkflow = Builder.workflow('planningPhase')
  .startCondition('start')
  .endCondition('end')
  .task('createProject', createProjectTask)
  .task('setBudget', setBudgetTask)
  .compositeTask('allocateResources', Builder.compositeTask(resourcePlanningWorkflow))
  .connectCondition('start', (to) => to.task('createProject'))
  .connectTask('createProject', (to) => to.task('setBudget'))
  .connectTask('setBudget', (to) => to.task('allocateResources'))
  .connectTask('allocateResources', (to) => to.condition('end'))