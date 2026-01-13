import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

/**
 * campaigns - Aggregate root table linking workflow to domain data
 */
const campaigns = defineTable({
  workflowId: v.id('tasquencerWorkflows'),
  message: v.string(),
  createdAt: v.number(),
}).index('by_workflow_id', ['workflowId'])

/**
 * Work item metadata table for campaign_approval workflow
 * Uses auth scope-based authorization
 */
const campaignWorkItems = defineWorkItemMetadataTable('campaigns').withPayload(
  v.object({
    type: v.literal('storeCampaign'),
    taskName: v.string(),
  }),
)

export default {
  campaigns,
  campaignWorkItems,
}
