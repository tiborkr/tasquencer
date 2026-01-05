import { setup, Builder } from "../setup.test";
import { describe, it, beforeEach, afterEach, vi } from "vitest";
import { internal } from "../../../_generated/api";
import type { Doc, Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { versionManagerFor } from "../../../tasquencer/versionManager";
import {
  migrate,
  MigrationMode,
  type TaskOnMigrate,
} from "../../versionManager/migration";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";

const autoTask = () =>
  Builder.noOpTask.withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize();
    },
  });

const deferredWorkflowV1 = Builder.workflow("deferredChoice")
  .startCondition("start")
  .task(
    "assessment",
    Builder.noOpTask.withSplitType("xor").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task("admit", autoTask())
  .task("discharge", autoTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("assessment"))
  .connectTask("assessment", (to) =>
    to
      .task("admit")
      .task("discharge")
      .route(async ({ route }) => route.toTask("admit"))
  )
  .connectTask("admit", (to) => to.condition("end"))
  .connectTask("discharge", (to) => to.condition("end"));

const deferredWorkflowV2 = Builder.workflow("deferredChoice")
  .startCondition("start")
  .task(
    "assessment",
    Builder.noOpTask.withSplitType("xor").withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task("admit", autoTask())
  .task("discharge", autoTask())
  .task("telemedicine", autoTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("assessment"))
  .connectTask("assessment", (to) =>
    to
      .task("admit")
      .task("discharge")
      .task("telemedicine")
      .route(async ({ route }) => route.toTask("admit"))
  )
  .connectTask("admit", (to) => to.condition("end"))
  .connectTask("discharge", (to) => to.condition("end"))
  .connectTask("telemedicine", (to) => to.condition("end"));

type NoOpPayload = {
  name: "tasquencer/no-op-work-item";
  payload?: unknown;
};

const branchDecisions = new Set<"admit" | "discharge">();

const admitMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return branchDecisions.has("admit")
    ? MigrationMode.fastForward
    : MigrationMode.continue;
});

const dischargeMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return branchDecisions.has("discharge")
    ? MigrationMode.fastForward
    : MigrationMode.continue;
});

const telemedicineMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.continue;
});

const assessmentMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const deferredMigration = migrate(deferredWorkflowV1, deferredWorkflowV2)
  .withTaskMigrators({
    "deferredChoice/assessment": assessmentMigrator,
    "deferredChoice/admit": admitMigrator,
    "deferredChoice/discharge": dischargeMigrator,
    "deferredChoice/telemedicine": telemedicineMigrator,
  })
  .build();

const deferredVersionManager = versionManagerFor("deferredChoice")
  .registerVersion("v1", deferredWorkflowV1)
  .registerVersion("v2", deferredWorkflowV2)
  .withMigration("v1->v2", deferredMigration)
  .build();

type TestClient = ReturnType<typeof setup>;

describe("deferred choice migrations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    branchDecisions.clear();
    internalVersionManagerRegistry.registerVersionManager(
      deferredVersionManager
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(
      deferredVersionManager
    );
  });

  it("preserves completed branch and keeps new options disabled", async ({
    expect,
  }) => {
    const t = setup();

    branchDecisions.add("admit");

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "deferredChoice",
        workflowVersionName: "v1",
      }
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: "v2",
    });

    expect(admitMigrator).toHaveBeenCalled();
    expect(dischargeMigrator).not.toHaveBeenCalled();
    expect(telemedicineMigrator).not.toHaveBeenCalled();

    const v2WorkflowDoc = await getRootWorkflowByVersion(
      t,
      "deferredChoice",
      "v2"
    );
    expect(v2WorkflowDoc).not.toBeNull();

    const tasks = indexByName(await getWorkflowTasks(t, v2WorkflowDoc!._id));
    expect(tasks.assessment?.state).toBe("completed");
    expect(tasks.admit?.state).toBe("completed");
    expect(tasks.discharge?.state).toBe("disabled");
    expect(tasks.telemedicine?.state).toBe("disabled");
  });
});

async function getRootWorkflowByVersion(
  t: TestClient,
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

async function getWorkflowTasks(
  t: TestClient,
  workflowId: Id<"tasquencerWorkflows">
) {
  return await t.run(async (ctx) => {
    const all = await ctx.db.query("tasquencerTasks").collect();
    return all.filter((task) => task.workflowId === workflowId);
  });
}

function indexByName<T extends { name: string }>(items: T[]) {
  return items.reduce<Record<string, T>>((acc, item) => {
    acc[item.name] = item;
    return acc;
  }, {});
}
