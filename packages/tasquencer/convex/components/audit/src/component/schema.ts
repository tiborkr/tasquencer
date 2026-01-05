import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { spanAttributes, traceAttributes } from "../shared/attributeSchemas";

export const spanStateValidator = v.union(
  v.literal("started"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled")
);

export const traceStateValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled")
);

export const initiatorTypeValidator = v.union(
  v.literal("user"),
  v.literal("system"),
  v.literal("scheduled")
);

export const spanLinkTypeValidator = v.union(
  v.literal("follows"),
  v.literal("triggers"),
  v.literal("related")
);

export const auditTraces = defineTable({
  // Identity
  traceId: v.string(),
  name: v.string(),

  // Timing
  startedAt: v.number(),
  endedAt: v.optional(v.number()),

  // State
  state: traceStateValidator,

  // Context
  correlationId: v.optional(v.string()),
  initiatorType: v.optional(initiatorTypeValidator),
  initiatorUserId: v.optional(v.string()),

  // Attributes (strongly typed, discriminated union)
  attributes: v.optional(traceAttributes),

  // Metadata (deprecated - use attributes instead for new code)
  metadata: v.optional(v.any()),
})
  .index("by_trace_id", ["traceId"])
  .index("by_state", ["state"])
  .index("by_started_at", ["startedAt"])
  .index("by_correlation_id", ["correlationId"]);

export const auditSpans = defineTable({
  // Identity
  spanId: v.string(),
  traceId: v.string(),
  parentSpanId: v.optional(v.string()),

  // Hierarchy
  depth: v.number(),
  path: v.array(v.string()),

  // Operation
  operation: v.string(),
  operationType: v.string(),

  // Timing
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  duration: v.optional(v.number()),

  // Sequence
  sequenceNumber: v.optional(v.number()),

  // State
  state: spanStateValidator,

  // Error handling
  error: v.optional(v.any()),

  // Causation
  causationId: v.optional(v.string()),

  // Resource tracking
  resourceType: v.optional(v.string()),
  resourceId: v.optional(v.string()),
  resourceName: v.optional(v.string()),

  // Metadata
  attributes: v.optional(spanAttributes),
  events: v.optional(v.any()),
})
  .index("by_trace_id_and_started_at", ["traceId", "startedAt"])
  .index("by_trace_id_parent_span_id_and_depth", [
    "traceId",
    "parentSpanId",
    "depth",
  ])
  .index("by_span_id", ["spanId"])
  .index("by_resource_type_and_id", ["resourceType", "resourceId"])
  .index("by_operation_type", ["operationType"])
  .index("by_state", ["state"]);

export const auditSpanLinks = defineTable({
  fromSpanId: v.string(),
  toSpanId: v.string(),
  linkType: spanLinkTypeValidator,
  metadata: v.optional(v.any()),
})
  .index("by_from_span_id", ["fromSpanId"])
  .index("by_to_span_id", ["toSpanId"]);

export const auditContexts = defineTable({
  workflowId: v.string(),
  traceId: v.string(),
  context: v.any(),
  traceMetadata: v.optional(v.any()),
  createdAt: v.number(),
})
  .index("by_workflow_id", ["workflowId"])
  .index("by_trace_id", ["traceId"]);

export const auditWorkflowSnapshots = defineTable({
  traceId: v.string(),
  workflowId: v.string(),
  timestamp: v.number(),
  sequenceNumber: v.number(),
  state: v.any(),
})
  .index("by_trace_id_and_timestamp", ["traceId", "timestamp"])
  .index("by_workflow_id_and_timestamp", ["workflowId", "timestamp"]);

// Generic domain event logging (reusable across workflows)
const auditDomainEvents = defineTable({
  aggregateType: v.string(), // e.g. 'rfp', 'translation'
  aggregateId: v.string(), // string form of the aggregate id
  eventType: v.string(), // e.g. 'rfp.intake', 'rfp.approval'
  occurredAt: v.number(), // epoch millis
  correlationId: v.optional(v.string()),
  causationId: v.optional(v.string()),
  payload: v.optional(v.any()),
})
  .index("by_aggregate_type_and_id", ["aggregateType", "aggregateId"])
  .index("by_event_type", ["eventType"])
  .index("by_occurred_at", ["occurredAt"]);

// Generic audit log projection from domain events
const auditLogs = defineTable({
  aggregateType: v.string(),
  aggregateId: v.string(),
  actorType: v.optional(
    v.union(v.literal("user"), v.literal("system"), v.literal("ai"))
  ),
  actorUserId: v.optional(v.string()),
  action: v.string(), // 'created', 'edited', 'approved', etc.
  category: v.string(), // 'rfp', 'section', 'approval', etc.
  description: v.string(),
  metadata: v.optional(v.any()),
  occurredAt: v.number(),
  correlationId: v.optional(v.string()),
  eventType: v.string(),
  eventId: v.optional(v.string()),
})
  .index("by_aggregate_type_and_id", ["aggregateType", "aggregateId"])
  .index("by_occurred_at", ["occurredAt"])
  .index("by_actor_user_id", ["actorUserId"])
  .index("by_category", ["category"]);

export default defineSchema({
  auditTraces,
  auditSpans,
  auditSpanLinks,
  auditContexts,
  auditWorkflowSnapshots,
  auditDomainEvents,
  auditLogs,
});
