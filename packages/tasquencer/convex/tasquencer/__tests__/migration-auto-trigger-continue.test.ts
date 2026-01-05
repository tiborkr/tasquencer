import { setup, Builder } from "./setup.test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import schema from "../../schema";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import { migrate, MigrationMode } from "../versionManager/migration";
import { internal } from "../../../convex/_generated/api";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";
import type { Doc } from "../../_generated/dataModel";

const WORKFLOW_NAME = "migration-auto-trigger-continue";
const WORKFLOW_V1 = "v1";
const WORKFLOW_V2 = "v2";

const autoCompleteWorkItem = Builder.workItem(
  "autoCompleteItem"
).withActivities({
  onInitialized: async (ctx) => {
    ctx.workItem.start(undefined);
  },
  onStarted: async (ctx) => {
    ctx.workItem.complete(undefined);
  },
});

const workflowV1 = Builder.workflow(WORKFLOW_NAME)
  .startCondition("start")
  .task("A", Builder.task(autoCompleteWorkItem))
  .endCondition("end")
  .connectCondition("start", (to) => to.task("A"))
  .connectTask("A", (to) => to.condition("end"));

const workflowV2 = Builder.workflow(WORKFLOW_NAME)
  .startCondition("start")
  .task("A", Builder.task(autoCompleteWorkItem))
  .endCondition("end")
  .connectCondition("start", (to) => to.task("A"))
  .connectTask("A", (to) => to.condition("end"));

const migrationV1ToV2 = migrate(workflowV1, workflowV2)
  .withTaskMigrators({
    [`${WORKFLOW_NAME}/A`]: async ({ workItem }) => {
      await workItem.initialize({ name: "autoCompleteItem" });
      return MigrationMode.continue;
    },
  })
  .build();

const versionManager = versionManagerFor(WORKFLOW_NAME)
  .registerVersion(WORKFLOW_V1, workflowV1)
  .registerVersion(WORKFLOW_V2, workflowV2)
  .withMigration("v1->v2", migrationV1ToV2)
  .build();

describe("migration auto-trigger behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    internalVersionManagerRegistry.registerVersionManager(versionManager);
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(versionManager);
  });

  it("runs auto-triggered transitions when migration continues", async () => {
    const t = setup();

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: WORKFLOW_NAME,
        workflowVersionName: WORKFLOW_V1,
      }
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: WORKFLOW_V2,
    });

    const v2Workflow = await getRootWorkflowByVersion(
      t,
      WORKFLOW_NAME,
      WORKFLOW_V2
    );
    expect(v2Workflow).not.toBeNull();

    const workItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: v2Workflow!._id,
        taskName: "A",
      }
    );

    expect(workItems).toHaveLength(1);
    expect(workItems[0].state).toBe("completed");
  });
});

async function getRootWorkflowByVersion(
  t: ReturnType<typeof setup>,
  workflowName: string,
  versionName: string
): Promise<Doc<"tasquencerWorkflows"> | null> {
  return await t.run(async (ctx) => {
    const all = await ctx.db.query("tasquencerWorkflows").collect();
    return (
      all.find(
        (workflow) =>
          workflow.name === workflowName &&
          workflow.versionName === versionName &&
          workflow.parent === undefined
      ) ?? null
    );
  });
}
