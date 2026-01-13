import { makeGetWorkflowStructureQuery } from '@repo/tasquencer'

import { campaignApprovalVersionManager } from './campaign_approval/definition'

export const { getWorkflowStructure, genericGetWorkflowStructure } =
  makeGetWorkflowStructureQuery([campaignApprovalVersionManager])
