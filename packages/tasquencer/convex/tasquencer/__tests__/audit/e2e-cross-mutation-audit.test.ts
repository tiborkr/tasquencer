import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../../convex/_generated/api";

import { registerVersionManagersForTesting } from "../helpers/versionManager";
import {
  waitForFlush,
  getTraceSpans,
  getAuditContext,
  expectAllSpansInTrace,
  expectNoDuplicateSpans,
  verifySpanHierarchy,
} from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("crossMutationAudit")
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
  .task(
    "t3",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to: any) => to.task("t1"))
  .connectTask("t1", (to: any) => to.task("t2"))
  .connectTask("t2", (to: any) => to.task("t3"))
  .connectTask("t3", (to: any) => to.condition("end"));

let cleanupVersionManagers: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "crossMutationAudit",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("maintains audit context across multiple mutations", async ({ expect }) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "crossMutationAudit",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );
  await waitForFlush(t);

  let auditContext = await getAuditContext(t, workflowId);
  expect(auditContext).not.toBeNull();
  if (!auditContext) {
    throw new Error("Audit context missing after initialization");
  }
  expect(auditContext.context.traceId).toBe(workflowId);

  const t1WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t1",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "crossMutationAudit",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "crossMutationAudit",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await waitForFlush(t);

  auditContext = await getAuditContext(t, workflowId);
  expect(auditContext).not.toBeNull();
  if (!auditContext) {
    throw new Error("Audit context missing after first work item completion");
  }

  const t2WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t2",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "crossMutationAudit",
    workItemId: t2WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "crossMutationAudit",
    workItemId: t2WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await waitForFlush(t);

  const t3WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t3",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "crossMutationAudit",
    workItemId: t3WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "crossMutationAudit",
    workItemId: t3WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await waitForFlush(t);

  const spans = await getTraceSpans(t, workflowId);
  expectAllSpansInTrace(spans, workflowId);

  expectNoDuplicateSpans(spans);

  verifySpanHierarchy(spans);

  const spanMap = new Map(spans.map((s: any) => [s.spanId, s]));
  for (const span of spans) {
    if (span.parentSpanId) {
      expect(spanMap.has(span.parentSpanId)).toBe(true);
    }
  }
});
