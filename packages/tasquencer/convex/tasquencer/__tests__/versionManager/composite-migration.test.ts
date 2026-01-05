import { setup, Builder } from "../setup.test";
import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { internal } from "../../../_generated/api";
import type { Doc, Id } from "../../../_generated/dataModel";
import schema from "../../../schema";
import { versionManagerFor } from "../../../tasquencer/versionManager";
import {
  migrate,
  MigrationMode,
  type CompositeTaskOnMigrate,
  type TaskOnMigrate,
} from "../../versionManager/migration";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";

const noOpTask = () =>
  Builder.noOpTask.withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize();
    },
  });

const diagnosticsV1Builder = Builder.workflow("compositeDiagnostics")
  .startCondition("start")
  .task("triage", noOpTask())
  .task("assignDoctor", noOpTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("triage"))
  .connectTask("triage", (to) => to.task("assignDoctor"))
  .connectTask("assignDoctor", (to) => to.condition("end"));

const diagnosticsV2Builder = Builder.workflow("compositeDiagnostics")
  .startCondition("start")
  .task("triage", noOpTask())
  .task("assignDoctor", noOpTask())
  .task("labReview", noOpTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("triage"))
  .connectTask("triage", (to) => to.task("assignDoctor"))
  .connectTask("assignDoctor", (to) => to.task("labReview"))
  .connectTask("labReview", (to) => to.condition("end"));

const rootWorkflowV1Builder = Builder.workflow("compositeRoot")
  .startCondition("start")
  .task("intake", noOpTask())
  .compositeTask(
    "diagnostics",
    Builder.compositeTask(diagnosticsV1Builder).withActivities({
      onEnabled: async ({ workflow, executionMode }) => {
        if (executionMode === "fastForward") {
          return;
        }
        await workflow.initialize();
      },
    })
  )
  .task("discharge", noOpTask().withJoinType("and"))
  .endCondition("end")
  .connectCondition("start", (to) => to.task("intake"))
  .connectTask("intake", (to) => to.task("diagnostics"))
  .connectTask("diagnostics", (to) => to.task("discharge"))
  .connectTask("discharge", (to) => to.condition("end"));

const rootWorkflowV2Builder = Builder.workflow("compositeRoot")
  .startCondition("start")
  .task("intake", noOpTask())
  .compositeTask(
    "diagnostics",
    Builder.compositeTask(diagnosticsV2Builder).withActivities({
      onEnabled: async ({ workflow, executionMode }) => {
        if (executionMode === "fastForward") {
          return;
        }
        await workflow.initialize();
      },
    })
  )
  .task("discharge", noOpTask().withJoinType("and"))
  .endCondition("end")
  .connectCondition("start", (to) => to.task("intake"))
  .connectTask("intake", (to) => to.task("diagnostics"))
  .connectTask("diagnostics", (to) => to.task("discharge"))
  .connectTask("discharge", (to) => to.condition("end"));

type DiagnosticsWorkflowPayload = {
  name: "compositeDiagnostics";
  payload?: unknown;
};

type NoOpPayload = {
  name: "tasquencer/no-op-work-item";
  payload?: unknown;
};

const diagnosticsMigrator: CompositeTaskOnMigrate<DiagnosticsWorkflowPayload> =
  vi.fn(async ({ workflow }) => {
    await workflow.initialize();
    return MigrationMode.continue;
  });

const triageMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const assignDoctorMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const intakeMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const dischargeMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.continue;
});

const compositeMigration = migrate(rootWorkflowV1Builder, rootWorkflowV2Builder)
  .withTaskMigrators({
    "compositeRoot/intake": intakeMigrator,
    "compositeRoot/diagnostics": diagnosticsMigrator,
    "compositeRoot/discharge": dischargeMigrator,
    "compositeDiagnostics/triage": triageMigrator,
    "compositeDiagnostics/assignDoctor": assignDoctorMigrator,
  })
  .build();

const compositeVersionManager = versionManagerFor("compositeRoot")
  .registerVersion("v1", rootWorkflowV1Builder)
  .registerVersion("v2", rootWorkflowV2Builder)
  .withMigration("v1->v2", compositeMigration)
  .build();

const diagnosticsVersionManager = versionManagerFor("compositeDiagnostics")
  .registerVersion("v1", diagnosticsV1Builder)
  .registerVersion("v2", diagnosticsV2Builder)
  .build();

type TestClient = ReturnType<typeof setup>;

describe("composite task migrations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    internalVersionManagerRegistry.registerVersionManager(
      compositeVersionManager
    );
    internalVersionManagerRegistry.registerVersionManager(
      diagnosticsVersionManager
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(
      compositeVersionManager
    );
    internalVersionManagerRegistry.unregisterVersionManager(
      diagnosticsVersionManager
    );
  });

  it("fast forwards completed composite tasks and initializes new child tasks", async ({
    expect,
  }) => {
    const t = setup();

    const v1RootId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "compositeRoot",
        workflowVersionName: "v1",
      }
    );

    await completeTask(t, "compositeRoot", "v1", v1RootId, "intake");

    const diagnosticsChildren = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: v1RootId,
        taskName: "diagnostics",
      }
    );
    expect(diagnosticsChildren.length).toBe(1);
    const childWorkflowId = diagnosticsChildren[0]._id;

    await completeTask(t, "compositeRoot", "v1", childWorkflowId, "triage");
    await completeTask(
      t,
      "compositeRoot",
      "v1",
      childWorkflowId,
      "assignDoctor"
    );

    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1RootId,
      nextVersionName: "v2",
    });

    expect(intakeMigrator).toHaveBeenCalled();
    expect(diagnosticsMigrator).toHaveBeenCalled();
    expect(triageMigrator).toHaveBeenCalled();
    expect(assignDoctorMigrator).toHaveBeenCalled();

    const v2Root = await getRootWorkflowByVersion(t, "compositeRoot", "v2");
    expect(v2Root).not.toBeNull();

    const rootTasks = indexByName(await getWorkflowTasks(t, v2Root!._id));
    expect(rootTasks.intake?.state).toBe("completed");
    expect(rootTasks.discharge?.state).toBe("disabled");

    const v2Diagnostics = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: v2Root!._id,
        taskName: "diagnostics",
      }
    );
    expect(v2Diagnostics.length).toBe(1);
    const v2ChildWorkflowId = v2Diagnostics[0]._id;

    const childTasks = indexByName(
      await getWorkflowTasks(t, v2ChildWorkflowId)
    );
    expect(childTasks.triage?.state).toBe("completed");
    expect(childTasks.assignDoctor?.state).toBe("completed");
    expect(childTasks.labReview?.state).toBe("enabled");

    await completeTask(
      t,
      "compositeRoot",
      "v2",
      v2ChildWorkflowId,
      "labReview"
    );

    const updatedChildTasks = indexByName(
      await getWorkflowTasks(t, v2ChildWorkflowId)
    );
    expect(updatedChildTasks.labReview?.state).toBe("completed");

    const updatedRootTasks = indexByName(
      await getWorkflowTasks(t, v2Root!._id)
    );
    expect(updatedRootTasks.discharge?.state).toBe("enabled");
  });
});

async function completeTask(
  t: TestClient,
  workflowName: string,
  workflowVersionName: string,
  workflowId: Id<"tasquencerWorkflows">,
  taskName: string
) {
  const workItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId,
      taskName,
    }
  );
  expect(workItems.length).toBe(1);
  const workItemId = workItems[0]._id;

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName,
    workItemId,
    workflowVersionName,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName,
    workItemId,
    workflowVersionName,
  });
}

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
