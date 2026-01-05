import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { defineWorkItemMetadataTable } from '@repo/tasquencer'

/**
 * Greetings - Aggregate root table linking workflow to domain data
 */
const greetings = defineTable({
  workflowId: v.id('tasquencerWorkflows'),
  message: v.string(),
  createdAt: v.number(),
}).index('by_workflow_id', ['workflowId'])

/**
 * Work item metadata table for greeting workflow
 * Uses auth scope-based authorization
 */
const greetingWorkItems = defineWorkItemMetadataTable('greetings').withPayload(
  v.object({
    type: v.literal('storeGreeting'),
    taskName: v.string(),
  }),
)

export default {
  greetings,
  greetingWorkItems,
}
