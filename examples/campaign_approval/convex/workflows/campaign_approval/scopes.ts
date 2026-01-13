import { createScopeModule } from '@repo/tasquencer'

export const campaignApprovalScopeModule = createScopeModule('campaign_approval')
  .withScope('staff', {
    description: 'Base scope for campaign_approval workflow staff members',
    tags: ['campaign_approval', 'staff'],
  })
  .withScope('write', {
    description: 'Permission to store campaign messages',
    tags: ['campaign_approval', 'store', 'write'],
  })
