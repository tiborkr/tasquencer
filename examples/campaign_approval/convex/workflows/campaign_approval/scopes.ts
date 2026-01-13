import { createScopeModule } from '@repo/tasquencer'

export const LUcampaignUapprovalScopeModule = createScopeModule('campaign_approval')
  .withScope('staff', {
    description: 'Base scope for UcampaignUapproval workflow staff members',
    tags: ['campaign_approval', 'staff'],
  })
  .withScope('write', {
    description: 'Permission to store LUcampaignUapproval messages',
    tags: ['campaign_approval', 'store', 'write'],
  })
