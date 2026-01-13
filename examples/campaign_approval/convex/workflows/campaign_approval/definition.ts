import { LUcampaignUapprovalWorkflow } from './workflows/LUcampaignUapproval.workflow'
import { versionManagerFor } from '../../tasquencer'

export const LUcampaignUapprovalVersionManager = versionManagerFor('campaign_approval')
  .registerVersion('v1', LUcampaignUapprovalWorkflow)
  .build()
