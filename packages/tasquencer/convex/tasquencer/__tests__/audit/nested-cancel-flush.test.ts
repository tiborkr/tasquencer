import { setup, Builder } from "../setup.test";
import { afterEach, beforeEach, it, vi } from "vitest";
import schema from "../../../schema";

import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { internal } from "../../../_generated/api";
import {
  findSpan,
  getAuditContext,
  getTraceSpans,
  waitForFlush,
  expectSpanState,
} from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const childWorkflow = Builder.workflow("nested-cancel-child")
  .startCondition("start")
  .task(
    "childTask",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("childTask"))
  .connectTask("childTask", (to) => to.condition("end"));

const parentWorkflow = Builder.workflow("nested-cancel-parent")
  .startCondition("start")
  .compositeTask(
    "sub",
    Builder.compositeTask(childWorkflow).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("sub"))
  .connectTask("sub", (to) => to.condition("end"));

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "nested-cancel-parent",
    versionName: WORKFLOW_VERSION_NAME,
    builder: parentWorkflow,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("flushes audit spans when canceling a nested workflow", async ({
  expect,
}) => {
  vi.useFakeTimers();

  const t = setup();

  const rootWorkflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "nested-cancel-parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: rootWorkflowId,
      taskName: "sub",
    }
  );

  expect(childWorkflows).toHaveLength(1);

  const childWorkflowId = childWorkflows[0]._id;

  const childWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: childWorkflowId,
      taskName: "childTask",
    }
  );

  expect(childWorkItems).toHaveLength(1);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "nested-cancel-parent",
    workItemId: childWorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.cancelWorkflow, {
    workflowName: "nested-cancel-parent",
    workflowId: childWorkflowId,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const spans = await getTraceSpans(t, rootWorkflowId);
  const cancelSpan = findSpan(spans, "Workflow.cancel", childWorkflowId);

  expect(cancelSpan).toBeDefined();
  if (cancelSpan) {
    expectSpanState(cancelSpan, "completed");
  }
});

it("uses the child workflow audit context when cancelling a nested workflow", async ({
  expect,
}) => {
  const t = setup();

  const rootWorkflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "nested-cancel-parent",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId: rootWorkflowId,
      taskName: "sub",
    }
  );

  expect(childWorkflows).toHaveLength(1);
  const childWorkflowId = childWorkflows[0]._id;

  const childContext = await getAuditContext(t, childWorkflowId);
  expect(childContext).toBeDefined();

  const childWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: childWorkflowId,
      taskName: "childTask",
    }
  );

  expect(childWorkItems).toHaveLength(1);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "nested-cancel-parent",
    workItemId: childWorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.cancelWorkflow, {
    workflowName: "nested-cancel-parent",
    workflowId: childWorkflowId,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const spans = await getTraceSpans(t, rootWorkflowId);
  const cancelSpan = findSpan(spans, "Workflow.cancel", childWorkflowId);

  expect(cancelSpan).toBeDefined();
  if (cancelSpan && childContext) {
    expectSpanState(cancelSpan, "completed");
    expect(cancelSpan.path).toEqual(childContext.context.path);
    expect(cancelSpan.depth).toBe(childContext.context.depth);
  }
});
