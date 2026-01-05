import { setup, Builder } from "../setup.test";
import { it, vi, beforeEach, afterEach, describe } from "vitest";
import { internal } from "../../../_generated/api";
import type { Doc, Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import schema from "../../../schema";
import { versionManagerFor } from "../../../tasquencer/versionManager";
import {
  migrate,
  MigrationMode,
  type MigrationInitializer,
  type MigrationFinalizer,
  type TaskOnMigrate,
} from "../../versionManager/migration";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";
import type { AuditCallbackInfo } from "../../audit/integration";

const workflowV1 = Builder.workflow("simple")
  .startCondition("start")
  .task("A", Builder.noOpTask)
  .task("B", Builder.noOpTask)
  .endCondition("end")
  .connectCondition("start", (to) => to.task("A"))
  .connectTask("A", (to) => to.task("B"))
  .connectTask("B", (to) => to.condition("end"));

const workflowV2 = Builder.workflow("simple")
  .startCondition("start")
  .task("A", Builder.noOpTask)
  .task("B", Builder.noOpTask)
  .task("C", Builder.noOpTask)
  .endCondition("end")
  .connectCondition("start", (to) => to.task("A"))
  .connectTask("A", (to) => to.task("B"))
  .connectTask("B", (to) => to.task("C"))
  .connectTask("C", (to) => to.condition("end"));

const onMigrateA = vi.fn(async (_props: unknown) => MigrationMode.fastForward);
const onMigrateB = vi.fn(async (_props: unknown) => MigrationMode.continue);
const onMigrateC = vi.fn(async (_props: unknown) => MigrationMode.continue);
const migrationInitializer = vi.fn<MigrationInitializer>(async (_props) => {});
const migrationFinalizer = vi.fn<MigrationFinalizer>(async (_props) => {});

const migrationV1ToV2 = migrate(workflowV1, workflowV2)
  .withInitializer(migrationInitializer)
  .withFinalizer(migrationFinalizer)
  .withTaskMigrators({
    "simple/A": async (props) => onMigrateA(props),
    "simple/B": async (props) => onMigrateB(props),
    "simple/C": async (props) => onMigrateC(props),
  })
  .build();

const simpleVersionManager = versionManagerFor("simple")
  .registerVersion("v1", workflowV1)
  .registerVersion("v2", workflowV2)
  .withMigration("v1->v2", migrationV1ToV2)
  .build();

type TestClient = ReturnType<typeof setup>;

describe("simple migrations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    internalVersionManagerRegistry.registerVersionManager(simpleVersionManager);
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(
      simpleVersionManager
    );
  });

  it("fast forwards completed tasks and leaves new work enabled", async ({
    expect,
  }) => {
    const t = setup();

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simple",
        workflowVersionName: "v1",
      }
    );

    const enabledBeforeMigration = await t.query(
      internal.testing.tasquencer.getWorkflowTasksByState,
      {
        workflowId: v1WorkflowId,
        state: "enabled",
      }
    );
    expect(enabledBeforeMigration.map((task) => task.name)).toEqual(["A"]);

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: "v2",
    });

    expect(onMigrateA).toHaveBeenCalledTimes(1);
    expect(onMigrateB).toHaveBeenCalledTimes(1);
    expect(onMigrateC).not.toHaveBeenCalled();

    const v2Workflow = await getRootWorkflowByVersion(t, "simple", "v2");
    expect(v2Workflow).not.toBeNull();
    expect(v2Workflow?.executionMode).toBe("fastForward");

    const tasks = indexByName(await getWorkflowTasks(t, v2Workflow!._id));
    expect(tasks.A?.state).toBe("completed");
    expect(tasks.B?.state).toBe("enabled");
    expect(tasks.C?.state).toBe("disabled");

    const workItemsForB = await getTaskWorkItems(t, v2Workflow!._id, "B");
    expect(workItemsForB).toHaveLength(0);

    const originalWorkflow = await t.run((ctx) => ctx.db.get(v1WorkflowId));
    expect(originalWorkflow?.state).toBe("canceled");
  });

  it("runs the migration initializer when fast forwarding a workflow", async ({
    expect,
  }) => {
    const t = setup();

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simple",
        workflowVersionName: "v1",
      }
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: "v2",
    });

    const v2Workflow = await getRootWorkflowByVersion(t, "simple", "v2");
    expect(v2Workflow).not.toBeNull();

    expect(migrationInitializer).toHaveBeenCalledTimes(1);
    const callArgs = migrationInitializer.mock
      .calls[0]?.[0] as Parameters<MigrationInitializer>[0];
    expect(callArgs.workflow.id).toEqual(v2Workflow!._id);
    expect(callArgs.migratingFromWorkflow.id).toEqual(v1WorkflowId);
    expect(callArgs.isInternalMutation).toBe(true);
  });

  it("continues execution after migration in the target version", async ({
    expect,
  }) => {
    const t = setup();

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simple",
        workflowVersionName: "v1",
      }
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: "v2",
    });

    const v2Workflow = await getRootWorkflowByVersion(t, "simple", "v2");
    expect(v2Workflow).not.toBeNull();
    const v2WorkflowId = v2Workflow!._id;

    const workItemsForB = await getTaskWorkItems(t, v2WorkflowId, "B");
    expect(workItemsForB).toHaveLength(0);

    const workItemBId = await t.mutation(
      internal.testing.tasquencer.initializeWorkItem,
      {
        workflowName: "simple",
        workflowVersionName: "v2",
        target: {
          path: ["simple", "B", "tasquencer/no-op-work-item"],
          parentWorkflowId: v2WorkflowId,
          parentTaskName: "B",
        },
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemBId,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemBId,
    });

    const tasksAfterB = indexByName(await getWorkflowTasks(t, v2WorkflowId));
    expect(tasksAfterB.B?.state).toBe("completed");
    expect(tasksAfterB.C?.state).toBe("enabled");
    expect(onMigrateC).toHaveBeenCalledTimes(1);

    const workItemsForCBefore = await getTaskWorkItems(t, v2WorkflowId, "C");
    expect(workItemsForCBefore).toHaveLength(0);

    const workItemCId = await t.mutation(
      internal.testing.tasquencer.initializeWorkItem,
      {
        workflowName: "simple",
        workflowVersionName: "v2",
        target: {
          path: ["simple", "C", "tasquencer/no-op-work-item"],
          parentWorkflowId: v2WorkflowId,
          parentTaskName: "C",
        },
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemCId,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemCId,
    });

    const completedWorkflow = await t.run((ctx) => ctx.db.get(v2WorkflowId));
    expect(completedWorkflow?.state).toBe("completed");
  });

  it("invokes the migration finalizer after a fast-forwarded workflow completes", async ({
    expect,
  }) => {
    const t = setup();

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simple",
        workflowVersionName: "v1",
      }
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: "v2",
    });

    const v2Workflow = await getRootWorkflowByVersion(t, "simple", "v2");
    expect(v2Workflow).not.toBeNull();
    const v2WorkflowId = v2Workflow!._id;

    const workItemBId = await t.mutation(
      internal.testing.tasquencer.initializeWorkItem,
      {
        workflowName: "simple",
        workflowVersionName: "v2",
        target: {
          path: ["simple", "B", "tasquencer/no-op-work-item"],
          parentWorkflowId: v2WorkflowId,
          parentTaskName: "B",
        },
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemBId,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemBId,
    });

    const workItemCId = await t.mutation(
      internal.testing.tasquencer.initializeWorkItem,
      {
        workflowName: "simple",
        workflowVersionName: "v2",
        target: {
          path: ["simple", "C", "tasquencer/no-op-work-item"],
          parentWorkflowId: v2WorkflowId,
          parentTaskName: "C",
        },
      }
    );

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemCId,
    });
    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "simple",
      workflowVersionName: "v2",
      workItemId: workItemCId,
    });

    const completedWorkflow = await t.run((ctx) => ctx.db.get(v2WorkflowId));
    expect(completedWorkflow?.state).toBe("completed");

    expect(migrationFinalizer).toHaveBeenCalledTimes(1);
    const callArgs = migrationFinalizer.mock
      .calls[0]?.[0] as Parameters<MigrationFinalizer>[0];
    expect(callArgs.workflow.id).toEqual(v2WorkflowId);
    expect(callArgs.migratingFromWorkflow.id).toEqual(v1WorkflowId);
    expect(callArgs.result.state).toBe("completed");
  });

  it("records fast-forwarded task start events for the new generation", async ({
    expect,
  }) => {
    const t = setup();

    const v1WorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "simple",
        workflowVersionName: "v1",
      }
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1WorkflowId,
      nextVersionName: "v2",
    });

    const v2Workflow = await getRootWorkflowByVersion(t, "simple", "v2");
    expect(v2Workflow).not.toBeNull();
    const v2WorkflowId = v2Workflow!._id;

    const taskLogs = await t.run(async (ctx) => {
      return await ctx.db
        .query("tasquencerTasksStateLog")
        .withIndex("by_workflow_id_name_and_generation", (q) =>
          q.eq("workflowId", v2WorkflowId).eq("name", "A")
        )
        .collect();
    });

    const startedGenerations = taskLogs
      .filter((log) => log.state === "started")
      .map((log) => log.generation);
    expect(startedGenerations).toEqual([1]);
  });
});

