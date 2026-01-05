import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { TraceData, SpanData, AuditContext } from "../shared/context";
import {
  reconstructStateFromSpans,
  applySpansToState,
  type WorkflowState,
} from "./stateReconstruction";

/**
 * Common logic to apply flush data to database
 */
async function applyFlush(
  db: DatabaseWriter,
  trace: TraceData | undefined,
  spans: SpanData[]
) {
  if (!trace) {
    if (spans.length === 0) {
      return;
    }
    throw new Error("Trace metadata missing for flush");
  }

  // Check if trace already exists
  const existingTrace = await db
    .query("auditTraces")
    .withIndex("by_trace_id", (q) => q.eq("traceId", trace.traceId))
    .unique();

  if (existingTrace) {
    // Update existing trace
    await db.patch(existingTrace._id, {
      state: trace.state,
      endedAt: trace.endedAt,
      attributes: trace.attributes,
      metadata: trace.metadata,
    });
  } else {
    // Insert new trace
    await db.insert("auditTraces", {
      traceId: trace.traceId,
      name: trace.name,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      state: trace.state,
      correlationId: trace.correlationId,
      initiatorType: trace.initiatorType,
      initiatorUserId: trace.initiatorUserId
        ? trace.initiatorUserId
        : undefined,
      attributes: trace.attributes,
      metadata: trace.metadata,
    });
  }

  // Insert or update spans
  for (const span of spans) {
    const existingSpan = await db
      .query("auditSpans")
      .withIndex("by_span_id", (q) => q.eq("spanId", span.spanId))
      .unique();

    // Data for patch (excludes immutable identifiers)
    const spanPatchData = {
      parentSpanId: span.parentSpanId,
      depth: span.depth,
      path: span.path,
      operation: span.operation,
      operationType: span.operationType,
      startedAt: span.startedAt,
      endedAt: span.endedAt,
      duration: span.duration,
      state: span.state,
      error: span.error,
      causationId: span.causationId,
      resourceType: span.resourceType,
      resourceId: span.resourceId,
      resourceName: span.resourceName,
      attributes: span.attributes,
      events: span.events,
      sequenceNumber: span.sequenceNumber,
    };

    if (existingSpan) {
      await db.patch(existingSpan._id, spanPatchData);
    } else {
      await db.insert("auditSpans", {
        ...spanPatchData,
        spanId: span.spanId,
        traceId: trace.traceId,
      });
    }
  }
}

export async function flushTracePayload(
  db: DatabaseWriter,
  trace: TraceData | undefined,
  spans: SpanData[]
) {
  await applyFlush(db, trace, spans);

  return null;
}

export async function getTrace(db: DatabaseReader, traceId: string) {
  return await db
    .query("auditTraces")
    .withIndex("by_trace_id", (q) => q.eq("traceId", traceId))
    .unique();
}

export async function getTraceSpans(db: DatabaseReader, traceId: string) {
  return await db
    .query("auditSpans")
    .withIndex("by_trace_id_and_started_at", (q) => q.eq("traceId", traceId))
    .collect();
}

export async function getRootSpans(db: DatabaseReader, traceId: string) {
  const spans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_parent_span_id_and_depth", (q) =>
      q.eq("traceId", traceId).eq("parentSpanId", undefined).eq("depth", 0)
    )
    .collect();

  // Sort by startedAt and sequenceNumber
  return spans.sort((a, b) => {
    if (a.startedAt !== b.startedAt) {
      return a.startedAt - b.startedAt;
    }
    return (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
  });
}

export async function getChildSpans(
  db: DatabaseReader,
  traceId: string,
  parentSpanId: string
) {
  const spans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_parent_span_id_and_depth", (q) =>
      q.eq("traceId", traceId).eq("parentSpanId", parentSpanId)
    )
    .collect();

  // Sort by startedAt and sequenceNumber
  return spans.sort((a, b) => {
    if (a.startedAt !== b.startedAt) {
      return a.startedAt - b.startedAt;
    }
    return (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
  });
}

export async function getSpansByResource(
  db: DatabaseReader,
  resourceType: string,
  resourceId: string
) {
  return await db
    .query("auditSpans")
    .withIndex("by_resource_type_and_id", (q) =>
      q.eq("resourceType", resourceType).eq("resourceId", resourceId)
    )
    .collect();
}

export async function listRecentTraces(db: DatabaseReader, limit?: number) {
  return await db
    .query("auditTraces")
    .withIndex("by_started_at")
    .order("desc")
    .take(limit ?? 50);
}

