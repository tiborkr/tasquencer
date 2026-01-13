import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { insertCampaign } from '../db'
import { storeCampaignTask } from '../workItems/storeCampaign.workItem'

const campaignApprovalWorkflowActions = Builder.workflowActions().initialize(
  z.any(),
  async ({ mutationCtx, workflow }) => {
    const workflowId = await workflow.initialize()

    // Create the campaign aggregate root with empty message
    // The message will be filled in by the storeCampaign work item
    await insertCampaign(mutationCtx.db, {
      workflowId,
      message: '',
      createdAt: Date.now(),
    })
  },
)

export const campaignApprovalWorkflow = Builder.workflow('campaign_approval')
  .withActions(campaignApprovalWorkflowActions)
  .startCondition('start')
  .task('storeCampaign', storeCampaignTask)
  .endCondition('end')
  .connectCondition('start', (to) => to.task('storeCampaign'))
  .connectTask('storeCampaign', (to) => to.condition('end'))
