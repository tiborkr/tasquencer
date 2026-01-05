import { setup, Builder } from "../setup.test";
import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { internal, components } from "../../../_generated/api";
import { versionManagerFor } from "../../../tasquencer/versionManager";
import schema from "../../../schema";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import { waitForFlush } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

// Create a simple workflow for testing hierarchy
const simpleWorkflowDefinition = Builder.workflow("lazyLoadTest")
  .startCondition("start")
  .task(
    "task1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "task2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }: any) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to: any) => to.task("task1"))
  .connectTask("task1", (to: any) => to.task("task2"))
  .connectTask("task2", (to: any) => to.condition("end"));

const lazyLoadVersionManager = versionManagerFor("lazyLoadTest")
  .registerVersion(WORKFLOW_VERSION_NAME, simpleWorkflowDefinition)
  .build();

describe("Lazy Loading Queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    internalVersionManagerRegistry.registerVersionManager(
      lazyLoadVersionManager
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(
      lazyLoadVersionManager
    );
  });

  it("getRootSpans returns only depth-0 spans", async ({ expect }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "lazyLoadTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );
    await waitForFlush(t);

    const rootSpans = await t.query(
      components.tasquencerAudit.api.getRootSpans,
      {
        traceId: workflowId,
      }
    );

    // All returned spans should have depth 0
    for (const span of rootSpans) {
      expect(span.depth).toBe(0);
      expect(span.parentSpanId).toBeUndefined();
    }

    // Should have at least the workflow initialization span
    expect(rootSpans.length).toBeGreaterThan(0);
  });

  it("getRootSpans returns empty array for trace with no spans", async ({
    expect,
  }) => {
    const t = setup();

    const rootSpans = await t.query(
      components.tasquencerAudit.api.getRootSpans,
      {
        traceId: "non-existent-trace",
      }
    );

    expect(rootSpans).toEqual([]);
  });

  it("getChildSpans returns only direct children of a span", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "lazyLoadTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    // Complete some work to generate nested spans
    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task1",
      }
    );
    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "lazyLoadTest",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "lazyLoadTest",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);

    const rootSpans = await t.query(
      components.tasquencerAudit.api.getRootSpans,
      {
        traceId: workflowId,
      }
    );

    expect(rootSpans.length).toBeGreaterThan(0);

    // Get children of the first root span
    const childSpans = await t.query(
      components.tasquencerAudit.api.getChildSpans,
      {
        traceId: workflowId,
        parentSpanId: rootSpans[0].spanId,
      }
    );

    // All children should have the correct parent
    for (const span of childSpans) {
      expect(span.parentSpanId).toBe(rootSpans[0].spanId);
      expect(span.depth).toBe(rootSpans[0].depth + 1);
    }
  });

  it("getChildSpans returns empty array for leaf spans", async ({ expect }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "lazyLoadTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );
    await waitForFlush(t);

    // Get all spans to find a leaf
    const allSpans = await t.query(
      components.tasquencerAudit.api.getTraceSpans,
      {
        traceId: workflowId,
      }
    );

    // Find a span that has no children
    const leafSpan = allSpans.find(
      (s) => !allSpans.some((child) => child.parentSpanId === s.spanId)
    );

    if (leafSpan) {
      const childSpans = await t.query(
        components.tasquencerAudit.api.getChildSpans,
        {
          traceId: workflowId,
          parentSpanId: leafSpan.spanId,
        }
      );

      expect(childSpans).toEqual([]);
    }
  });

  it("spans at depth 3+ are NOT returned by getRootSpans", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "lazyLoadTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    // Complete work to generate nested structures
    const taskItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task1",
      }
    );
    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "lazyLoadTest",
      workItemId: taskItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "lazyLoadTest",
      workItemId: taskItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);

    const rootSpans = await t.query(
      components.tasquencerAudit.api.getRootSpans,
      {
        traceId: workflowId,
      }
    );

    const allSpans = await t.query(
      components.tasquencerAudit.api.getTraceSpans,
      {
        traceId: workflowId,
      }
    );

    // Check that there are deep spans in the trace
    const deepSpans = allSpans.filter((s) => s.depth >= 3);

    // Root spans should only have depth 0
    for (const span of rootSpans) {
      expect(span.depth).toBe(0);
    }

    // If there are deep spans, verify they're not in root spans
    if (deepSpans.length > 0) {
      const rootSpanIds = new Set(rootSpans.map((s) => s.spanId));
      for (const deepSpan of deepSpans) {
        expect(rootSpanIds.has(deepSpan.spanId)).toBe(false);
      }
    }
  });

  it("spans are sorted by startedAt then sequenceNumber", async ({
    expect,
  }) => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "lazyLoadTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    // Complete some work
    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "task1",
      }
    );
    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "lazyLoadTest",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "lazyLoadTest",
      workItemId: workItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });
    await waitForFlush(t);

    const rootSpans = await t.query(
      components.tasquencerAudit.api.getRootSpans,
      {
        traceId: workflowId,
      }
    );

    // Verify sorting
    for (let i = 1; i < rootSpans.length; i++) {
      const prev = rootSpans[i - 1];
      const curr = rootSpans[i];

      if (prev.startedAt === curr.startedAt) {
        // If timestamps are equal, sequence numbers should be ordered
        expect(curr.sequenceNumber ?? 0).toBeGreaterThanOrEqual(
          prev.sequenceNumber ?? 0
        );
      } else {
        // Otherwise timestamps should be ordered
        expect(curr.startedAt).toBeGreaterThanOrEqual(prev.startedAt);
      }
    }

    // Also test getChildSpans sorting
    if (rootSpans.length > 0) {
      const childSpans = await t.query(
        components.tasquencerAudit.api.getChildSpans,
        {
          traceId: workflowId,
          parentSpanId: rootSpans[0].spanId,
        }
      );

      for (let i = 1; i < childSpans.length; i++) {
        const prev = childSpans[i - 1];
        const curr = childSpans[i];

        if (prev.startedAt === curr.startedAt) {
          expect(curr.sequenceNumber ?? 0).toBeGreaterThanOrEqual(
            prev.sequenceNumber ?? 0
          );
        } else {
          expect(curr.startedAt).toBeGreaterThanOrEqual(prev.startedAt);
        }
      }
    }
  });
});
