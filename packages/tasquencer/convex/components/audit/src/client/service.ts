import { v4 as uuidv4 } from "uuid";
import {
  type AuditContext,
  type SpanData,
  type TraceData,
  type InitiatorType,
  type SpanError,
  createRootContext,
} from "../shared/context";
import {
  type SpanAttributes,
  type TraceAttributes,
} from "../shared/attributeSchemas";
import { getSpanBuffer } from "./buffer";

/**
 * Audit service interface for distributed tracing and observability.
 */
export interface IAuditService {
  /**
   * Check if audit is enabled
   */
  isEnabled(): boolean;

  /**
   * Start a new trace
   */
  startTrace(args: {
    name: string;
    correlationId?: string;
    initiatorType?: InitiatorType;
    initiatorUserId?: string;
    metadata?: Record<string, unknown>;
  }): AuditContext;

  /**
   * Start a new trace with a specific traceId
   */
  startTraceWithId(args: {
    traceId: string;
    name: string;
    correlationId?: string;
    initiatorType?: InitiatorType;
    initiatorUserId?: string;
    attributes?: TraceAttributes;
    metadata?: Record<string, unknown>;
  }): AuditContext;

  /**
   * Start a new span
   */
  startSpan(args: {
    operation: string;
    operationType: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    attributes?: SpanAttributes;
    context: AuditContext | null;
  }): { spanId: string; context: AuditContext };

  /**
   * Complete a span
   */
  completeSpan(
    traceId: string,
    spanId: string,
    args?: { attributes?: SpanAttributes }
  ): void;

  /**
   * Fail a span
   */
  failSpan(
    traceId: string,
    spanId: string,
    args: {
      error: Error | SpanError;
      attributes?: SpanAttributes;
    }
  ): void;

  /**
   * Cancel a span
   */
  cancelSpan(
    traceId: string,
    spanId: string,
    args?: { attributes?: SpanAttributes }
  ): void;

  /**
   * Add event to a span
   */
  addEvent(
    traceId: string,
    spanId: string,
    args: { name: string; data?: Record<string, unknown> }
  ): void;

  /**
   * Update trace state
   */
  updateTraceState(
    traceId: string,
    state: "running" | "completed" | "failed" | "canceled"
  ): void;

  /**
   * Get buffered trace data (for flushing)
   */
  getBufferedTrace(traceId: string): {
    trace: TraceData | undefined;
    spans: SpanData[];
  };

  /**
   * Clear buffered trace data (after flushing)
   */
  clearBufferedTrace(traceId: string): void;
}

/**
 * Core audit service for distributed tracing and observability.
 *
 * This service manages traces and spans in-memory during mutation execution,
 * and provides utilities for persisting them to the database asynchronously.
 *
 * NOTE: Context is passed explicitly through the call chain to avoid race conditions.
 */
export class AuditService implements IAuditService {
  /**
   * Check if audit is enabled
   */
  isEnabled(): boolean {
    return true;
  }
  /**
   * Start a new trace
   */
  startTrace(args: {
    name: string;
    correlationId?: string;
    initiatorType?: InitiatorType;
    initiatorUserId?: string;
    metadata?: Record<string, unknown>;
  }): AuditContext {
    const traceId = uuidv4();
    return this.startTraceWithId({ traceId, ...args });
  }

  /**
   * Start a new trace with a specific traceId
   */
  startTraceWithId(args: {
    traceId: string;
    name: string;
    correlationId?: string;
    initiatorType?: InitiatorType;
    initiatorUserId?: string;
    attributes?: TraceAttributes;
    metadata?: Record<string, unknown>;
  }): AuditContext {
    const startedAt = Date.now();

    const trace: TraceData = {
      traceId: args.traceId,
      name: args.name,
      startedAt,
      state: "running",
      correlationId: args.correlationId,
      initiatorType: args.initiatorType,
      initiatorUserId: args.initiatorUserId
        ? args.initiatorUserId.toString()
        : undefined,
      attributes: args.attributes,
      metadata: args.metadata,
    };

    const buffer = getSpanBuffer();
    buffer.setTrace(trace);

    const context = createRootContext({
      traceId: args.traceId,
      correlationId: args.correlationId,
    });

    return context;
  }

  /**
   * Start a new span
   */
  startSpan(args: {
    operation: string;
    operationType: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    attributes?: SpanAttributes;
    context: AuditContext | null;
  }): { spanId: string; context: AuditContext } {
    const context = args.context;
    if (!context) {
      throw new Error(
        "No audit context available. Context must be passed explicitly."
      );
    }

    const spanId = uuidv4();
    const startedAt = Date.now();

    const span: SpanData = {
      spanId,
      parentSpanId: context.parentSpanId,
      operation: args.operation,
      operationType: args.operationType,
      startedAt,
      state: "started",
      depth: context.depth,
      path: context.path,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      resourceName: args.resourceName,
      attributes: args.attributes,
      causationId: context.causationId,
    };

    const buffer = getSpanBuffer();
    buffer.setSpan(context.traceId, span);

    // Create child context with this span as parent
    const childContext: AuditContext = {
      ...context,
      parentSpanId: spanId,
      depth: context.depth + 1,
      path: [...context.path, args.operation],
    };

    return { spanId, context: childContext };
  }

  /**
   * Complete a span
   */
  completeSpan(
    traceId: string,
    spanId: string,
    args?: { attributes?: SpanAttributes }
  ): void {
    const buffer = getSpanBuffer();
    buffer.completeSpan(traceId, spanId, args);
  }

