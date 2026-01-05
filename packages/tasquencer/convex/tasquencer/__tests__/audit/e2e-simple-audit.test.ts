import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../../convex/_generated/api";

import schema from "../../../schema";
import { registerVersionManagersForTesting } from "../helpers/versionManager";
import {
  waitForFlush,
  getTrace,
  getTraceSpans,
  expectTrace,
  verifySpanHierarchy,
  expectAllSpansInTrace,
  expectNoDuplicateSpans,
  expectSpanState,
} from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("simpleAuditTest")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "t2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to: any) => to.task("t1"))
  .connectTask("t1", (to: any) => to.task("t2"))
  .connectTask("t2", (to: any) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "simpleAuditTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("creates complete audit trace for simple workflow", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "simpleAuditTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const t1WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t1",
    }
  );
  expect(t1WorkItems.length).toBe(1);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "simpleAuditTest",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "simpleAuditTest",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const t2WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t2",
    }
  );
  expect(t2WorkItems.length).toBe(1);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "simpleAuditTest",
    workItemId: t2WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "simpleAuditTest",
    workItemId: t2WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);
  expectTrace(trace, "completed", "simpleAuditTest");
  expect(trace.traceId).toBe(workflowId);

  const spans = await getTraceSpans(t, workflowId);
  expect(spans.length).toBeGreaterThan(0);

  expectAllSpansInTrace(spans, workflowId);

  expectNoDuplicateSpans(spans);

  verifySpanHierarchy(spans);

  for (const span of spans) {
    expectSpanState(span, "completed");
  }

  for (let i = 1; i < spans.length; i++) {
    expect(spans[i].startedAt).toBeGreaterThanOrEqual(spans[i - 1].startedAt);
  }

  const workflowInitializeSpan = spans.find(
    (s) => s.operation === "Workflow.initialize"
  );
  expect(workflowInitializeSpan).toBeDefined();
  const workflowAttributes = workflowInitializeSpan?.attributes as
    | Record<string, any>
    | undefined;
  expect(workflowAttributes?.versionName).toBe(WORKFLOW_VERSION_NAME);

  const taskEnableSpan = spans.find(
    (s) => s.operation === "Task.enable" && s.resourceName === "t1"
  );
  expect(taskEnableSpan).toBeDefined();
  const taskAttributes = taskEnableSpan?.attributes as
    | Record<string, any>
    | undefined;
  expect(taskAttributes?.versionName).toBe(WORKFLOW_VERSION_NAME);

  const workItemInitializeSpan = spans.find(
    (s) =>
      s.operation === "WorkItem.initialize" &&
      Array.isArray(s.events) &&
      s.events.some(
        (event: any) =>
          event.name === "workItemIdAssigned" &&
          event.data?.workItemId === t1WorkItems[0]._id
      )
  );
  expect(workItemInitializeSpan).toBeDefined();
  const workItemAttributes = workItemInitializeSpan?.attributes as
    | Record<string, any>
    | undefined;
  expect(workItemAttributes?.versionName).toBe(WORKFLOW_VERSION_NAME);
  const workItemEvent = (workItemInitializeSpan?.events ?? []).find(
    (event: any) => event.name === "workItemIdAssigned"
  );
  expect(workItemEvent?.data?.workItemId).toBe(t1WorkItems[0]._id);
});

it("rewrites workflow trace attributes with the real workflow id", async ({
  expect,
}) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "simpleAuditTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);

  expect(trace.traceId).toBe(workflowId);

  const workflowAttributes = trace.attributes;
  expect(workflowAttributes).toBeDefined();
  if (!workflowAttributes || workflowAttributes.type !== "workflow") {
    throw new Error("Expected workflow trace attributes to be defined");
  }
  expect(workflowAttributes.workflowId).toBe(workflowId);

  const metadata = trace.metadata as Record<string, unknown> | undefined;
  expect(metadata?.workflowId).toBe(workflowId);
});
