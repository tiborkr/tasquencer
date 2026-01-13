import { campaignApprovalWorkflow } from './workflows/campaign_approval.workflow'
import { versionManagerFor } from '../../tasquencer'

export const campaignApprovalVersionManager = versionManagerFor('campaign_approval')
  .registerVersion('v1', campaignApprovalWorkflow)
  .build()
