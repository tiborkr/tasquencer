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
} from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("auditSmokeTest")
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
    workflowName: "auditSmokeTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("flushes an audit trace for a simple workflow", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "auditSmokeTest",
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
    workflowName: "auditSmokeTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "auditSmokeTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);
  expectTrace(trace, "completed", "auditSmokeTest");

  const spans = await getTraceSpans(t, workflowId);
  expect(spans.length).toBeGreaterThan(0);
});
