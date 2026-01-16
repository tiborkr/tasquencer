import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { salesPhaseWorkflow } from './salesPhase.workflow'
import { planningPhaseWorkflow } from './planningPhase.workflow'
import { executionPhaseWorkflow } from './executionPhase.workflow'
import { billingPhaseWorkflow } from './billingPhase.workflow'
import { closePhaseWorkflow } from './closePhase.workflow'
import { getDealByWorkflowId, insertDeal } from '../db'
import { assertUserHasScope, assertUserInOrganization } from '../../../authorization'

const handleDealLostTask = Builder.dummyTask()

// Workflow actions to create the deal during workflow initialization
// This follows the workflow-first pattern from the ER example
const dealToDeliveryWorkflowActions = Builder.workflowActions().initialize(
  z.object({
    organizationId: z.string(), // Id<'organizations'>
    companyId: z.string(), // Id<'companies'>
    contactId: z.string(), // Id<'contacts'>
    name: z.string().min(1),
    value: z.number().int().min(0), // in cents
    ownerId: z.string(), // Id<'users'>
  }),
  async ({ mutationCtx, workflow }, payload) => {
    // Authorization checks
    await assertUserHasScope(mutationCtx, 'dealToDelivery:deals:create')
    await assertUserInOrganization(mutationCtx, payload.organizationId as any)

    // Initialize the workflow first to get the workflowId
    const workflowId = await workflow.initialize()

    // Create the deal with the workflowId - this links the deal to the workflow
    await insertDeal(mutationCtx.db, {
      organizationId: payload.organizationId as any,
      companyId: payload.companyId as any,
      contactId: payload.contactId as any,
      name: payload.name,
      value: payload.value,
      ownerId: payload.ownerId as any,
      stage: 'Lead',
      probability: 10,
      createdAt: Date.now(),
      workflowId, // Link deal to workflow for audit trails and downstream tasks
    })
  },
)

export const dealToDeliveryWorkflow = Builder.workflow('dealToDelivery')
  .withActions(dealToDeliveryWorkflowActions)
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