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

describe("State Reconstruction", () => {
  it("reconstructs initial state correctly", async ({ expect }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simpleTimeTravel",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);

    const trace = await t.query(components.tasquencerAudit.api.getTrace, {
      traceId: workflowId,
    });
    expect(trace).toBeDefined();

    const state = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: trace!.startedAt,
      }
    );

    expect(state?.workflow.state).toBe("initialized");
    // Note: Initial conditions not in spans because structure was removed (Phase 1.1)
    // Conditions are now discovered from spans as they change
    // At initialization, no condition changes have occurred yet
    expect(state?.tasks["taskA"].state).toBe("enabled");
    // taskB may not be discovered yet if it hasn't had any spans
    expect(state?.tasks["taskB"]?.state ?? "disabled").toBe("disabled");
  });

  it("nests start condition marking under workflow initialization", async ({
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

    await waitForFlush(t);

    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    const initSpan = spans.find(
      (s) =>
        s.operationType === "workflow" && s.operation === "Workflow.initialize"
    );

    const startMarkingSpan = spans.find(
      (s) =>
        s.operationType === "condition" &&
        s.operation === "Condition.incrementMarking" &&
        s.resourceName === "start"
    );

    expect(initSpan).toBeDefined();
    expect(startMarkingSpan).toBeDefined();
    expect(startMarkingSpan?.parentSpanId).toBe(initSpan?.spanId);
  });

  it("records work item initialize span with resourceId for reconstruction", async ({
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

    await waitForFlush(t);

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "taskA",
      }
    );

    const workItemId = workItems[0]._id;

    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    const initializeSpan = spans.find(
      (s) =>
        s.operationType === "workItem" &&
        s.operation === "WorkItem.initialize" &&
        s.resourceId === workItemId
    );

    expect(initializeSpan).toBeDefined();

    const state = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp: Date.now(),
      }
    );

    expect(state?.workItems[workItemId]?.id).toBe(workItemId);
    expect(state?.workItems[workItemId]?.taskName).toBe("taskA");
    expect(state?.workItems[workItemId]?.state).toBe("initialized");
  });

  it("reconstructs mid-execution state correctly", async ({ expect }) => {
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

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    const timestamp = Date.now();

    const state = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp,
      }
    );

    expect(state?.workflow.state).toBe("started");
    expect(state?.conditions["start"].marking).toBe(0);
    expect(state?.conditions["c1"].marking).toBe(1);
    // Note: 'end' condition is not in spans because it never changed
    // After Phase 1.1, structure should be fetched from API to get all conditions
    expect(state?.conditions["end"]).toBeUndefined();
    expect(state?.tasks["taskA"].state).toBe("completed");
    expect(state?.tasks["taskB"].state).toBe("enabled");

    await waitForFlush(t);
  });

  it("reconstructs final state correctly", async ({ expect }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simpleTimeTravel",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    // Advance time after initialization to ensure unique timestamps
    vi.advanceTimersByTime(100);

    const workItemsA = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "taskA",
      }
    );

    await waitForFlush(t);

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItemsA[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    // Advance time after starting taskA
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItemsA[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Advance time after completing taskA
    vi.advanceTimersByTime(100);

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

    // Advance time after starting taskB
    vi.advanceTimersByTime(100);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItemsB[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Advance time after completing taskB
    vi.advanceTimersByTime(100);

    // Allow snapshot computation to run (may need multiple passes)
    await t.finishAllScheduledFunctions(vi.runAllTimersAsync);

    // Advance time to ensure query timestamp is after all spans and snapshots
    vi.advanceTimersByTime(100);

    const timestamp = Date.now();

    const state = await t.query(
      components.tasquencerAudit.api.getWorkflowStateAtTime,
      {
        traceId: workflowId,
        timestamp,
      }
    );

    expect(state?.workflow.state).toBe("completed");
    expect(state?.conditions["start"].marking).toBe(0);
    expect(state?.conditions["c1"].marking).toBe(0);
    // Note: 'end' condition won't appear in state reconstruction (see TIME_TRAVEL_AUDIT_CHANGES_PLAN.md Issue #2)
    expect(state?.tasks["taskA"].state).toBe("completed");
    expect(state?.tasks["taskB"].state).toBe("completed");
  });

  it("captures workflow structure in initialization span", async ({
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

    await waitForFlush(t);

    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    const initSpan = spans.find(
      (s) =>
        s.operationType === "workflow" && s.operation === "Workflow.initialize"
    );

    expect(initSpan).toBeDefined();
    expect(initSpan?.attributes).toHaveProperty("workflowName");
    expect((initSpan?.attributes as any)?.workflowName).toBe(
      "simpleTimeTravel"
    );

    // Note: workflowStructure is no longer embedded in spans (Phase 1.1)
    // Structure should be fetched from workflow structure API instead
    expect(initSpan?.attributes).not.toHaveProperty("workflowStructure");

    await waitForFlush(t);
  });

  it("task enable span includes join info", async ({ expect }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simpleTimeTravel",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);

    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    const taskEnableSpan = spans.find(
      (s) =>
        s.operationType === "task" &&
        s.operation === "Task.enable" &&
        s.resourceName === "taskA"
    );

    expect(taskEnableSpan).toBeDefined();
    expect(taskEnableSpan?.attributes).toHaveProperty("joinType");
    expect(taskEnableSpan?.attributes).toHaveProperty("splitType");
    expect(taskEnableSpan?.attributes).toHaveProperty("inputConditions");
    expect(taskEnableSpan?.attributes).toHaveProperty("joinSatisfied");

    const attrs = taskEnableSpan?.attributes as any;
    expect(attrs.joinType).toBe("and");
    expect(attrs.joinSatisfied).toBe(true);
    expect(Array.isArray(attrs.inputConditions)).toBe(true);
  });

  it("task complete span includes split info", async ({ expect }) => {
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

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simpleTimeTravel",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: workflowId,
    });

    const taskCompleteSpan = spans.find(
      (s) =>
        s.operationType === "task" &&
        s.operation === "Task.complete" &&
        s.resourceName === "taskA"
    );

    expect(taskCompleteSpan).toBeDefined();
    expect(taskCompleteSpan?.attributes).toHaveProperty("splitType");

    const attrs = taskCompleteSpan?.attributes as any;
    expect(attrs.splitType).toBe("and");
    expect(attrs.outputConditions).toBeDefined();
  });
});
