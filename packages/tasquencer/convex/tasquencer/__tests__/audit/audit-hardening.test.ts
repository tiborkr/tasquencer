import { setup, Builder } from "../setup.test";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { internal, components } from "../../../../convex/_generated/api";
import { startBusinessTrace, withSpan } from "../../../tasquencer";
import schema from "../../../schema";
import { registerVersionManagersForTesting } from "../helpers/versionManager";
import { waitForFlush } from "./helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("auditHardeningTest")
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

let cleanupVersionManagers: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  cleanupVersionManagers = registerVersionManagersForTesting({
    workflowName: "auditHardeningTest",
    versionName: WORKFLOW_VERSION_NAME,
    builder: workflowDefinition,
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanupVersionManagers();
});

describe("audit hardening", () => {
  it("recovers audit context from persisted trace when missing", async () => {
    const t = setup();

    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "auditHardeningTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "t1",
      }
    );

    // Simulate a missing stored context
    await t.mutation(components.tasquencerAudit.api.removeAuditContext, {
      workflowId,
    });

    // Should recover context from persisted trace instead of throwing
    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "auditHardeningTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });
  });

  it("rejects flush when spans exist but trace metadata is missing", async () => {
    const t = setup();

    await expect(
      t.mutation(components.tasquencerAudit.api.flushTracePayload, {
        trace: undefined,
        spans: [
          {
            spanId: "s1",
            parentSpanId: undefined,
            depth: 0,
            path: [],
            operation: "Workflow.initialize",
            operationType: "workflow",
            startedAt: Date.now(),
            state: "started",
          },
        ],
      })
    ).rejects.toThrow("Trace metadata missing for flush");
  });

  it("writes snapshots under the parent/business traceId", async () => {
    const t = setup();

    const businessContext = startBusinessTrace({
      name: "BusinessOperation.snapshot",
    });

    const businessTraceId = businessContext.traceId;

    const workflowId = await withSpan(
      {
        operation: "BusinessOperation.initWorkflow",
        operationType: "business_logic",
      },
      businessContext,
      async (_spanId, childContext) => {
        return await t.mutation(
          internal.testing.tasquencer.initializeRootWorkflow,
          {
            workflowName: "auditHardeningTest",
            workflowVersionName: WORKFLOW_VERSION_NAME,
            parentContext: childContext,
          }
        );
      }
    );

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "t1",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "auditHardeningTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "auditHardeningTest",
      workflowVersionName: WORKFLOW_VERSION_NAME,
      workItemId: workItems[0]._id,
    });

    await waitForFlush(t);

    // All lifecycle happens automatically via activities; ensure we trigger scheduled jobs
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(1000);
    await t.finishInProgressScheduledFunctions();

    const snapshots = await t.query(
      components.tasquencerAudit.api.getWorkflowSnapshots,
      {
        traceId: businessTraceId,
      }
    );
    expect(snapshots.length).toBeGreaterThan(0);

    const spans = await t.query(components.tasquencerAudit.api.getTraceSpans, {
      traceId: businessTraceId,
    });
    const operations = spans.map((s) => s.operation);
    expect(operations).toContain("Workflow.complete");

    snapshots.forEach((s) => {
      expect(s.traceId).toBe(businessTraceId);
      expect(s.state.workflow.state).toBe("completed");
    });
  });
});
