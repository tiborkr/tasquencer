import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";
import * as impl from "./apiImpl";
import { api, internal } from "./_generated/api";
import { auditContextValidator } from "../shared/context";

const auditTracesDoc = schema.tables.auditTraces.validator.extend({
  _id: v.id("auditTraces"),
  _creationTime: v.number(),
});

const auditSpansDoc = schema.tables.auditSpans.validator.extend({
  _id: v.id("auditSpans"),
  _creationTime: v.number(),
});

const auditContextDoc = schema.tables.auditContexts.validator.extend({
  _id: v.id("auditContexts"),
  _creationTime: v.number(),
});

const auditWorkflowSnapshotDoc =
  schema.tables.auditWorkflowSnapshots.validator.extend({
    _id: v.id("auditWorkflowSnapshots"),
    _creationTime: v.number(),
  });

/**
 * Flush trace from payload (for non-mutation contexts)
 */
export const flushTracePayload = mutation({
  args: {
    trace: v.optional(v.any()),
    spans: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await impl.flushTracePayload(ctx.db, args.trace, args.spans);

    return null;
  },
});

/**
 * Get trace by ID
 */
export const getTrace = query({
  args: {
    traceId: v.string(),
  },
  returns: v.nullable(auditTracesDoc),
  handler: async (ctx, args) => {
    return await impl.getTrace(ctx.db, args.traceId);
  },
});

/**
 * Get all spans for a trace
 */
export const getTraceSpans = query({
  args: {
    traceId: v.string(),
  },
  returns: v.array(auditSpansDoc),
  handler: async (ctx, args) => {
    return await impl.getTraceSpans(ctx.db, args.traceId);
  },
});

/**
 * Get root-level spans (depth 0) for a trace
 */
export const getRootSpans = query({
  args: {
    traceId: v.string(),
  },
  returns: v.array(auditSpansDoc),
  handler: async (ctx, args) => {
    return await impl.getRootSpans(ctx.db, args.traceId);
  },
});

/**
 * Get immediate children of a span
 */
export const getChildSpans = query({
  args: {
    traceId: v.string(),
    parentSpanId: v.string(),
  },
  returns: v.array(auditSpansDoc),
  handler: async (ctx, args) => {
    return await impl.getChildSpans(ctx.db, args.traceId, args.parentSpanId);
  },
});

/**
 * Get spans by resource
 */
export const getSpansByResource = query({
  args: {
    resourceType: v.string(),
    resourceId: v.string(),
  },
  returns: v.array(auditSpansDoc),
  handler: async (ctx, args) => {
    return await impl.getSpansByResource(
      ctx.db,
      args.resourceType,
      args.resourceId
    );
  },
});

/**
 * List recent traces
 */
export const listRecentTraces = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(auditTracesDoc),
  handler: async (ctx, args) => {
    return await impl.listRecentTraces(ctx.db, args.limit);
  },
});

export const getSpansByTimeRange = query({
  args: {
    traceId: v.string(),
    startTime: v.number(),
    endTime: v.number(),
  },
  returns: v.array(auditSpansDoc),
  handler: async (ctx, args) => {
    return await impl.getSpansByTimeRange(
      ctx.db,
      args.traceId,
      args.startTime,
      args.endTime
    );
  },
});

export const getKeyEvents = query({
  args: {
    traceId: v.string(),
  },
  returns: v.array(
    v.object({
      type: v.string(),
      category: v.union(
        v.literal("workflow"),
        v.literal("task"),
        v.literal("condition"),
        v.literal("workItem"),
        v.literal("error")
      ),
      description: v.string(),
      spanId: v.string(),
      depth: v.number(),
      timestamp: v.number(),
      workflowName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    return await impl.getKeyEvents(ctx.db, args.traceId);
  },
});

/**
 * Get child workflow instances for a composite task at a specific timestamp/generation
 */
export const getChildWorkflowInstances = query({
  args: {
    traceId: v.string(),
    taskName: v.string(),
    workflowName: v.optional(v.string()),
    timestamp: v.number(),
  },
  returns: v.array(
    v.object({
      workflowId: v.string(),
      workflowName: v.string(),
      generation: v.number(),
      state: v.string(),
      startedAt: v.number(),
      endedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    return await impl.getChildWorkflowInstances(ctx.db, args);
  },
});

export const getWorkflowStateAtTime = query({
  args: {
    traceId: v.string(),
    timestamp: v.number(),
    workflowId: v.optional(v.string()), // Optional: specify which workflow in the trace to reconstruct
  },
  returns: v.nullable(
    v.object({
      timestamp: v.number(),
      sequenceNumber: v.number(),
      workflow: v.object({
        name: v.string(),
        state: v.union(
          v.literal("initialized"),
          v.literal("started"),
          v.literal("completed"),
          v.literal("failed"),
          v.literal("canceled")
        ),
      }),
      conditions: v.record(
        v.string(),
        v.object({
          name: v.string(),
          marking: v.number(),
          lastChangedAt: v.number(),
        })
      ),
      tasks: v.record(
        v.string(),
        v.object({
          name: v.string(),
          state: v.union(
            v.literal("disabled"),
            v.literal("enabled"),
            v.literal("started"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("canceled")
          ),
          generation: v.number(),
          lastChangedAt: v.number(),
        })
      ),
      workItems: v.record(
        v.string(),
        v.object({
          id: v.string(),
          name: v.string(),
          state: v.union(
            v.literal("initialized"),
            v.literal("started"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("canceled")
          ),
          taskName: v.string(),
          lastChangedAt: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    return await impl.getWorkflowStateAtTime(ctx.db, args);
  },
});

/**
 * Compute and store a snapshot of workflow state at a given timestamp
 * Called by scheduler after workflow completes or at major milestones
 */
export const computeWorkflowSnapshot = mutation({
  args: {
    traceId: v.string(),
    timestamp: v.number(),
    retryCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const retryCount = args.retryCount ?? 0;
    const result = await impl.computeWorkflowSnapshot(ctx.db, args);
    if (!result && retryCount < 3) {
      await ctx.scheduler.runAfter(1, api.api.computeWorkflowSnapshot, {
        traceId: args.traceId,
        timestamp: args.timestamp,
        retryCount: retryCount + 1,
      });
    }
  },
});

export const saveAuditContext = mutation({
  args: {
    workflowId: v.string(),
    data: v.object({
      traceId: v.string(),
      context: auditContextValidator,
      traceMetadata: v.optional(v.any()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.saveAuditContext(ctx.db, args.workflowId, args.data);
  },
});

export const getAuditContext = query({
  args: {
    workflowId: v.string(),
  },
  returns: v.nullable(auditContextDoc),
  handler: async (ctx, args) => {
    return await impl.getAuditContext(ctx.db, args.workflowId);
  },
});

export const removeAuditContext = mutation({
  args: {
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await impl.removeAuditContext(ctx.db, args.workflowId);
  },
});

export const getWorkflowSnapshots = query({
  args: {
    traceId: v.string(),
  },
  returns: v.array(auditWorkflowSnapshotDoc),
  handler: async (ctx, args) => {
    return await impl.getWorkflowSnapshots(ctx.db, args.traceId);
  },
});
