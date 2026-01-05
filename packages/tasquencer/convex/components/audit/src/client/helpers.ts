import { getAuditService } from "./service";
import { type AuditContext } from "../shared/context";
import { type SpanAttributes } from "../shared/attributeSchemas";

/**
 * Automatically wrap an async function with a span.
 * Context is passed explicitly to avoid race conditions in parallel operations.
 */
export async function withSpan<T>(
  args: {
    operation: string;
    operationType: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    attributes?: SpanAttributes;
  },
  parentContext: AuditContext,
  fn: (spanId: string, childContext: AuditContext) => Promise<T>
): Promise<T> {
  const auditService = getAuditService();
  const { spanId, context: childContext } = auditService.startSpan({
    ...args,
    context: parentContext,
  });

  try {
    const result = await fn(spanId, childContext);
    auditService.completeSpan(childContext.traceId, spanId);
    return result;
  } catch (error) {
    auditService.failSpan(childContext.traceId, spanId, {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    throw error;
  }
}

/**
 * Automatically wrap a synchronous function with a span.
 * Context is passed explicitly to avoid race conditions in parallel operations.
 */
export function withSpanSync<T>(
  args: {
    operation: string;
    operationType: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    attributes?: SpanAttributes;
  },
  parentContext: AuditContext,
  fn: (spanId: string, childContext: AuditContext) => T
): T {
  const auditService = getAuditService();
  const { spanId, context: childContext } = auditService.startSpan({
    ...args,
    context: parentContext,
  });

  try {
    const result = fn(spanId, childContext);
    auditService.completeSpan(childContext.traceId, spanId);
    return result;
  } catch (error) {
    auditService.failSpan(childContext.traceId, spanId, {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    throw error;
  }
}

/**
 * Get attributes safely
 */
export function getAttributes(
  attributes?: unknown
): SpanAttributes | undefined {
  if (!attributes || typeof attributes !== "object") {
    return undefined;
  }
  return attributes as SpanAttributes;
}

/**
 * Get events safely
 */
export function getEvents(
  events?: unknown
): Array<{ timestamp: number; name: string; data?: Record<string, unknown> }> {
  if (!events || !Array.isArray(events)) {
    return [];
  }
  return events as Array<{
    timestamp: number;
    name: string;
    data?: Record<string, unknown>;
  }>;
}

/**
 * Get error safely
 */
export function getError(
  error?: unknown
): { message: string; stack?: string; code?: string } | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  return error as {
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Get metadata safely
 */
export function getMetadata(
  metadata?: unknown
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}

/**
 * Build Gantt chart data structure from spans
 */
export type GanttItem = {
  id: string;
  spanId: string;
  name: string;
  operation: string;
  start: number;
  end: number;
  duration: number;
  state: "started" | "completed" | "failed" | "canceled";
  depth: number;
  children: GanttItem[];
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  attributes?: SpanAttributes;
};

export function buildGanttData(
  spans: Array<{
    spanId: string;
    parentSpanId?: string;
    operation: string;
    startedAt: number;
    endedAt?: number;
    duration?: number;
    state: "started" | "completed" | "failed" | "canceled";
    depth: number;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    attributes?: unknown;
  }>
): GanttItem[] {
  // Get attributes for all spans
  const parsedSpans = spans.map((span) => ({
    ...span,
    parsedAttributes: getAttributes(span.attributes),
  }));

  // Build parent-child map
  const spanMap = new Map<string, (typeof parsedSpans)[0]>();
  const childrenMap = new Map<string, Array<(typeof parsedSpans)[0]>>();

  for (const span of parsedSpans) {
    spanMap.set(span.spanId, span);

    const parentId = span.parentSpanId || "root";
    const children = childrenMap.get(parentId) || [];
    children.push(span);
    childrenMap.set(parentId, children);
  }

  // Recursively build tree
  function buildTree(parentId: string): GanttItem[] {
    const children = childrenMap.get(parentId) || [];
    return children.map((span) => {
      const endedAt = span.endedAt || Date.now();
      const duration = span.duration || endedAt - span.startedAt;

      return {
        id: span.spanId,
        spanId: span.spanId,
        name: span.resourceName || span.operation,
        operation: span.operation,
        start: span.startedAt,
        end: endedAt,
        duration,
        state: span.state,
        depth: span.depth,
        children: buildTree(span.spanId),
        resourceType: span.resourceType,
        resourceId: span.resourceId,
        resourceName: span.resourceName,
        attributes: span.parsedAttributes,
      };
    });
  }

  return buildTree("root");
}

/**
 * Build timeline event data from spans
 */
export type TimelineEvent = {
  timestamp: number;
  type: "span_start" | "span_end" | "event";
  spanId: string;
  operation: string;
  state?: "started" | "completed" | "failed" | "canceled";
  eventName?: string;
  data?: Record<string, unknown>;
};

export function buildTimelineData(
  spans: Array<{
    spanId: string;
    operation: string;
    startedAt: number;
    endedAt?: number;
    state: "started" | "completed" | "failed" | "canceled";
    events?: unknown;
  }>
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const span of spans) {
    // Add span start event
    events.push({
      timestamp: span.startedAt,
      type: "span_start",
      spanId: span.spanId,
      operation: span.operation,
      state: "started",
    });

    // Add custom events
    const spanEvents = getEvents(span.events);
    for (const evt of spanEvents) {
      events.push({
        timestamp: evt.timestamp,
        type: "event",
        spanId: span.spanId,
        operation: span.operation,
        eventName: evt.name,
        data: evt.data,
      });
    }

    // Add span end event if completed
    if (span.endedAt) {
      events.push({
        timestamp: span.endedAt,
        type: "span_end",
        spanId: span.spanId,
        operation: span.operation,
        state: span.state,
      });
    }
  }

  // Sort by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);

  return events;
}