type StatefulMigrationDecisions = {
  "v1->v2": Set<string>;
  "v2->v3": Set<string>;
};

function createStatefulVersionManager(workflowName: string) {
  const decisions: StatefulMigrationDecisions = {
    "v1->v2": new Set(),
    "v2->v3": new Set(),
  };

  const invocationLog: Array<{
    stage: keyof StatefulMigrationDecisions;
    task: string;
    mode: "continue" | "fastForward";
  }> = [];

  const workflowV1 = Builder.workflow(workflowName)
    .startCondition("start")
    .task("collectDetails", Builder.noOpTask)
    .task("assignOwner", Builder.noOpTask)
    .endCondition("end")
    .connectCondition("start", (to) => to.task("collectDetails"))
    .connectTask("collectDetails", (to) => to.task("assignOwner"))
    .connectTask("assignOwner", (to) => to.condition("end"));

  const workflowV2 = Builder.workflow(workflowName)
    .startCondition("start")
    .task("collectDetails", Builder.noOpTask)
    .task("assignOwner", Builder.noOpTask)
    .task("prepareQuote", Builder.noOpTask)
    .endCondition("end")
    .connectCondition("start", (to) => to.task("collectDetails"))
    .connectTask("collectDetails", (to) => to.task("assignOwner"))
    .connectTask("assignOwner", (to) => to.task("prepareQuote"))
    .connectTask("prepareQuote", (to) => to.condition("end"));

  const workflowV3 = Builder.workflow(workflowName)
    .startCondition("start")
    .task("collectDetails", Builder.noOpTask)
    .task("assignOwner", Builder.noOpTask)
    .task("prepareQuote", Builder.noOpTask)
    .task("sendInvoice", Builder.noOpTask)
    .endCondition("end")
    .connectCondition("start", (to) => to.task("collectDetails"))
    .connectTask("collectDetails", (to) => to.task("assignOwner"))
    .connectTask("assignOwner", (to) => to.task("prepareQuote"))
    .connectTask("prepareQuote", (to) => to.task("sendInvoice"))
    .connectTask("sendInvoice", (to) => to.condition("end"));

  const decide = (
    stage: keyof StatefulMigrationDecisions,
    taskName: string
  ) => {
    const mode = decisions[stage].has(taskName)
      ? MigrationMode.fastForward
      : MigrationMode.continue;
    invocationLog.push({ stage, task: taskName, mode });
    return mode;
  };

  const migrationV1ToV2 = migrate(workflowV1, workflowV2)
    .withTaskMigrators({
      [`${workflowName}/collectDetails`]: async () =>
        decide("v1->v2", "collectDetails"),
      [`${workflowName}/assignOwner`]: async () =>
        decide("v1->v2", "assignOwner"),
      [`${workflowName}/prepareQuote`]: async () =>
        decide("v1->v2", "prepareQuote"),
    })
    .build();

  const migrationV2ToV3 = migrate(workflowV2, workflowV3)
    .withTaskMigrators({
      [`${workflowName}/collectDetails`]: async () =>
        decide("v2->v3", "collectDetails"),
      [`${workflowName}/assignOwner`]: async () =>
        decide("v2->v3", "assignOwner"),
      [`${workflowName}/prepareQuote`]: async () =>
        decide("v2->v3", "prepareQuote"),
      [`${workflowName}/sendInvoice`]: async () =>
        decide("v2->v3", "sendInvoice"),
    })
    .build();

  const versionManager = versionManagerFor(workflowName)
    .registerVersion("v1", workflowV1)
    .registerVersion("v2", workflowV2)
    .registerVersion("v3", workflowV3)
    .withMigration("v1->v2", migrationV1ToV2)
    .withMigration("v2->v3", migrationV2ToV3)
    .build();

  return {
    versionManager,
    decisions,
    invocationLog,
    migrations: {
      "v1->v2": migrationV1ToV2,
      "v2->v3": migrationV2ToV3,
    },
  };
}

