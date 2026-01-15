import { Builder } from '../../../tasquencer'
import { salesPhaseWorkflow } from './salesPhase.workflow'
import { planningPhaseWorkflow } from './planningPhase.workflow'
import { executionPhaseWorkflow } from './executionPhase.workflow'
import { billingPhaseWorkflow } from './billingPhase.workflow'
import { closePhaseWorkflow } from './closePhase.workflow'
import { getDealByWorkflowId } from '../db'
const handleDealLostTask = Builder.dummyTask()
export const dealToDeliveryWorkflow = Builder.workflow('dealToDelivery')
  .startCondition('start')
  .endCondition('end')
  .compositeTask('sales', Builder.compositeTask(salesPhaseWorkflow).withSplitType('xor'))
  .compositeTask('planning', Builder.compositeTask(planningPhaseWorkflow))
  .compositeTask('execution', Builder.compositeTask(executionPhaseWorkflow))
  .compositeTask('billing', Builder.compositeTask(billingPhaseWorkflow))
  .compositeTask('close', Builder.compositeTask(closePhaseWorkflow))
  .dummyTask('handleDealLost', handleDealLostTask)
  .connectCondition('start', (to) => to.task('sales'))
  .connectTask('sales', (to) =>
    to
      .task('planning')
      .task('handleDealLost')
      .route(async ({ mutationCtx, parent, route }) => {
        // Get deal state to determine routing based on sales phase outcome
        const deal = await getDealByWorkflowId(mutationCtx.db, parent.workflow.id)
        if (!deal) {
          throw new Error('Deal not found for workflow')
        }

        // Route based on deal stage after sales phase completes
        // Won → planning (continue to project), Lost/Disqualified → handleDealLost
        return deal.stage === 'Won'
          ? route.toTask('planning')
          : route.toTask('handleDealLost')
      })
  )
  .connectTask('planning', (to) => to.task('execution'))
  .connectTask('execution', (to) => to.task('billing'))
  .connectTask('billing', (to) => to.task('close'))
  .connectTask('close', (to) => to.condition('end'))
  .connectTask('handleDealLost', (to) => to.condition('end'))