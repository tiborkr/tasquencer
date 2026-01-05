import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../../convex/_generated/api";

import schema from "../../../schema";
import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush, getTraceSpans } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const subWorkflowDefinition = Builder.workflow("apiNestingSub")
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

const mainWorkflowDefinition = Builder.workflow("apiNestingMain")
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
    workflowName: "apiNestingMain",
    versionName: WORKFLOW_VERSION_NAME,
    builder: mainWorkflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

it("API calls start at depth 0, nesting happens only within mutations", async ({
  expect,
}) => {
  const t = setup();

  // API Call 1: Initialize root workflow
  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "apiNestingMain",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  // API Call 2: Start work item t1
  const t1WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName: "t1",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "apiNestingMain",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // API Call 3: Complete work item t1
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "apiNestingMain",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // API Call 4: Start work item in child workflow
  const childWorkflows = await t.query(
    internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
    {
      workflowId,
      taskName: "t2",
    }
  );
  const childWorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: childWorkflows[0]._id,
      taskName: "subT1",
    }
  );
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "apiNestingMain",
    workItemId: childWorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // API Call 5: Complete work item in child workflow
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "apiNestingMain",
    workItemId: childWorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const spans = await getTraceSpans(t, workflowId);

  // Verify all spans belong to same trace
  spans.forEach((span) => {
    expect(span.traceId).toBe(workflowId);
  });

  // Each API call should have at least one span at depth 0
  const depth0Spans = spans.filter((s) => s.depth === 0);

  // We expect at least 5 depth-0 operations (one per API call)
  // Note: There might be more due to internal operations
  expect(depth0Spans.length).toBeGreaterThanOrEqual(5);

  // Verify that within each mutation, spans are properly nested
  const spansWithParents = spans.filter((s) => s.parentSpanId);
  spansWithParents.forEach((span) => {
    const parent = spans.find((s) => s.spanId === span.parentSpanId);
    expect(parent).toBeDefined();
    if (!parent) {
      throw new Error("Missing parent span for nested span");
    }
    // Child should be deeper than parent
    expect(span.depth).toBeGreaterThan(parent.depth);
  });
});

it("operations within a mutation are nested, but each API call resets depth", async ({
  expect,
}) => {
  const t = setup();

  const workflowId = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "apiNestingMain",
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
    workflowName: "apiNestingMain",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "apiNestingMain",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  const spans = await getTraceSpans(t, workflowId);

  // Within a single mutation, operations should be nested (depth > 0)
  const nestedSpans = spans.filter((s: any) => s.depth > 0);
  expect(nestedSpans.length).toBeGreaterThan(0);

  // Verify proper parent-child relationships
  nestedSpans.forEach((span: any) => {
    expect(span.parentSpanId).toBeDefined();
    const parent = spans.find((s: any) => s.spanId === span.parentSpanId);
    expect(parent).toBeDefined();
    if (parent) {
      // Child's depth should be parent's depth + 1
      expect(span.depth).toBe(parent.depth + 1);
      // Child's path should extend parent's path
      expect(span.path.length).toBe(parent.path.length + 1);
    }
  });
});
