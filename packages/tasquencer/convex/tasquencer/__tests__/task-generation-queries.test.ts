import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import schema from "../../schema";

import { versionManagerFor } from "../versionManager";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";
import { internal } from "../../_generated/api";

const WORKFLOW_VERSION_NAME = "v0";

function makeWorkflowDefinition() {
  let loopEnabledCount = 0;

  return Builder.workflow("generation-query-test")
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
    .task(
      "midTask",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
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
    .connectCondition("mid", (to) => to.task("loop").task("midTask"))
    .connectTask("midTask", (to) => to.condition("end"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("returns work items for the latest task generation", async ({ expect }) => {
  const versionManager = versionManagerFor("generation-query-test")
    .registerVersion(WORKFLOW_VERSION_NAME, makeWorkflowDefinition())
    .build();
  internalVersionManagerRegistry.registerVersionManager(versionManager);

  const t = setup();

  try {
    const workflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "generation-query-test",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    const firstItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "loop",
      }
    );
    expect(firstItems).toHaveLength(1);

    const firstWorkItemId = firstItems[0]._id;

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "generation-query-test",
      workItemId: firstWorkItemId,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "generation-query-test",
      workItemId: firstWorkItemId,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    const secondItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId,
        taskName: "loop",
      }
    );

    expect(secondItems).toHaveLength(1);
    expect(secondItems[0]._id).not.toEqual(firstWorkItemId);
    expect(secondItems[0].state).toBe("initialized");
  } finally {
    internalVersionManagerRegistry.unregisterVersionManager(versionManager);
  }
});