  /**
   * Fail a span
   */
  failSpan(
    traceId: string,
    spanId: string,
    args: {
      error: Error | SpanError;
      attributes?: SpanAttributes;
    }
  ): void {
    const error: SpanError =
      args.error instanceof Error
        ? {
            message: args.error.message,
            stack: args.error.stack,
            code: (args.error as any).code,
          }
        : args.error;

    const buffer = getSpanBuffer();
    buffer.failSpan(traceId, spanId, {
      error,
      attributes: args.attributes,
    });
  }

  /**
   * Cancel a span
   */
  cancelSpan(
    traceId: string,
    spanId: string,
    args?: { attributes?: SpanAttributes }
  ): void {
    const buffer = getSpanBuffer();
    buffer.cancelSpan(traceId, spanId, args);
  }

  /**
   * Add event to a span
   */
  addEvent(
    traceId: string,
    spanId: string,
    args: { name: string; data?: Record<string, unknown> }
  ): void {
    const buffer = getSpanBuffer();
    buffer.addEvent(traceId, spanId, args);
  }

  /**
   * Update trace state
   */
  updateTraceState(
    traceId: string,
    state: "running" | "completed" | "failed" | "canceled"
  ): void {
    const buffer = getSpanBuffer();
    const trace = buffer.getTrace(traceId);
    if (trace) {
      buffer.setTrace({
        ...trace,
        state,
        endedAt: state !== "running" ? Date.now() : trace.endedAt,
      });
    }
  }

  /**
   * Get buffered trace data (for flushing)
   */
  getBufferedTrace(traceId: string): {
    trace: TraceData | undefined;
    spans: SpanData[];
  } {
    const buffer = getSpanBuffer();
    return {
      trace: buffer.getTrace(traceId),
      spans: buffer.getSpans(traceId),
    };
  }

  /**
   * Clear buffered trace data (after flushing)
   */
  clearBufferedTrace(traceId: string): void {
    const buffer = getSpanBuffer();
    buffer.clear(traceId);
  }
}

/**
 * No-op audit service that does nothing.
 *
 * Used when audit is disabled to avoid performance overhead and null checks
 * in consumer code.
 */
export class NoOpAuditService implements IAuditService {
  private readonly dummyContext: AuditContext = {
    traceId: "noop",
    depth: 0,
    path: [],
  };

  /**
   * Check if audit is enabled
   */
  isEnabled(): boolean {
    return false;
  }

  /**
   * Start a new trace - returns dummy context
   */
  startTrace(_args: {
    name: string;
    correlationId?: string;
    initiatorType?: InitiatorType;
    initiatorUserId?: string;
    metadata?: Record<string, unknown>;
  }): AuditContext {
    return this.dummyContext;
  }

  /**
   * Start a new trace with a specific traceId - returns dummy context
   */
  startTraceWithId(_args: {
    traceId: string;
    name: string;
    correlationId?: string;
    initiatorType?: InitiatorType;
    initiatorUserId?: string;
    attributes?: TraceAttributes;
    metadata?: Record<string, unknown>;
  }): AuditContext {
    return this.dummyContext;
  }

  /**
   * Start a new span - returns dummy span and context
   */
  startSpan(args: {
    operation: string;
    operationType: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    attributes?: SpanAttributes;
    context: AuditContext | null;
  }): { spanId: string; context: AuditContext } {
    // Return the provided context or dummy context
    const context = args.context || this.dummyContext;
    return {
      spanId: "noop",
      context,
    };
  }

  /**
   * Complete a span - no-op
   */
  completeSpan(
    _traceId: string,
    _spanId: string,
    _args?: { attributes?: SpanAttributes }
  ): void {
    // No-op
  }

  /**
   * Fail a span - no-op
   */
  failSpan(
    _traceId: string,
    _spanId: string,
    _args: {
      error: Error | SpanError;
      attributes?: SpanAttributes;
    }
  ): void {
    // No-op
  }

  /**
   * Cancel a span - no-op
   */
  cancelSpan(
    _traceId: string,
    _spanId: string,
    _args?: { attributes?: SpanAttributes }
  ): void {
    // No-op
  }

  /**
   * Add event to a span - no-op
   */
  addEvent(
    _traceId: string,
    _spanId: string,
    _args: { name: string; data?: Record<string, unknown> }
  ): void {
    // No-op
  }

  /**
   * Update trace state - no-op
   */
  updateTraceState(
    _traceId: string,
    _state: "running" | "completed" | "failed" | "canceled"
  ): void {
    // No-op
  }

  /**
   * Get buffered trace data - returns empty
   */
  getBufferedTrace(_traceId: string): {
    trace: TraceData | undefined;
    spans: SpanData[];
  } {
    return {
      trace: undefined,
      spans: [],
    };
  }

  /**
   * Clear buffered trace data - no-op
   */
  clearBufferedTrace(_traceId: string): void {
    // No-op
  }
}

// Singleton instance
let serviceInstance: IAuditService | null = null;
let serviceEnabled = true; // Default to enabled

/**
 * Configure whether audit is enabled
 * This should be called before getAuditService()
 */
export function setAuditServiceEnabled(enabled: boolean): void {
  if (serviceInstance !== null && serviceEnabled !== enabled) {
    // Config changed, reset service
    serviceInstance = null;
  }
  serviceEnabled = enabled;
}

/**
 * Get the global audit service instance
 * Returns real service if enabled, no-op service if disabled
 */
export function getAuditService(): IAuditService {
  if (!serviceInstance) {
    serviceInstance = serviceEnabled
      ? new AuditService()
      : new NoOpAuditService();
  }
  return serviceInstance;
}

/**
 * Reset the service (for testing)
 */
export function resetAuditService(): void {
  serviceInstance = null;
}
