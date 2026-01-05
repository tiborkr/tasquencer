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
} from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const subWorkflowDefinition = Builder.workflow("nestedAuditSub")
  .startCondition("start")
  .task(
    "subT1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to: any) => to.task("subT1"))
  .connectTask("subT1", (to: any) => to.condition("end"));

const mainWorkflowDefinition = Builder.workflow("nestedAuditMain")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .compositeTask(
    "t2",
    Builder.compositeTask(subWorkflowDefinition).withActivities({
      onEnabled: async ({ workflow }: any) => {
        await workflow.initialize();
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
    workflowName: "nestedAuditMain",
    versionName: WORKFLOW_VERSION_NAME,
    builder: mainWorkflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("nested workflow creates single trace with correct hierarchy", async ({
  expect,
}) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "nestedAuditMain",
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
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "nestedAuditMain",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "nestedAuditMain",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId,
      taskName: "t2",
    }
  );
  expect(childWorkflows.length).toBe(1);

  const childWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: childWorkflows[0]._id,
      taskName: "subT1",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "nestedAuditMain",
    workItemId: childWorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "nestedAuditMain",
    workItemId: childWorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);
  expectTrace(trace, "completed", "nestedAuditMain");

  const spans = await getTraceSpans(t, workflowId);
  expectAllSpansInTrace(spans, workflowId);

  verifySpanHierarchy(spans);

  const compositeTaskSpans = spans.filter(
    (s: any) => s.operationType === "task" && s.resourceName === "t2"
  );
  expect(compositeTaskSpans.length).toBeGreaterThan(0);

  const compositeOnEnabledSpan = spans.find(
    (s: any) =>
      s.operation === "TaskActivity.onEnabled" &&
      s.resourceName === "t2" &&
      s.operationType === "task_activity"
  );
  expect(compositeOnEnabledSpan).toBeDefined();

  const compositeWorkflowStateSpan = spans.find(
    (s: any) =>
      s.operation === "TaskActivity.onWorkflowStateChanged" &&
      s.resourceName === "t2" &&
      s.operationType === "task_activity"
  );
  expect(compositeWorkflowStateSpan).toBeDefined();

  const childWorkflowSpans = spans.filter(
    (s: any) =>
      s.resourceType === "workflow" && s.resourceId === childWorkflows[0]._id
  );
  expect(childWorkflowSpans.length).toBeGreaterThan(0);
});
