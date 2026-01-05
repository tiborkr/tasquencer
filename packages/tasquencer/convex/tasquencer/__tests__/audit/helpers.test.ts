import { setup } from "../setup.test";
import { expect } from "vitest";
import { vi, it } from "vitest";
import type { Doc, Id } from "../../../_generated/dataModel";
import type {
  SpanState,
  TraceState,
} from "../../../components/audit/src/shared/context";
import { components } from "../../../_generated/api";
import type {
  AuditTracesDoc,
  AuditSpansDoc,
} from "../../../components/audit/src/component/types";

type AuditSpansDocExternal = Omit<AuditSpansDoc, "_id"> & { _id: string };
type AuditTracesDocExternal = Omit<AuditTracesDoc, "_id"> & { _id: string };

function getConvexTestHelper() {
  return setup();
}

type ConvexTest = ReturnType<typeof getConvexTestHelper>;

// Dummy test to mark this as a test file (prevents Convex deployment)
it("helpers module", () => {});

export async function waitForFlush(t: ConvexTest) {
  await vi.advanceTimersByTimeAsync(1000);
  await t.finishInProgressScheduledFunctions();
}

export async function getTrace(t: ConvexTest, workflowId: string) {
  const trace = await t.query(components.tasquencerAudit.api.getTrace, {
    traceId: workflowId,
  });

  if (!trace) {
    throw new Error(`Audit trace not found for workflow ${workflowId}`);
  }

  return trace;
}

export async function getTraceSpans(t: ConvexTest, workflowId: string) {
  return await t.query(components.tasquencerAudit.api.getTraceSpans, {
    traceId: workflowId,
  });
}

export async function getAuditContext(t: ConvexTest, workflowId: string) {
  return await t.query(components.tasquencerAudit.api.getAuditContext, {
    workflowId: workflowId,
  });
}

export function expectTrace(
  trace: AuditTracesDocExternal,
  expectedState: TraceState,
  expectedName?: string
) {
  expect(trace).toBeDefined();
  expect(trace.state).toBe(expectedState);
  expect(trace.startedAt).toBeDefined();

  if (expectedState !== "running") {
    expect(trace.endedAt).toBeDefined();
    expect(trace.endedAt).toBeGreaterThanOrEqual(trace.startedAt);
  }

  if (expectedName) {
    expect(trace.name).toBe(`workflow:${expectedName}`);
  }
}

export function verifySpanHierarchy(spans: AuditSpansDocExternal[]) {
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));

  for (const span of spans) {
    expect(span.traceId).toBeDefined();

    if (!span.parentSpanId) {
      expect(span.depth).toBe(0);
      expect(span.path).toEqual([]);
      continue;
    }

    const parent = spanMap.get(span.parentSpanId);
    expect(parent).toBeDefined();

    if (parent) {
      expect(span.depth).toBe(parent.depth + 1);
      expect(span.path.slice(0, -1)).toEqual(parent.path);
    }
  }
}

export function expectAllSpansInTrace(
  spans: AuditSpansDocExternal[],
  workflowId: string
) {
  spans.forEach((span) => {
    expect(span.traceId).toBe(workflowId);
  });
}

export function findSpan(
  spans: AuditSpansDocExternal[],
  operation: string,
  resourceId?: string
) {
  return spans.find((s) => {
    const matchesOp = s.operation === operation;
    const matchesResource = !resourceId || s.resourceId === resourceId;
    return matchesOp && matchesResource;
  });
}

export function countSpansByType(spans: AuditSpansDocExternal[]) {
  return spans.reduce(
    (acc, span) => {
      acc[span.operationType] = (acc[span.operationType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

export function expectNoDuplicateSpans(spans: AuditSpansDocExternal[]) {
  const spanIds = spans.map((s) => s.spanId);
  const uniqueSpanIds = new Set(spanIds);
  expect(spanIds.length).toBe(uniqueSpanIds.size);
}

export function expectSpanState(
  span: AuditSpansDocExternal,
  expectedState: SpanState
) {
  expect(span.state).toBe(expectedState);
  expect(span.startedAt).toBeDefined();

  if (expectedState !== "started") {
    expect(span.endedAt).toBeDefined();
    expect(span.duration).toBeGreaterThanOrEqual(0);
    expect(span.endedAt).toBeGreaterThanOrEqual(span.startedAt);
  }
}

export function expectSpanError(
  span: AuditSpansDocExternal,
  errorMessage?: string
) {
  expect(span.state).toBe("failed");
  expect(span.error).toBeDefined();
  expect(span.error.message).toBeDefined();

  if (errorMessage) {
    expect(span.error.message).toContain(errorMessage);
  }
}
