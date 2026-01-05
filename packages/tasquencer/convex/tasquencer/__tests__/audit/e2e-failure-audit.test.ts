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

const workflowDefinition = Builder.workflow("failureAuditTest")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
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
    workflowName: "failureAuditTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("traces failure propagation correctly", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "failureAuditTest",
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
  expect(workItems.length).toBe(2);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureAuditTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureAuditTest",
    workItemId: workItems[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "failureAuditTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const trace = await getTrace(t, workflowId);
  expectTrace(trace, "failed", "failureAuditTest");

  const spans = (await getTraceSpans(t, workflowId)) as any[];

  const businessFailedSpans = spans.filter(
    (s: any) =>
      s.attributes?.type === "activity" &&
      s.attributes?.data?.businessResult === "failed"
  );
  expect(businessFailedSpans.length).toBeGreaterThan(0);
  for (const span of businessFailedSpans) {
    expect(span.state).toBe("completed");
    expect(span.error).toBeUndefined();
  }

  const businessCanceledSpans = spans.filter(
    (s: any) =>
      s.attributes?.type === "activity" &&
      s.attributes?.data?.businessResult === "canceled"
  );
  expect(businessCanceledSpans.length).toBeGreaterThan(0);
  for (const span of businessCanceledSpans) {
    expect(span.state).toBe("completed");
    expect(span.error).toBeUndefined();
  }
});

it("emits typed attributes for cancellations and activity spans", async ({
  expect,
}) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "failureAuditTest",
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
  expect(workItems.length).toBe(2);

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureAuditTest",
    workItemId: workItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureAuditTest",
    workItemId: workItems[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.cancelWorkItem, {
    workflowName: "failureAuditTest",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workItemId: workItems[1]._id,
  });

  await t.mutation(internal.testing.tasquencer.cancelWorkflow, {
    workflowName: "failureAuditTest",
    workflowVersionName: WORKFLOW_VERSION_NAME,
    workflowId,
    cancellationReason: "migration",
  });

  await waitForFlush(t);

  const spans = (await getTraceSpans(t, workflowId)) as any[];

  const workItemCancelSpan = spans.find(
    (s: any) => s.operation === "WorkItem.cancel"
  );
  expect(workItemCancelSpan).toBeDefined();
  expect(workItemCancelSpan?.attributes?.type).toBe("workItem");
  expect(workItemCancelSpan?.attributes?.state).toBe("canceled");
  expect(workItemCancelSpan?.attributes?.parent?.taskName).toBe("t1");
  expect(workItemCancelSpan?.attributes?.payload?.reason).toBe("explicit");

  const workflowCancelSpan = spans.find(
    (s: any) => s.operation === "Workflow.cancel"
  );
  expect(workflowCancelSpan).toBeDefined();
  expect(workflowCancelSpan?.attributes?.type).toBe("workflow");
  expect(workflowCancelSpan?.attributes?.state).toBe("canceling");
  expect(workflowCancelSpan?.attributes?.payload?.reason).toBe("migration");

  const canceledActivitySpan = spans.find(
    (s: any) => s.operation === "WorkItemActivity.onCanceled"
  );
  expect(canceledActivitySpan).toBeDefined();
  expect(canceledActivitySpan?.attributes?.type).toBe("activity");
  expect(canceledActivitySpan?.attributes?.activityName).toBe("onCanceled");
  expect(canceledActivitySpan?.attributes?.data?.businessResult).toBe(
    "canceled"
  );
});
