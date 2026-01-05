import { setup, Builder } from "./setup.test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import schema from "../../schema";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import { components, internal } from "../../../convex/_generated/api";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";
import { ExecutionContext } from "../elements/executionContext";
import { TaskNotFoundError } from "../exceptions";
import type { AnyVersionManager } from "../versionManager";
import { makeAuditFunctionHandles } from "../audit/integration";

const WORKFLOW_NAME = "parent-generation-guard";
const WORKFLOW_VERSION = "v0";

function buildParentWorkflow() {
  let loopEnabledCount = 0;

  return Builder.workflow(WORKFLOW_NAME)
    .startCondition("start")
    .task(
      "loop",
      Builder.noOpTask
        .withSplitType("xor")
        .withJoinType("xor")
        .withActivities({
          onEnabled: async ({ workItem }) => {
            loopEnabledCount++;
            await workItem.initialize();
          },
        })
    )
    .condition("mid")
    .endCondition("end")
    .connectCondition("start", (to) => to.task("loop"))
    .connectTask("loop", (to) =>
      to
        .condition("mid")
        .condition("end")
        .route(async ({ route }) => {
          if (loopEnabledCount === 1) {
            return route.toCondition("mid");
          }
          return route.toCondition("end");
        })
    )
    .connectCondition("mid", (to) => to.task("loop"));
}

const childWorkflow = Builder.workflow("child-guard")
  .startCondition("start")
  .task("childTask", Builder.noOpTask)
  .endCondition("end")
  .connectCondition("start", (to) => to.task("childTask"))
  .connectTask("childTask", (to) => to.condition("end"))
  .build(WORKFLOW_VERSION);

describe("workflow parent generation guard", () => {
  let versionManager: AnyVersionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    versionManager = versionManagerFor(WORKFLOW_NAME)
      .registerVersion(WORKFLOW_VERSION, buildParentWorkflow())
      .build();
    internalVersionManagerRegistry.registerVersionManager(versionManager);
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(versionManager);
  });

  it("rejects stale parent task generations when initializing child workflows", async () => {
    const t = setup();

    const parentWorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: WORKFLOW_NAME,
        workflowVersionName: WORKFLOW_VERSION,
      }
    );

    const initialWorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: parentWorkflowId,
        taskName: "loop",
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: WORKFLOW_NAME,
      workflowVersionName: WORKFLOW_VERSION,
      workItemId: initialWorkItems[0]._id,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: WORKFLOW_NAME,
      workflowVersionName: WORKFLOW_VERSION,
      workItemId: initialWorkItems[0]._id,
    });

    const enabledTasks = await t.query(
      internal.testing.tasquencer.getWorkflowTasksByState,
      {
        workflowId: parentWorkflowId,
        state: "enabled",
      }
    );

    const loopTask = enabledTasks.find((task) => task.name === "loop");
    expect(loopTask).toBeTruthy();

    const staleGeneration = loopTask!.generation - 1;
    expect(staleGeneration).toBeGreaterThan(0);

    const auditFunctionHandles = await makeAuditFunctionHandles(
      components.tasquencerAudit
    );
    await expect(
      t.run(async (ctx) => {
        const executionContext = ExecutionContext.make({
          mutationCtx: ctx,
          isInternalMutation: true,
          executionMode: "normal",
          auditContext: {
            traceId: `trace_${Math.random()}`,
            depth: 0,
            path: [],
          },
          auditFunctionHandles,
        });

        await childWorkflow.initialize(
          executionContext,
          {
            workflowId: parentWorkflowId,
            taskName: "loop",
            taskGeneration: staleGeneration,
          },
          undefined
        );
      })
    ).rejects.toThrow(TaskNotFoundError);
  });
});
