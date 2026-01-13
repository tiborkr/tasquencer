import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { insertUcampaignUapproval } from '../db'
import { storeUcampaignUapprovalTask } from '../workItems/storeUcampaignUapproval.workItem'

const LUcampaignUapprovalWorkflowActions = Builder.workflowActions().initialize(
  z.any(),
  async ({ mutationCtx, workflow }) => {
    const workflowId = await workflow.initialize()

    // Create the LUcampaignUapproval aggregate root with empty message
    // The message will be filled in by the storeUcampaignUapproval work item
    await insertUcampaignUapproval(mutationCtx.db, {
      workflowId,
      message: '',
      createdAt: Date.now(),
    })
  },
)

export const LUcampaignUapprovalWorkflow = Builder.workflow('campaign_approval')
  .withActions(LUcampaignUapprovalWorkflowActions)
  .startCondition('start')
  .task('storeUcampaignUapproval', storeUcampaignUapprovalTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('storeUcampaignUapproval'))
  .connectTask('storeUcampaignUapproval', (to) => to.condition('end'))
