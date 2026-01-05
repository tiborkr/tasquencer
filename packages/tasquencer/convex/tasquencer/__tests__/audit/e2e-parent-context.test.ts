import { setup, Builder } from "../setup.test";
import { it, vi, expect, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../../convex/_generated/api";
import {
  startBusinessTrace,
  withSpan,
  getAuditService,
} from "../../../../convex/tasquencer";
import { registerVersionManagersForTesting } from "../helpers/versionManager";

import {
  waitForFlush,
  getTrace,
  getTraceSpans,
  expectTrace,
  verifySpanHierarchy,
  expectNoDuplicateSpans,
} from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("parentContextTest")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "parentContextTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("workflow becomes child span when parent context provided", async () => {
  const t = setup();

  const businessContext = startBusinessTrace({
    name: "BusinessOperation.createWorkflow",
    correlationId: "test-correlation-123",
  });

  expect(businessContext).toBeDefined();
  if (!businessContext) return;

  const businessTraceId = businessContext.traceId;

  await withSpan(
    {
      operation: "BusinessOperation.initWorkflow",
      operationType: "business_logic",
    },
    businessContext,
    async (_spanId, childContext) => {
      await t.mutation(internal.testing.tasquencer.initializeRootWorkflow, {
        workflowName: "parentContextTest",
        parentContext: childContext,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
    }
  );

  await waitForFlush(t);

  await t.mutation(components.tasquencerAudit.api.flushTracePayload, {
    trace: getAuditService().getBufferedTrace(businessTraceId).trace,
    spans: getAuditService().getBufferedTrace(businessTraceId).spans,
  });

  await waitForFlush(t);

  const trace = await t.query(components.tasquencerAudit.api.getTrace, {
    traceId: businessTraceId,
  });

  expect(trace).toBeDefined();
  if (!trace) return;

  expect(trace.state).toBe("running");
  expect(trace.name).toBe("BusinessOperation.createWorkflow");
  expect(trace.traceId).toBe(businessTraceId);
  expect(trace.correlationId).toBe("test-correlation-123");

  const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
    traceId: businessTraceId,
  });

  expect(spans.length).toBeGreaterThan(0);

  for (const span of spans) {
    expect(span.traceId).toBe(businessTraceId);
  }
  expectNoDuplicateSpans(spans);
  verifySpanHierarchy(spans);

  const workflowSpans = spans.filter((s) =>
    s.operation.startsWith("Workflow.")
  );
  expect(workflowSpans.length).toBeGreaterThan(0);

  for (const span of workflowSpans) {
    expect(span.parentSpanId).toBeDefined();
    expect(span.depth).toBeGreaterThan(0);
  }
});

it("workflow creates independent trace when no parent context", async () => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "parentContextTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);
  expectTrace(trace, "running", "parentContextTest");
  expect(trace.traceId).toBe(workflowId);

  const spans = await getTraceSpans(t, workflowId);
  expect(spans.length).toBeGreaterThan(0);

  for (const span of spans) {
    expect(span.traceId).toBe(workflowId);
  }
  expectNoDuplicateSpans(spans);
  verifySpanHierarchy(spans);
});

it("flushes parent-context traces using the traceId (not the workflowId)", async ({
  expect,
}) => {
  const t = setup();

  const businessContext = startBusinessTrace({
    name: "BusinessOperation.tracePropagation",
  });
  const businessTraceId = businessContext.traceId;

  const workflowId = await withSpan(
    {
      operation: "BusinessOperation.initWorkflow",
      operationType: "business_logic",
    },
    businessContext,
    async (_spanId, childContext) => {
      return await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "parentContextTest",
          parentContext: childContext,
          workflowVersionName: WORKFLOW_VERSION_NAME,
        }
      );
    }
  );

  await waitForFlush(t);

  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t1",
    }
  );

  expect(workItems.length).toBe(1);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "parentContextTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "parentContextTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const trace = await t.query(components.tasquencerAudit.api.getTrace, {
    traceId: businessTraceId,
  });

  expect(trace).toBeDefined();
  expect(trace?.traceId).toBe(businessTraceId);

  const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
    traceId: businessTraceId,
  });

  const operations = spans.map((s) => s.operation);
  expect(operations).toContain("Workflow.initialize");
  expect(operations).toContain("WorkItem.start");
  expect(operations).toContain("WorkItem.complete");

  const state = await t.query(
    components.tasquencerAudit.api.getWorkflowStateAtTime,
    {
      traceId: businessTraceId,
      workflowId: workflowId as string,
      timestamp: Date.now(),
    }
  );

  expect(state?.workflow.state).toBe("completed");
});
