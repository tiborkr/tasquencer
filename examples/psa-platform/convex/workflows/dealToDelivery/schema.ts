// Deal To Delivery Workflow Schema
// ================================
// This file defines the database tables for the Deal To Delivery workflow.
// Implement your domain tables and work item metadata table here.

// Example domain table:
// import { defineTable } from 'convex/server'
// import { v } from 'convex/values'
//
// const dealToDeliveryRecords = defineTable({
//   workflowId: v.id('tasquencerWorkflows'),
//   // Add your domain fields here
//   createdAt: v.number(),
// }).index('by_workflow_id', ['workflowId'])

// Example work item metadata table:
// import { defineWorkItemMetadataTable } from '../../tasquencer/workItemMetadata'
//
// const dealToDeliveryWorkItems = defineWorkItemMetadataTable('dealToDeliveryRecords')
//   .withPayload(
//     v.object({
//       type: v.union(v.literal('task1'), v.literal('task2')),
//       taskName: v.string(),
//     })
//   )

// Export tables as default for schema spread
export default {
  // dealToDeliveryRecords,
  // dealToDeliveryWorkItems,
}