export async function getSpansByTimeRange(
  db: DatabaseReader,
  traceId: string,
  startTime: number,
  endTime: number
) {
  const allSpans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_and_started_at", (q) => q.eq("traceId", traceId))
    .collect();

  return allSpans.filter((span) => {
    const spanStart = span.startedAt;
    const spanEnd = span.endedAt ?? Date.now();

    return spanStart <= endTime && spanEnd >= startTime;
  });
}

export async function getKeyEvents(db: DatabaseReader, traceId: string) {
  const spans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_and_started_at", (q) => q.eq("traceId", traceId))
    .collect();

  const keyEvents: Array<{
    timestamp: number;
    type: string;
    category: "workflow" | "task" | "condition" | "workItem" | "error";
    description: string;
    spanId: string;
    depth: number;
    workflowName?: string;
  }> = [];

  // Build parent map to identify root spans
  const parentMap = new Map<string, string | undefined>();
  for (const span of spans) {
    parentMap.set(span.spanId, span.parentSpanId);
  }

  // Build a map from spanId to the span object for quick lookup
  const spanById = new Map<string, (typeof spans)[0]>();
  for (const span of spans) {
    spanById.set(span.spanId, span);
  }

  // Build a map from workflowId to workflow name
  const workflowIdToName = new Map<string, string>();
  for (const span of spans) {
    if (
      span.operationType === "workflow" &&
      span.resourceName &&
      span.resourceId
    ) {
      workflowIdToName.set(span.resourceId, span.resourceName);
    }
  }

  // Find workflow name for a span by traversing up the parent chain
  const getWorkflowNameForSpan = (spanId: string): string | undefined => {
    let currentSpanId: string | undefined = spanId;
    const visited = new Set<string>();

    while (currentSpanId && !visited.has(currentSpanId)) {
      visited.add(currentSpanId);
      const currentSpan = spanById.get(currentSpanId);

      if (!currentSpan) break;

      // If this is a workflow operation, return its name
      if (
        currentSpan.operationType === "workflow" &&
        currentSpan.resourceName
      ) {
        return currentSpan.resourceName;
      }

      // Check if the span has a workflowId in attributes
      if (
        currentSpan.attributes &&
        typeof currentSpan.attributes === "object"
      ) {
        const attrs = currentSpan.attributes as Record<string, unknown>;
        if (attrs.workflowId && typeof attrs.workflowId === "string") {
          const workflowName = workflowIdToName.get(attrs.workflowId);
          if (workflowName) return workflowName;
        }
      }

      // Move to parent
      currentSpanId = currentSpan.parentSpanId;
    }

    return undefined;
  };

  // Create one event per root-level span (spans with no parent)
  for (const span of spans) {
    // Only include root spans (no parent or parent not in this trace)
    if (!span.parentSpanId || !parentMap.has(span.parentSpanId)) {
      keyEvents.push({
        timestamp: span.startedAt,
        type: span.operation,
        category: span.operationType as any,
        description: `${span.resourceName || span.operation}`,
        spanId: span.spanId,
        depth: span.depth,
        workflowName: getWorkflowNameForSpan(span.spanId),
      });
    }
  }

  return keyEvents.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getChildWorkflowInstances(
  db: DatabaseReader,
  args: {
    traceId: string;
    taskName: string;
    workflowName?: string;
    timestamp: number;
  }
) {
  const spans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_and_started_at", (q) =>
      q.eq("traceId", args.traceId)
    )
    .collect();

  // Sort by timestamp and sequence number
  spans.sort((a, b) => {
    const timeDiff = a.startedAt - b.startedAt;
    if (timeDiff !== 0) return timeDiff;
    const seqA = a.sequenceNumber ?? 0;
    const seqB = b.sequenceNumber ?? 0;
    return seqA - seqB;
  });

  // Find all child workflow instances for this task (and optional workflow name)
  // We match based on parent.taskName (and workflowName if provided), collecting all instances up to the timestamp
  const workflowInstances = new Map<
    string,
    {
      workflowId: string;
      workflowName: string;
      generation: number;
      state: "initialized" | "started" | "completed" | "failed" | "canceled";
      startedAt: number;
      endedAt?: number;
    }
  >();

  for (const span of spans) {
    if (span.startedAt > args.timestamp) break;

    // Look for workflow initialization spans that are children of this task
    if (
      span.operationType === "workflow" &&
      span.operation === "Workflow.initialize" &&
      span.attributes?.type === "workflow"
    ) {
      const attrs = span.attributes;
      const parent = attrs.parent;

      // Check if this workflow's parent is our composite task
      if (
        parent &&
        parent.taskName === args.taskName &&
        (!args.workflowName ||
          args.workflowName === attrs.workflowName ||
          args.workflowName === span.resourceName)
      ) {
        // Try to get workflowId from attributes, events, or resourceId
        const workflowId =
          attrs.workflowId ||
          span.events?.find((e: any) => e.name === "workflowIdAssigned")?.data
            ?.workflowId ||
          span.resourceId ||
          span.spanId;

        workflowInstances.set(workflowId, {
          workflowId,
          workflowName: attrs.workflowName ?? span.resourceName ?? "unknown",
          generation: parent.taskGeneration,
          state: "initialized",
          startedAt: span.startedAt,
        });
      }
    }

    // Update workflow states
    if (span.operationType === "workflow" && span.resourceId) {
      const instance = workflowInstances.get(span.resourceId);
      if (instance) {
        const operation = span.operation.split(".")[1];
        if (operation === "start") {
          instance.state = "started";
        } else if (operation === "complete") {
          instance.state = "completed";
          instance.endedAt = span.startedAt;
        } else if (operation === "fail") {
          instance.state = "failed";
          instance.endedAt = span.startedAt;
        } else if (operation === "cancel") {
          instance.state = "canceled";
          instance.endedAt = span.startedAt;
        }
      }
    }
  }

  const result = Array.from(workflowInstances.values());

  return result;
}

