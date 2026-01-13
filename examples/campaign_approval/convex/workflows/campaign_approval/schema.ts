import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

/**
 * UcampaignUapprovals - Aggregate root table linking workflow to domain data
 */
const LUcampaignUapprovals = defineTable({
  workflowId: v.id('tasquencerWorkflows'),
  message: v.string(),
  createdAt: v.number(),
}).index('by_workflow_id', ['workflowId'])

/**
 * Work item metadata table for LUcampaignUapproval workflow
 * Uses auth scope-based authorization
 */
const LUcampaignUapprovalWorkItems = defineWorkItemMetadataTable('LUcampaignUapprovals').withPayload(
  v.object({
    type: v.literal('storeUcampaignUapproval'),
    taskName: v.string(),
  }),
)

export default {
  LUcampaignUapprovals,
  LUcampaignUapprovalWorkItems,
}
