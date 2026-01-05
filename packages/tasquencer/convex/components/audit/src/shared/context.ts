import { v } from "convex/values";
import { type SpanAttributes, type TraceAttributes } from "./attributeSchemas";

export type AuditContext = {
  traceId: string;
  parentSpanId?: string;
  correlationId?: string;
  causationId?: string;
  depth: number;
  path: string[];
};

export const auditContextValidator = v.object({
  traceId: v.string(),
  parentSpanId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  causationId: v.optional(v.string()),
  depth: v.number(),
  path: v.array(v.string()),
});

export type SpanState = "started" | "completed" | "failed" | "canceled";

export type TraceState = "running" | "completed" | "failed" | "canceled";

export type InitiatorType = "user" | "system" | "scheduled";

export type SpanLinkType = "follows" | "triggers" | "related";

export type SpanEvent = {
  timestamp: number;
  name: string;
  data?: Record<string, unknown>;
};

export type SpanError = {
  message: string;
  stack?: string;
  code?: string;
};

export type SpanData = {
  spanId: string;
  parentSpanId?: string;
  operation: string;
  operationType: string;
  startedAt: number;
  endedAt?: number;
  duration?: number;
  state: SpanState;
  depth: number;
  path: string[];
  sequenceNumber?: number;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  attributes?: SpanAttributes;
  events?: SpanEvent[];
  error?: SpanError;
  causationId?: string;
};

export type TraceData = {
  traceId: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  state: TraceState;
  correlationId?: string;
  initiatorType?: InitiatorType;
  initiatorUserId?: string;
  attributes?: TraceAttributes;
  metadata?: Record<string, unknown>;
};

/**
 * Create a child context from parent context
 */
export function createChildContext(
  parent: AuditContext,
  pathSegment: string
): AuditContext {
  return {
    traceId: parent.traceId,
    parentSpanId: parent.parentSpanId,
    correlationId: parent.correlationId,
    causationId: parent.causationId,
    depth: parent.depth + 1,
    path: [...parent.path, pathSegment],
  };
}

/**
 * Create root context for a new trace
 */
export function createRootContext(args: {
  traceId: string;
  correlationId?: string;
  causationId?: string;
}): AuditContext {
  return {
    traceId: args.traceId,
    correlationId: args.correlationId,
    causationId: args.causationId,
    depth: 0,
    path: [],
  };
}