export async function getWorkflowStateAtTime(
  db: DatabaseReader,
  args: {
    traceId: string;
    timestamp: number;
    workflowId?: string;
  }
): Promise<WorkflowState | null> {
  // Use workflowId for filtering if provided, otherwise use traceId (root workflow)
  const targetWorkflowId = args.workflowId ?? args.traceId;

  // 1. Try to find a snapshot before or at the target timestamp
  // IMPORTANT: Only use snapshots for root workflow queries
  // Snapshots contain all workflows' state and aren't filtered by workflowId
  const isRootWorkflow = targetWorkflowId === args.traceId;
  const snapshot = isRootWorkflow
    ? await db
        .query("auditWorkflowSnapshots")
        .withIndex("by_trace_id_and_timestamp", (q) =>
          q.eq("traceId", args.traceId)
        )
        .filter((q) => q.lte(q.field("timestamp"), args.timestamp))
        .order("desc")
        .first()
    : null;

  // 2. If exact match, return cached snapshot
  if (snapshot && snapshot.timestamp === args.timestamp) {
    return snapshot.state;
  }

  // 3. Get spans from snapshot (or beginning) to target timestamp
  const startTime = snapshot?.timestamp ?? 0;

  const spans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_and_started_at", (q) =>
      q.eq("traceId", args.traceId)
    )
    .filter((q) =>
      q.and(
        // Get all spans from startTime onwards
        // Note: We include spans at snapshot timestamp because sequence numbers
        // reset between mutations, making them incomparable. Re-applying spans
        // at the snapshot timestamp is safe (idempotent).
        q.gte(q.field("startedAt"), startTime),
        q.lte(q.field("startedAt"), args.timestamp)
      )
    )
    .collect();

  // Filter spans: for production scenarios where multiple mutations can have
  // the same timestamp, we must re-apply all spans at the snapshot's timestamp
  // because sequence numbers from different mutations are incomparable.
  const relevantSpans = snapshot
    ? spans.filter((s) => {
        // Include spans strictly after snapshot timestamp
        if (s.startedAt > startTime) return true;
        // For spans at snapshot timestamp, we must include them all because
        // we can't tell which mutation they came from based on sequence number
        if (s.startedAt === startTime) return true;
        return false;
      })
    : spans;

  // Sort by timestamp + sequence
  relevantSpans.sort((a, b) => {
    const timeDiff = a.startedAt - b.startedAt;
    if (timeDiff !== 0) return timeDiff;
    const seqA = a.sequenceNumber ?? 0;
    const seqB = b.sequenceNumber ?? 0;
    return seqA - seqB;
  });

  // 4. If we have a snapshot, apply incremental changes
  if (snapshot) {
    return applySpansToState(
      snapshot.state,
      relevantSpans,
      args.timestamp,
      targetWorkflowId
    );
  }

  // 5. No snapshot, full reconstruction
  const workflowInitSpan = spans.find(
    (s) =>
      s.operationType === "workflow" && s.operation === "Workflow.initialize"
  );

  if (!workflowInitSpan) {
    // Skip snapshot if init span is missing (trace may still be flushing)
    return null;
  }

  // Sort all spans
  spans.sort((a, b) => {
    const timeDiff = a.startedAt - b.startedAt;
    if (timeDiff !== 0) return timeDiff;
    const seqA = a.sequenceNumber ?? 0;
    const seqB = b.sequenceNumber ?? 0;
    return seqA - seqB;
  });

  const workflowName =
    (workflowInitSpan.attributes as any)?.workflowName ??
    workflowInitSpan.resourceName ??
    "unknown";

  return reconstructStateFromSpans(
    workflowName,
    spans,
    args.timestamp,
    targetWorkflowId
  );
}

