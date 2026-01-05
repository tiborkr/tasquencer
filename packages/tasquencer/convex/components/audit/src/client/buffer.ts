import {
  type SpanData,
  type TraceData,
  type SpanEvent,
  type SpanError,
} from "../shared/context";
import { type SpanAttributes } from "../shared/attributeSchemas";

/**
 * In-memory buffer for spans during mutation execution.
 * Uses module-level state which is safe in Convex V8 isolates
 * as long as we clear buffers appropriately.
 */
class SpanBuffer {
  private traces = new Map<string, TraceData>();
  private spans = new Map<string, Map<string, SpanData>>();
  private sequenceCounters = new Map<string, number>();

  /**
   * Create or update trace metadata
   */
  setTrace(trace: TraceData): void {
    this.traces.set(trace.traceId, trace);
  }

  /**
   * Get trace metadata
   */
  getTrace(traceId: string): TraceData | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Add or update a span in the buffer
   */
  setSpan(traceId: string, span: SpanData): void {
    // Assign sequence number if not already set
    if (span.sequenceNumber === undefined) {
      if (!this.sequenceCounters.has(traceId)) {
        this.sequenceCounters.set(traceId, 0);
      }
      const counter = this.sequenceCounters.get(traceId)!;
      span.sequenceNumber = counter;
      this.sequenceCounters.set(traceId, counter + 1);
    }

    let traceSpans = this.spans.get(traceId);
    if (!traceSpans) {
      traceSpans = new Map();
      this.spans.set(traceId, traceSpans);
    }
    traceSpans.set(span.spanId, span);
  }

  /**
   * Get a specific span
   */
  getSpan(traceId: string, spanId: string): SpanData | undefined {
    return this.spans.get(traceId)?.get(spanId);
  }

  /**
   * Get all spans for a trace
   */
  getSpans(traceId: string): SpanData[] {
    const traceSpans = this.spans.get(traceId);
    if (!traceSpans) {
      return [];
    }
    return Array.from(traceSpans.values());
  }

  /**
   * Update span state
   */
  updateSpan(
    traceId: string,
    spanId: string,
    updates: Partial<SpanData>
  ): void {
    const span = this.getSpan(traceId, spanId);
    if (span) {
      this.setSpan(traceId, { ...span, ...updates });
    }
  }

  /**
   * Complete a span
   */
  completeSpan(
    traceId: string,
    spanId: string,
    args?: { attributes?: SpanAttributes }
  ): void {
    const span = this.getSpan(traceId, spanId);
    if (!span) {
      return;
    }

    const endedAt = Date.now();
    this.updateSpan(traceId, spanId, {
      state: "completed",
      endedAt,
      duration: endedAt - span.startedAt,
      attributes: args?.attributes ?? span.attributes,
    });
  }

  /**
   * Fail a span
   */
  failSpan(
    traceId: string,
    spanId: string,
    args: {
      error: SpanError;
      attributes?: SpanAttributes;
    }
  ): void {
    const span = this.getSpan(traceId, spanId);
    if (!span) {
      return;
    }

    const endedAt = Date.now();
    this.updateSpan(traceId, spanId, {
      state: "failed",
      endedAt,
      duration: endedAt - span.startedAt,
      error: args.error,
      attributes: args.attributes ?? span.attributes,
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
    const span = this.getSpan(traceId, spanId);
    if (!span) {
      return;
    }

    const endedAt = Date.now();
    this.updateSpan(traceId, spanId, {
      state: "canceled",
      endedAt,
      duration: endedAt - span.startedAt,
      attributes: args?.attributes ?? span.attributes,
    });
  }

  /**
   * Add event to a span
   */
  addEvent(
    traceId: string,
    spanId: string,
    event: { name: string; data?: Record<string, unknown> }
  ): void {
    const span = this.getSpan(traceId, spanId);
    if (!span) {
      return;
    }

    const spanEvent: SpanEvent = {
      timestamp: Date.now(),
      name: event.name,
      data: event.data,
    };

    const events = span.events || [];
    this.updateSpan(traceId, spanId, {
      events: [...events, spanEvent],
    });
  }

  /**
   * Clear all spans for a trace
   * Note: Sequence counter is NOT cleared to maintain ordering across flush operations
   */
  clear(traceId: string): void {
    this.traces.delete(traceId);
    this.spans.delete(traceId);
    // DO NOT delete sequence counter - it must persist across flushes to maintain ordering
    // this.sequenceCounters.delete(traceId)
  }

  /**
   * Clear all buffers (for testing)
   */
  clearAll(): void {
    this.traces.clear();
    this.spans.clear();
    this.sequenceCounters.clear();
  }

  /**
   * Get all trace IDs in buffer
   */
  getTraceIds(): string[] {
    return Array.from(this.traces.keys());
  }
}

// Singleton instance
let bufferInstance: SpanBuffer | null = null;

/**
 * Get the global span buffer instance
 */
export function getSpanBuffer(): SpanBuffer {
  if (!bufferInstance) {
    bufferInstance = new SpanBuffer();
  }
  return bufferInstance;
}

/**
 * Reset the buffer (for testing)
 */
export function resetSpanBuffer(): void {
  if (bufferInstance) {
    bufferInstance.clearAll();
  }
  bufferInstance = null;
}
