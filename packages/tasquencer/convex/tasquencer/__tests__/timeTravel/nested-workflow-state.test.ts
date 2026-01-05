import { setup, Builder } from "../setup.test";
import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../_generated/api";
import { withVersionManagerBuilders } from "../helpers/versionManager";
import { waitForFlush } from "../audit/helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const subWorkflowDefinition = Builder.workflow("nestedTimeTravelSub")
  .startCondition("start")
  .task(
    "subT1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .condition("c1")
  .task(
    "subT2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("subT1"))
  .connectTask("subT1", (to) => to.condition("c1"))
  .connectCondition("c1", (to) => to.task("subT2"))
  .connectTask("subT2", (to) => to.condition("end"));

const mainWorkflowDefinition = Builder.workflow("nestedTimeTravelMain")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .compositeTask(
    "t2",
    Builder.compositeTask(subWorkflowDefinition).withActivities({
      onEnabled: async ({ workflow }) => {
        await workflow.initialize();
      },
    })
  )
  .task(
    "t3",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.task("t2"))
  .connectTask("t2", (to) => to.task("t3"))
  .connectTask("t3", (to) => to.condition("end"));

const NESTED_VERSION_MANAGER_BUILDERS = [
  {
    workflowName: "nestedTimeTravelMain",
    versionName: WORKFLOW_VERSION_NAME,
    builder: mainWorkflowDefinition,
  },
  {
    workflowName: "nestedTimeTravelSub",
    versionName: WORKFLOW_VERSION_NAME,
    builder: subWorkflowDefinition,
  },
];

const withNestedVersionManagers = <T>(fn: () => Promise<T>) =>
  withVersionManagerBuilders(NESTED_VERSION_MANAGER_BUILDERS, fn);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Nested Workflow State Reconstruction", () => {
  it("child workflow has both increment and decrement condition spans", async ({
    expect,
  }) => {
    await withNestedVersionManagers(async () => {
      const t = setup();

      const workflowId = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "nestedTimeTravelMain",
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
        workflowName: "nestedTimeTravelMain",
        workItemId: t1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
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
      const childWorkflowId = childWorkflows[0]._id;

      const subT1WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT1",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const subT2WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT2",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT2WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await waitForFlush(t);

      const traceId = workflowId;
      const spans = await t.query(
        components.tasquencerAudit.api.getTraceSpans,
        {
          traceId,
        }
      );

      const childConditionSpans = spans.filter(
        (s: any) =>
          s.operationType === "condition" &&
          s.attributes?.workflowId === childWorkflowId
      );

      const c1IncrementSpans = childConditionSpans.filter(
        (s: any) =>
          s.resourceName === "c1" &&
          s.operation === "Condition.incrementMarking"
      );
      const c1DecrementSpans = childConditionSpans.filter(
        (s: any) =>
          s.resourceName === "c1" &&
          s.operation === "Condition.decrementMarking"
      );

      expect(c1IncrementSpans.length).toBe(1);
      expect(c1DecrementSpans.length).toBe(1);
      expect(c1IncrementSpans[0].attributes).toMatchObject({
        oldMarking: 0,
        newMarking: 1,
      });
      expect(c1DecrementSpans[0].attributes).toMatchObject({
        oldMarking: 1,
        newMarking: 0,
      });
    });
  });

  it("child workflow state reconstruction shows correct condition markings", async ({
    expect,
  }) => {
    await withNestedVersionManagers(async () => {
      const t = setup();

      const workflowId = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "nestedTimeTravelMain",
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
        workflowName: "nestedTimeTravelMain",
        workItemId: t1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
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
      const childWorkflowId = childWorkflows[0]._id;

      const subT1WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT1",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const subT2WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT2",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT2WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await waitForFlush(t);

      const traceId = workflowId;
      const spans = await t.query(
        components.tasquencerAudit.api.getTraceSpans,
        {
          traceId,
        }
      );
      const finalTimestamp = Math.max(...spans.map((s: any) => s.startedAt));

      const childState = await t.query(
        components.tasquencerAudit.api.getWorkflowStateAtTime,
        {
          traceId,
          workflowId: childWorkflowId,
          timestamp: finalTimestamp,
        }
      );

      expect(childState?.conditions["c1"]).toBeDefined();
      expect(childState?.conditions["c1"].marking).toBe(0);
      expect(childState?.conditions["start"]).toBeDefined();
      expect(childState?.conditions["start"].marking).toBe(0);
      expect(childState?.tasks["subT1"]).toBeDefined();
      expect(childState?.tasks["subT1"].state).toBe("completed");
      expect(childState?.tasks["subT2"]).toBeDefined();
      expect(childState?.tasks["subT2"].state).toBe("started");
    });
  });

  it("parent workflow state does not include child workflow conditions", async ({
    expect,
  }) => {
    await withNestedVersionManagers(async () => {
      const t = setup();

      const workflowId = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "nestedTimeTravelMain",
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
        workflowName: "nestedTimeTravelMain",
        workItemId: t1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
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
      const childWorkflowId = childWorkflows[0]._id;

      const subT1WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT1",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const subT2WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT2",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT2WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT2WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await waitForFlush(t);

      const traceId = workflowId;
      const spans = await t.query(
        components.tasquencerAudit.api.getTraceSpans,
        {
          traceId,
        }
      );
      const finalTimestamp = Math.max(...spans.map((s: any) => s.startedAt));

      const parentState = await t.query(
        components.tasquencerAudit.api.getWorkflowStateAtTime,
        {
          traceId,
          workflowId,
          timestamp: finalTimestamp,
        }
      );

      expect(parentState?.conditions["c1"]).toBeUndefined();
      expect(parentState?.conditions["start"]).toBeDefined();
      expect(parentState?.tasks["subT1"]).toBeUndefined();
      expect(parentState?.tasks["subT2"]).toBeUndefined();
      expect(parentState?.tasks["t1"]).toBeDefined();
      expect(parentState?.tasks["t2"]).toBeDefined();
    });
  });

  it("condition markings update correctly through complete workflow execution", async ({
    expect,
  }) => {
    await withNestedVersionManagers(async () => {
      const t = setup();

      const workflowId = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "nestedTimeTravelMain",
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
        workflowName: "nestedTimeTravelMain",
        workItemId: t1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
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
      const childWorkflowId = childWorkflows[0]._id;

      await waitForFlush(t);

      const traceId = workflowId;
      let spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
        traceId,
      });

      let timestamp = Math.max(...spans.map((s: any) => s.startedAt));
      let childState = await t.query(
        components.tasquencerAudit.api.getWorkflowStateAtTime,
        {
          traceId,
          workflowId: childWorkflowId,
          timestamp,
        }
      );
      expect(childState?.conditions["start"].marking).toBe(1);

      const subT1WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT1",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await waitForFlush(t);
      spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
        traceId,
      });
      timestamp = Math.max(...spans.map((s: any) => s.startedAt));
      childState = await t.query(
        components.tasquencerAudit.api.getWorkflowStateAtTime,
        {
          traceId,
          workflowId: childWorkflowId,
          timestamp,
        }
      );
      expect(childState?.conditions["start"].marking).toBe(0);

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT1WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await waitForFlush(t);
      spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
        traceId,
      });
      timestamp = Math.max(...spans.map((s: any) => s.startedAt));
      childState = await t.query(
        components.tasquencerAudit.api.getWorkflowStateAtTime,
        {
          traceId,
          workflowId: childWorkflowId,
          timestamp,
        }
      );
      expect(childState?.conditions["c1"].marking).toBe(1);

      const subT2WorkItems = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: childWorkflowId,
          taskName: "subT2",
        }
      );
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "nestedTimeTravelMain",
        workItemId: subT2WorkItems[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await waitForFlush(t);
      spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
        traceId,
      });
      timestamp = Math.max(...spans.map((s: any) => s.startedAt));
      childState = await t.query(
        components.tasquencerAudit.api.getWorkflowStateAtTime,
        {
          traceId,
          workflowId: childWorkflowId,
          timestamp,
        }
      );
      expect(childState?.conditions["c1"].marking).toBe(0);
    });
  });
});