export async function computeWorkflowSnapshot(
  db: DatabaseWriter,
  args: {
    traceId: string;
    timestamp: number;
  }
) {
  const spans = await db
    .query("auditSpans")
    .withIndex("by_trace_id_and_started_at", (q) =>
      q.eq("traceId", args.traceId)
    )
    .filter((q) => q.lte(q.field("startedAt"), args.timestamp))
    .collect();

  // Sort by timestamp + sequence
  spans.sort((a, b) => {
    const timeDiff = a.startedAt - b.startedAt;
    if (timeDiff !== 0) return timeDiff;
    const seqA = a.sequenceNumber ?? 0;
    const seqB = b.sequenceNumber ?? 0;
    return seqA - seqB;
  });

  // 2. Find workflow init span
  const workflowInitSpan = spans.find(
    (s) =>
      s.operationType === "workflow" && s.operation === "Workflow.initialize"
  );

  if (!workflowInitSpan) {
    return false;
  }

  // 3. Reconstruct state
  const workflowName =
    (workflowInitSpan.attributes as any)?.workflowName ??
    workflowInitSpan.resourceName ??
    "unknown";

  const targetWorkflowId =
    (
      spans.find(
        (s) =>
          s.operationType === "workflow" &&
          (s.attributes as any)?.workflowId !== undefined
      )?.attributes as any
    )?.workflowId ??
    (workflowInitSpan.attributes as any)?.workflowId ??
    workflowInitSpan.resourceId;

  const state = reconstructStateFromSpans(
    workflowName,
    spans,
    args.timestamp,
    targetWorkflowId
  );

  // 4. Extract workflowId from spans or trace metadata
  const workflowId = args.traceId; // traceId IS workflowId for root workflows

  // 5. Store snapshot (upsert to avoid duplicates)
  const existing = await db
    .query("auditWorkflowSnapshots")
    .withIndex("by_trace_id_and_timestamp", (q) =>
      q.eq("traceId", args.traceId).eq("timestamp", args.timestamp)
    )
    .unique();

  if (existing) {
    await db.patch(existing._id, {
      state,
      sequenceNumber: state.sequenceNumber,
    });
  } else {
    await db.insert("auditWorkflowSnapshots", {
      traceId: args.traceId,
      workflowId,
      timestamp: args.timestamp,
      sequenceNumber: state.sequenceNumber,
      state,
    });
  }

  return true;
}

export async function saveAuditContext(
  db: DatabaseWriter,
  workflowId: string,
  data: {
    traceId: string;
    context: AuditContext;
    traceMetadata?: TraceData | undefined;
  }
) {
  const existing = await db
    .query("auditContexts")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", workflowId))
    .unique();

  if (existing) {
    await db.patch(existing._id, data);
  } else {
    await db.insert("auditContexts", {
      ...data,
      workflowId,
      createdAt: Date.now(),
    });
  }
}

export async function getAuditContext(db: DatabaseReader, workflowId: string) {
  return await db
    .query("auditContexts")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", workflowId))
    .unique();
}

export async function removeAuditContext(
  db: DatabaseWriter,
  workflowId: string
) {
  const existing = await db
    .query("auditContexts")
    .withIndex("by_workflow_id", (q) => q.eq("workflowId", workflowId))
    .unique();

  if (existing) {
    await db.delete(existing._id);
  }
}

export async function getWorkflowSnapshots(
  db: DatabaseReader,
  traceId: string
) {
  return await db
    .query("auditWorkflowSnapshots")
    .withIndex("by_trace_id_and_timestamp", (q) => q.eq("traceId", traceId))
    .collect();
}