describe("stateful migration decisions", () => {
  type StatefulMigrationSetup = ReturnType<typeof createStatefulVersionManager>;

  const createTaskMigratorContext = (
    workflowName: string,
    taskName: string
  ): Parameters<TaskOnMigrate<unknown>>[0] => ({
    mutationCtx: {} as MutationCtx,
    isInternalMutation: true,
    migratingFromWorkflow: {
      name: workflowName,
      id: "wf" as Id<"tasquencerWorkflows">,
    },
    parent: {
      workflow: {
        name: workflowName,
        id: "wf" as Id<"tasquencerWorkflows">,
      },
    },
    task: {
      name: taskName,
      generation: 0,
      path: [],
    },
    workItem: {
      initialize: vi.fn(async () => "wi" as Id<"tasquencerWorkItems">),
    },
    registerScheduled: vi.fn(),
    audit: {} as AuditCallbackInfo,
  });

  it("applies fast-forward when state marks tasks as complete", async ({
    expect,
  }) => {
    const workflowName = "statefulDynamic";
    const setup: StatefulMigrationSetup =
      createStatefulVersionManager(workflowName);
    const { decisions, invocationLog, migrations } = setup;

    decisions["v1->v2"].add("collectDetails");
    decisions["v2->v3"].add("prepareQuote");
    decisions["v2->v3"].add("sendInvoice");

    const collectMode = await migrations["v1->v2"].taskMigrators[
      `${workflowName}/collectDetails`
    ]!(createTaskMigratorContext(workflowName, "collectDetails"));
    const assignMode = await migrations["v1->v2"].taskMigrators[
      `${workflowName}/assignOwner`
    ]!(createTaskMigratorContext(workflowName, "assignOwner"));
    const prepareMode = await migrations["v2->v3"].taskMigrators[
      `${workflowName}/prepareQuote`
    ]!(createTaskMigratorContext(workflowName, "prepareQuote"));
    const sendMode = await migrations["v2->v3"].taskMigrators[
      `${workflowName}/sendInvoice`
    ]!(createTaskMigratorContext(workflowName, "sendInvoice"));

    expect(collectMode).toBe(MigrationMode.fastForward);
    expect(assignMode).toBe(MigrationMode.continue);
    expect(prepareMode).toBe(MigrationMode.fastForward);
    expect(sendMode).toBe(MigrationMode.fastForward);

    expect(invocationLog).toEqual([
      { stage: "v1->v2", task: "collectDetails", mode: "fastForward" },
      { stage: "v1->v2", task: "assignOwner", mode: "continue" },
      { stage: "v2->v3", task: "prepareQuote", mode: "fastForward" },
      { stage: "v2->v3", task: "sendInvoice", mode: "fastForward" },
    ]);
  });

  it("updates decisions when state changes between migrations", async ({
    expect,
  }) => {
    const workflowName = "statefulDynamic";
    const setup: StatefulMigrationSetup =
      createStatefulVersionManager(workflowName);
    const { decisions, invocationLog, migrations } = setup;

    decisions["v1->v2"].add("collectDetails");

    const initialCollectMode = await migrations["v1->v2"].taskMigrators[
      `${workflowName}/collectDetails`
    ]!(createTaskMigratorContext(workflowName, "collectDetails"));
    const initialPrepareMode = await migrations["v2->v3"].taskMigrators[
      `${workflowName}/prepareQuote`
    ]!(createTaskMigratorContext(workflowName, "prepareQuote"));

    expect(initialCollectMode).toBe(MigrationMode.fastForward);
    expect(initialPrepareMode).toBe(MigrationMode.continue);

    decisions["v2->v3"].add("prepareQuote");

    const updatedPrepareMode = await migrations["v2->v3"].taskMigrators[
      `${workflowName}/prepareQuote`
    ]!(createTaskMigratorContext(workflowName, "prepareQuote"));

    expect(updatedPrepareMode).toBe(MigrationMode.fastForward);

    const v2Entries = invocationLog.filter((entry) => entry.stage === "v2->v3");
    expect(v2Entries[v2Entries.length - 1]).toEqual({
      stage: "v2->v3",
      task: "prepareQuote",
      mode: "fastForward",
    });
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

async function getTaskWorkItems(
  t: TestClient,
  workflowId: Id<"tasquencerWorkflows">,
  taskName: string
) {
  return await t.run(async (ctx) => {
    const all = await ctx.db.query("tasquencerWorkItems").collect();
    return all
      .filter(
        (workItem) =>
          workItem.parent.workflowId === workflowId &&
          workItem.parent.taskName === taskName
      )
      .sort((a, b) => b.parent.taskGeneration - a.parent.taskGeneration);
  });
}

function indexByName<T extends { name: string }>(items: T[]) {
  return items.reduce<Record<string, T>>((acc, item) => {
    acc[item.name] = item;
    return acc;
  }, {});
}
