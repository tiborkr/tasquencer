import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../../convex/_generated/api";

import schema from "../../../schema";
import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const simpleWorkflow = Builder.workflow("queryTest")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to: any) => to.task("t1"))
  .connectTask("t1", (to: any) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "queryTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: simpleWorkflow,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("getTrace returns trace by ID", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "queryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );
  await waitForFlush(t);

  const trace = await t.query(components.tasquencerAudit.api.getTrace, {
    traceId: workflowId,
  });

  expect(trace).toBeDefined();
  expect(trace).not.toBeNull();
  if (trace) {
    expect(trace.traceId).toBe(workflowId);
    expect(trace.name).toBe("workflow:queryTest");
  }
});

it("getTraceSpans returns ordered spans", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "queryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t1",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "queryTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "queryTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await waitForFlush(t);

  const trace = await t.query(components.tasquencerAudit.api.getTrace, {
    traceId: workflowId,
  });
  const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
    traceId: workflowId,
  });

  expect(trace).toBeDefined();
  expect(trace).not.toBeNull();
  expect(spans.length).toBeGreaterThan(0);

  if (trace) {
    expect(trace.traceId).toBe(workflowId);
  }

  for (let i = 1; i < spans.length; i++) {
    expect(spans[i].startedAt).toBeGreaterThanOrEqual(spans[i - 1].startedAt);
  }
});

it("listRecentTraces returns traces ordered by time", async ({ expect }) => {
  const t = setup();

  const wf1 = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "queryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );
  const wf2 = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "queryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );
  const wf3 = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "queryTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );
  await waitForFlush(t);

  const traces = await t.query(
    components.tasquencerAudit.api.listRecentTraces,
    {
      limit: 10,
    }
  );

  expect(traces.length).toBeGreaterThanOrEqual(3);

  const traceIds = traces.map((trace: any) => trace.traceId);
  expect(traceIds).toContain(wf1);
  expect(traceIds).toContain(wf2);
  expect(traceIds).toContain(wf3);

  for (let i = 1; i < traces.length; i++) {
    expect(traces[i].startedAt).toBeLessThanOrEqual(traces[i - 1].startedAt);
  }
});
