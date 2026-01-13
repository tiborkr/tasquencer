import { makeGetWorkflowStructureQuery } from '@repo/tasquencer'

import { LUcampaignUapprovalVersionManager } from './campaign_approval/definition'

export const { getWorkflowStructure, genericGetWorkflowStructure } =
  makeGetWorkflowStructureQuery([LUcampaignUapprovalVersionManager])
