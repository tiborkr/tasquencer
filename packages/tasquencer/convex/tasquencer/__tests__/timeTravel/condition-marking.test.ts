import { setup, Builder } from "../setup.test";
import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../_generated/api";

import { versionManagerFor } from "../../versionManager";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import { waitForFlush } from "../audit/helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const simpleWorkflow = Builder.workflow("simpleTimeTravel")
  .startCondition("start")
  .task(
    "taskA",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .condition("c1")
  .task(
    "taskB",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("taskA"))
  .connectTask("taskA", (to) => to.condition("c1"))
  .connectCondition("c1", (to) => to.task("taskB"))
  .connectTask("taskB", (to) => to.condition("end"));

const simpleTimeTravelVersionManager = versionManagerFor("simpleTimeTravel")
  .registerVersion(WORKFLOW_VERSION_NAME, simpleWorkflow)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    simpleTimeTravelVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    simpleTimeTravelVersionManager
  );
});

describe("Condition Marking Time Travel", () => {
  it("incrementMarking creates span with correct attributes", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simpleTimeTravel",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "taskA",
      }
    );
    expect(workItems.length).toBe(1);

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    const traceId = workflowId;
    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId,
    });

    const markingSpan = spans.find(
      (s) =>
        s.operationType === "condition" &&
        s.operation === "Condition.incrementMarking" &&
        s.resourceName === "c1"
    );

    expect(markingSpan).toBeDefined();
    expect(markingSpan?.attributes).toMatchObject({
      oldMarking: 0,
      newMarking: 1,
      delta: 1,
    });
  });

  it("decrementMarking creates span when task starts", async ({ expect }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simpleTimeTravel",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    const workItemsA = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "taskA",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItemsA[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItemsA[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    const workItemsB = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "taskB",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItemsB[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    const traceId = workflowId;
    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId,
    });

    const decrementSpan = spans.find(
      (s) =>
        s.operationType === "condition" &&
        s.operation === "Condition.decrementMarking" &&
        s.resourceName === "c1"
    );

    expect(decrementSpan).toBeDefined();
    expect(decrementSpan?.attributes).toMatchObject({
      oldMarking: 1,
      newMarking: 0,
      delta: -1,
    });
  });

  it("condition marking and task enable spans are both captured", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simpleTimeTravel",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "taskA",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    const traceId = workflowId;
    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId,
    });

    const markingSpan = spans.find(
      (s) =>
        s.operationType === "condition" &&
        s.operation === "Condition.incrementMarking" &&
        s.resourceName === "c1"
    );

    const taskEnableSpan = spans.find(
      (s) =>
        s.operationType === "task" &&
        s.operation === "Task.enable" &&
        s.resourceName === "taskB"
    );

    expect(markingSpan).toBeDefined();
    expect(taskEnableSpan).toBeDefined();
    expect(markingSpan?.attributes).toHaveProperty("oldMarking");
    expect(markingSpan?.attributes).toHaveProperty("newMarking");
  });
});
