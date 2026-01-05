import { describe, test, expect, beforeEach } from "vitest";
import { getAuditService, resetAuditService } from "../../client/service";
import { getSpanBuffer, resetSpanBuffer } from "../../client/buffer";

describe("Audit Service - Basic Functionality", () => {
  beforeEach(() => {
    resetAuditService();
    resetSpanBuffer();
  });

  test("should start a trace and create root context", () => {
    const auditService = getAuditService();

    const context = auditService.startTrace({
      name: "testWorkflow",
      correlationId: "test-correlation-123",
      initiatorType: "user",
    });

    expect(context.traceId).toBeDefined();
    expect(context.depth).toBe(0);
    expect(context.path).toEqual([]);
    expect(context.correlationId).toBe("test-correlation-123");
  });

  test("should create and complete a span", () => {
    const auditService = getAuditService();
    const context = auditService.startTrace({ name: "testWorkflow" });

    const { spanId, context: childContext } = auditService.startSpan({
      context,
      operation: "Task.initialize",
      operationType: "task",
      resourceType: "task",
      resourceId: "task-123",
      resourceName: "myTask",
    });

    expect(spanId).toBeDefined();
    expect(childContext.parentSpanId).toBe(spanId);
    expect(childContext.depth).toBe(1);

    // Complete the span
    auditService.completeSpan(context.traceId, spanId);

    // Verify span was updated
    const buffer = getSpanBuffer();
    const span = buffer.getSpan(context.traceId, spanId);

    expect(span).toBeDefined();
    expect(span?.state).toBe("completed");
    expect(span?.endedAt).toBeDefined();
    expect(span?.duration).toBeDefined();
  });

  test("should handle nested spans", () => {
    const auditService = getAuditService();
    const context = auditService.startTrace({ name: "testWorkflow" });

    // Level 1 span
    const { spanId: span1, context: context1 } = auditService.startSpan({
      context,
      operation: "Workflow.initialize",
      operationType: "workflow",
    });

    // Level 2 span (nested)
    const { spanId: span2, context: context2 } = auditService.startSpan({
      context: context1,
      operation: "Task.onEnabled",
      operationType: "activity",
    });

    expect(context2.depth).toBe(2);
    expect(context2.parentSpanId).toBe(span2);
    expect(context2.path).toEqual(["Workflow.initialize", "Task.onEnabled"]);

    // Verify buffer
    const buffer = getSpanBuffer();
    const spanData1 = buffer.getSpan(context.traceId, span1);
    const spanData2 = buffer.getSpan(context.traceId, span2);

    expect(spanData1?.depth).toBe(0);
    expect(spanData1?.parentSpanId).toBeUndefined();

    expect(spanData2?.depth).toBe(1);
    expect(spanData2?.parentSpanId).toBe(span1);
  });

  test("should fail a span with error", () => {
    const auditService = getAuditService();
    const context = auditService.startTrace({ name: "testWorkflow" });

    const { spanId } = auditService.startSpan({
      context,
      operation: "Task.execute",
      operationType: "task",
    });

    const error = new Error("Something went wrong");
    auditService.failSpan(context.traceId, spanId, { error });

    const buffer = getSpanBuffer();
    const span = buffer.getSpan(context.traceId, spanId);

    expect(span?.state).toBe("failed");
    expect(span?.error).toEqual({
      message: "Something went wrong",
      stack: error.stack,
    });
  });

  test("should add events to a span", () => {
    const auditService = getAuditService();
    const context = auditService.startTrace({ name: "testWorkflow" });

    const { spanId } = auditService.startSpan({
      context,
      operation: "Task.execute",
      operationType: "task",
    });

    auditService.addEvent(context.traceId, spanId, {
      name: "validation_started",
      data: { validator: "email" },
    });

    auditService.addEvent(context.traceId, spanId, {
      name: "validation_completed",
      data: { result: "valid" },
    });

    const buffer = getSpanBuffer();
    const span = buffer.getSpan(context.traceId, spanId);

    expect(span?.events).toHaveLength(2);
    expect(span?.events?.[0].name).toBe("validation_started");
    expect(span?.events?.[1].name).toBe("validation_completed");
  });

  test("should get buffered trace data", () => {
    const auditService = getAuditService();
    const context = auditService.startTrace({ name: "testWorkflow" });

    const { spanId: span1 } = auditService.startSpan({
      operation: "Task1",
      operationType: "task",
      context,
    });

    const { spanId: span2 } = auditService.startSpan({
      operation: "Task2",
      operationType: "task",
      context,
    });

    const { trace, spans } = auditService.getBufferedTrace(context.traceId);

    expect(trace).toBeDefined();
    expect(trace?.name).toBe("testWorkflow");
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.spanId)).toContain(span1);
    expect(spans.map((s) => s.spanId)).toContain(span2);
  });

  test("should clear buffered trace", () => {
    const auditService = getAuditService();
    const context = auditService.startTrace({ name: "testWorkflow" });

    auditService.startSpan({
      operation: "Task1",
      operationType: "task",
      context,
    });

    let { spans } = auditService.getBufferedTrace(context.traceId);
    expect(spans).toHaveLength(1);

    auditService.clearBufferedTrace(context.traceId);

    const result = auditService.getBufferedTrace(context.traceId);
    expect(result.trace).toBeUndefined();
    expect(result.spans).toHaveLength(0);
  });
});
