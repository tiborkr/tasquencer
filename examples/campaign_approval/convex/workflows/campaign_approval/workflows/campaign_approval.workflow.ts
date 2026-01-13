import { Builder } from '../../../tasquencer'
import { z } from 'zod'
import { insertCampaign } from '../db'
import { storeCampaignTask } from '../workItems/storeCampaign.workItem'

/**
 * Campaign request payload schema for workflow initialization
 */
const campaignRequestSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  targetAudience: z.string().min(1),
  keyMessages: z.array(z.string()),
  channels: z.array(
    z.enum(['email', 'paid_ads', 'social', 'events', 'content']),
  ),
  proposedStartDate: z.number(),
  proposedEndDate: z.number(),
  estimatedBudget: z.number().min(0),
  requesterId: z.string(), // Will be validated as Id<'users'>
})

const campaignApprovalWorkflowActions = Builder.workflowActions().initialize(
  campaignRequestSchema,
  async ({ mutationCtx, workflow }, payload) => {
    const workflowId = await workflow.initialize()

    const now = Date.now()

    // Create the campaign aggregate root with full request data
    await insertCampaign(mutationCtx.db, {
      workflowId,
      name: payload.name,
      objective: payload.objective,
      targetAudience: payload.targetAudience,
      keyMessages: payload.keyMessages,
      channels: payload.channels,
      proposedStartDate: payload.proposedStartDate,
      proposedEndDate: payload.proposedEndDate,
      estimatedBudget: payload.estimatedBudget,
      requesterId: payload.requesterId as any, // Cast to Id<'users'>
      ownerId: undefined,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
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
