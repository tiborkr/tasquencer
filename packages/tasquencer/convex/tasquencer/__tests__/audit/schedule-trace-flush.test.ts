import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../../convex/_generated/api";
import schema from "../../../schema";

import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush, getTrace, getTraceSpans } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const autoWorkItem = Builder.workItem("autoFlushWorkItem").withActivities({
  onInitialized: async ({ workItem }) => {
    workItem.start();
  },
  onStarted: async ({ workItem }) => {
    workItem.complete();
  },
});

const autoTask = Builder.task(autoWorkItem).withActivities({
  onEnabled: async ({ workItem }) => {
    await workItem.initialize();
  },
});

const scheduleFlushWorkflow = Builder.workflow("scheduleTraceFlushTest")
  .startCondition("start")
  .task("autoTask", autoTask)
  .endCondition("end")
  .connectCondition("start", (to) => to.task("autoTask"))
  .connectTask("autoTask", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "scheduleTraceFlushTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: scheduleFlushWorkflow,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("flushes spans created after multiple scheduleTraceFlush calls in the same mutation", async ({
  expect,
}) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "scheduleTraceFlushTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);
  expect(["running", "completed"]).toContain(trace.state);
  expect(trace.name).toBe("workflow:scheduleTraceFlushTest");

  const spans = await getTraceSpans(t, workflowId);
  expect(spans.length).toBeGreaterThan(0);

  const operations = spans.map((span) => span.operation);
  expect(operations).toContain("Workflow.initialize");
  expect(operations).toContain("Workflow.complete");
  expect(operations).toContain("WorkItem.initialize");
  expect(operations).toContain("WorkItem.start");
  expect(operations).toContain("WorkItem.complete");
});
