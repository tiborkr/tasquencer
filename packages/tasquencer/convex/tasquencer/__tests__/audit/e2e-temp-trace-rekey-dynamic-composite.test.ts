import { setup, Builder } from "../setup.test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { internal, components } from "../../../../convex/_generated/api";
import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush } from "./helpers.test";
import { z } from "zod";

const WORKFLOW_VERSION_NAME = "v0";

const childWorkflow = Builder.workflow("Child")
  .withActions(
    Builder.workflowActions().initialize(z.any(), async ({ workflow }) => {
      await workflow.initialize();
    })
  )
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

const rootWorkflow = Builder.workflow("rootTempTraceRekey")
  .withActions(
    Builder.workflowActions().initialize(z.any(), async ({ workflow }) => {
      await workflow.initialize();
    })
  )
  .startCondition("start")
  .dynamicCompositeTask(
    "exercise",
    Builder.dynamicCompositeTask([childWorkflow]).withActivities({
      onEnabled: async ({ workflow }) => {
        // Initialize the child workflow during root initialization (same mutation).
        await workflow.initialize.Child({});
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("exercise"))
  .connectTask("exercise", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "rootTempTraceRekey",
    versionName: WORKFLOW_VERSION_NAME,
    builder: rootWorkflow,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("does not persist temp traces when dynamic composite children initialize during root initialization", async () => {
  const t = setup();

  const rootWorkflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "rootTempTraceRekey",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: rootWorkflowId,
      taskName: "exercise",
    }
  );
  expect(childWorkflows.length).toBe(1);
  const childWorkflowId = childWorkflows[0]!._id;

  const childAuditContext = await t.query(
    components.tasquencerAudit.api.getAuditContext,
    { workflowId: childWorkflowId }
  );
  expect(childAuditContext?.traceId).toBe(rootWorkflowId);

  const childWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    { workflowId: childWorkflowId, taskName: "t1" }
  );
  expect(childWorkItems.length).toBe(1);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "rootTempTraceRekey",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: childWorkItems[0]!._id,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "rootTempTraceRekey",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: childWorkItems[0]!._id,
  });

  await waitForFlush(t);

  const traces = await t.query(components.tasquencerAudit.api.listRecentTraces, {
    limit: 100,
  });
  const tempTraces = traces.filter((trace) => trace.traceId.startsWith("temp_"));
  expect(tempTraces).toEqual([]);
});
