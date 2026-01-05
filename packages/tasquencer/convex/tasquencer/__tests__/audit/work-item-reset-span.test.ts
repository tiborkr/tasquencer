import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../../convex/_generated/api";

import schema from "../../../schema";
import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush, getTraceSpans, findSpan } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("resetAuditTest")
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
    workflowName: "resetAuditTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("records reset span with initialized state", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "resetAuditTest",
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
    workflowName: "resetAuditTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.resetWorkItem, {
    workflowName: "resetAuditTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const spans = await getTraceSpans(t, workflowId);
  const resetSpan = findSpan(spans, "WorkItem.reset", workItems[0]._id);
  expect(resetSpan).toBeDefined();
  const attributes = resetSpan?.attributes as
    | Record<string, unknown>
    | undefined;
  expect(attributes?.state).toBe("initialized");
});
