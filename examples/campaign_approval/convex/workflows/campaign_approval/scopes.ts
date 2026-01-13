import { createScopeModule } from '@repo/tasquencer'

/**
 * Campaign Approval Workflow Scopes
 *
 * Defines all authorization scopes for the campaign approval workflow.
 * These scopes are assigned to roles, which are then assigned to groups.
 *
 * Note: Scope names must be flat (no colons) due to TypeScript type chain limits.
 * Full scope format: campaign:<scopename>
 */
export const campaignApprovalScopeModule = createScopeModule('campaign')
  // Base access scopes
  .withScope('read', {
    description: 'View campaigns and their details',
    tags: ['campaign', 'read', 'base'],
  })
  .withScope('request', {
    description: 'Submit new campaign requests',
    tags: ['campaign', 'request', 'initiation'],
  })
  .withScope('intake', {
    description: 'Review and approve/reject intake requests',
    tags: ['campaign', 'intake', 'review'],
  })
  .withScope('manage', {
    description: 'Full management of assigned campaigns (assign owner, update details)',
    tags: ['campaign', 'manage', 'full'],
  })
  // Creative scopes (flattened)
  .withScope('creative_write', {
    description: 'Create and edit creative assets',
    tags: ['campaign', 'creative', 'write'],
  })
  .withScope('creative_review', {
    description: 'Review and approve/reject creative concepts',
    tags: ['campaign', 'creative', 'review'],
  })
  // Legal scope (flattened)
  .withScope('legal_review', {
    description: 'Legal compliance review and approval',
    tags: ['campaign', 'legal', 'review', 'compliance'],
  })
  // Budget approval scopes (flattened)
  .withScope('budget_approve_low', {
    description: 'Approve budgets under $50,000 threshold',
    tags: ['campaign', 'budget', 'approve', 'low'],
  })
  .withScope('budget_approve_high', {
    description: 'Approve any budget amount (includes low threshold)',
    tags: ['campaign', 'budget', 'approve', 'high', 'executive'],
  })
  // Launch approval scope (flattened)
  .withScope('launch_approve', {
    description: 'Approve campaign launch',
    tags: ['campaign', 'launch', 'approve'],
  })
  // Operations and media scopes
  .withScope('ops', {
    description: 'Technical setup and operations tasks',
    tags: ['campaign', 'ops', 'technical'],
  })
  .withScope('media', {
    description: 'Manage paid media campaigns',
    tags: ['campaign', 'media', 'paid'],
  })
