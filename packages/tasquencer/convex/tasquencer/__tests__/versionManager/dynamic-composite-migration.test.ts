import { setup, Builder } from "../setup.test";
import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { internal } from "../../../_generated/api";
import type { Doc, Id } from "../../../_generated/dataModel";
import { versionManagerFor } from "../../../tasquencer/versionManager";
import {
  migrate,
  MigrationMode,
  type DynamicCompositeTaskOnMigrate,
  type TaskOnMigrate,
} from "../../versionManager/migration";
import { internalVersionManagerRegistry } from "../../../testing/tasquencer";

const noOpTask = () =>
  Builder.noOpTask.withActivities({
    onEnabled: async ({ workItem }) => {
      await workItem.initialize();
    },
  });

// Define two child workflow types for the dynamic composite task
const childWorkflowAV1Builder = Builder.workflow("childWorkflowA")
  .startCondition("start")
  .task("stepA1", noOpTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("stepA1"))
  .connectTask("stepA1", (to) => to.condition("end"));

const childWorkflowAV2Builder = Builder.workflow("childWorkflowA")
  .startCondition("start")
  .task("stepA1", noOpTask())
  .task("stepA2", noOpTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("stepA1"))
  .connectTask("stepA1", (to) => to.task("stepA2"))
  .connectTask("stepA2", (to) => to.condition("end"));

const childWorkflowBV1Builder = Builder.workflow("childWorkflowB")
  .startCondition("start")
  .task("stepB1", noOpTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("stepB1"))
  .connectTask("stepB1", (to) => to.condition("end"));

const childWorkflowBV2Builder = Builder.workflow("childWorkflowB")
  .startCondition("start")
  .task("stepB1", noOpTask())
  .task("stepB2", noOpTask())
  .endCondition("end")
  .connectCondition("start", (to) => to.task("stepB1"))
  .connectTask("stepB1", (to) => to.task("stepB2"))
  .connectTask("stepB2", (to) => to.condition("end"));

// Root workflow with dynamic composite task
const rootWorkflowV1Builder = Builder.workflow("dynamicCompositeRoot")
  .startCondition("start")
  .task("intake", noOpTask())
  .dynamicCompositeTask(
    "processing",
    Builder.dynamicCompositeTask([
      childWorkflowAV1Builder,
      childWorkflowBV1Builder,
    ]).withActivities({
      onEnabled: async ({ workflow, executionMode }) => {
        if (executionMode === "fastForward") {
          return;
        }
        // Initialize childWorkflowA by default
        await workflow.initialize.childWorkflowA();
      },
    })
  )
  .task("finalize", noOpTask().withJoinType("and"))
  .endCondition("end")
  .connectCondition("start", (to) => to.task("intake"))
  .connectTask("intake", (to) => to.task("processing"))
  .connectTask("processing", (to) => to.task("finalize"))
  .connectTask("finalize", (to) => to.condition("end"));

const rootWorkflowV2Builder = Builder.workflow("dynamicCompositeRoot")
  .startCondition("start")
  .task("intake", noOpTask())
  .dynamicCompositeTask(
    "processing",
    Builder.dynamicCompositeTask([
      childWorkflowAV2Builder,
      childWorkflowBV2Builder,
    ]).withActivities({
      onEnabled: async ({ workflow, executionMode }) => {
        if (executionMode === "fastForward") {
          return;
        }
        // Initialize childWorkflowA by default
        await workflow.initialize.childWorkflowA();
      },
    })
  )
  .task("finalize", noOpTask().withJoinType("and"))
  .endCondition("end")
  .connectCondition("start", (to) => to.task("intake"))
  .connectTask("intake", (to) => to.task("processing"))
  .connectTask("processing", (to) => to.task("finalize"))
  .connectTask("finalize", (to) => to.condition("end"));

type NoOpPayload = {
  name: "tasquencer/no-op-work-item";
  payload?: unknown;
};

// Define migrators for tasks
const intakeMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const finalizeMigrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.continue;
});

// Define migrator for dynamic composite task
type DynamicWorkflowPayloads =
  | { name: "childWorkflowA"; payload?: unknown }
  | { name: "childWorkflowB"; payload?: unknown };

const processingMigrator: DynamicCompositeTaskOnMigrate<DynamicWorkflowPayloads> =
  vi.fn(async ({ workflow }) => {
    // Re-initialize the child workflow during migration
    await workflow.initialize.childWorkflowA();
    return MigrationMode.continue;
  });

// Migrators for child workflow tasks
const stepA1Migrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const stepB1Migrator: TaskOnMigrate<NoOpPayload> = vi.fn(async () => {
  return MigrationMode.fastForward;
});

const dynamicCompositeMigration = migrate(
  rootWorkflowV1Builder,
  rootWorkflowV2Builder
)
  .withTaskMigrators({
    "dynamicCompositeRoot/intake": intakeMigrator,
    "dynamicCompositeRoot/processing": processingMigrator,
    "dynamicCompositeRoot/finalize": finalizeMigrator,
    "childWorkflowA/stepA1": stepA1Migrator,
    "childWorkflowB/stepB1": stepB1Migrator,
  })
  .build();

const dynamicCompositeVersionManager = versionManagerFor("dynamicCompositeRoot")
  .registerVersion("v1", rootWorkflowV1Builder)
  .registerVersion("v2", rootWorkflowV2Builder)
  .withMigration("v1->v2", dynamicCompositeMigration)
  .build();

const childWorkflowAVersionManager = versionManagerFor("childWorkflowA")
  .registerVersion("v1", childWorkflowAV1Builder)
  .registerVersion("v2", childWorkflowAV2Builder)
  .build();

const childWorkflowBVersionManager = versionManagerFor("childWorkflowB")
  .registerVersion("v1", childWorkflowBV1Builder)
  .registerVersion("v2", childWorkflowBV2Builder)
  .build();

type TestClient = ReturnType<typeof setup>;

describe("dynamic composite task migrations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    internalVersionManagerRegistry.registerVersionManager(
      dynamicCompositeVersionManager
    );
    internalVersionManagerRegistry.registerVersionManager(
      childWorkflowAVersionManager
    );
    internalVersionManagerRegistry.registerVersionManager(
      childWorkflowBVersionManager
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    internalVersionManagerRegistry.unregisterVersionManager(
      dynamicCompositeVersionManager
    );
    internalVersionManagerRegistry.unregisterVersionManager(
      childWorkflowAVersionManager
    );
    internalVersionManagerRegistry.unregisterVersionManager(
      childWorkflowBVersionManager
    );
  });

  it("migrates dynamic composite tasks and initializes new child workflows", async ({
    expect,
  }) => {
    const t = setup();

    // Initialize v1 workflow
    const v1RootId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "dynamicCompositeRoot",
        workflowVersionName: "v1",
      }
    );

    // Complete intake task
    await completeTask(t, "dynamicCompositeRoot", "v1", v1RootId, "intake");

    // Get the child workflow that was initialized
    const processingChildren = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: v1RootId,
        taskName: "processing",
      }
    );
    expect(processingChildren.length).toBe(1);
    const childWorkflowId = processingChildren[0]._id;
    expect(processingChildren[0].name).toBe("childWorkflowA");

    // Complete the child workflow task
    await completeTask(
      t,
      "dynamicCompositeRoot",
      "v1",
      childWorkflowId,
      "stepA1"
    );

    // Migrate to v2
    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1RootId,
      nextVersionName: "v2",
    });

    // Verify migrators were called
    expect(intakeMigrator).toHaveBeenCalled();
    expect(processingMigrator).toHaveBeenCalled();
    expect(stepA1Migrator).toHaveBeenCalled();

    // Get the new v2 root workflow
    const v2Root = await getRootWorkflowByVersion(
      t,
      "dynamicCompositeRoot",
      "v2"
    );
    expect(v2Root).not.toBeNull();

    // Check root tasks
    const rootTasks = indexByName(await getWorkflowTasks(t, v2Root!._id));
    expect(rootTasks.intake?.state).toBe("completed");
    expect(rootTasks.finalize?.state).toBe("disabled");

    // Get the new child workflows
    const v2ProcessingChildren = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: v2Root!._id,
        taskName: "processing",
      }
    );
    expect(v2ProcessingChildren.length).toBe(1);
    const v2ChildWorkflowId = v2ProcessingChildren[0]._id;

    // Check child workflow tasks
    const childTasks = indexByName(
      await getWorkflowTasks(t, v2ChildWorkflowId)
    );
    expect(childTasks.stepA1?.state).toBe("completed");
    expect(childTasks.stepA2?.state).toBe("enabled");

    // Complete the new task added in v2
    await completeTask(
      t,
      "dynamicCompositeRoot",
      "v2",
      v2ChildWorkflowId,
      "stepA2"
    );

    // Verify the processing task completes
    const updatedRootTasks = indexByName(
      await getWorkflowTasks(t, v2Root!._id)
    );
    expect(updatedRootTasks.finalize?.state).toBe("enabled");
  });

  it("supports migrating with multiple child workflow types", async ({
    expect,
  }) => {
    const t = setup();

    // Create a custom version that initializes both workflow types
    const customRootWorkflowV1 = Builder.workflow("dynamicCompositeRoot")
      .startCondition("start")
      .task("intake", noOpTask())
      .dynamicCompositeTask(
        "processing",
        Builder.dynamicCompositeTask([
          childWorkflowAV1Builder,
          childWorkflowBV1Builder,
        ]).withActivities({
          onEnabled: async ({ workflow, executionMode }) => {
            if (executionMode === "fastForward") {
              return;
            }
            // Initialize both workflow types
            await workflow.initialize.childWorkflowA();
            await workflow.initialize.childWorkflowB();
          },
        })
      )
      .task("finalize", noOpTask().withJoinType("and"))
      .endCondition("end")
      .connectCondition("start", (to) => to.task("intake"))
      .connectTask("intake", (to) => to.task("processing"))
      .connectTask("processing", (to) => to.task("finalize"))
      .connectTask("finalize", (to) => to.condition("end"));

    const customRootWorkflowV2 = Builder.workflow("dynamicCompositeRoot")
      .startCondition("start")
      .task("intake", noOpTask())
      .dynamicCompositeTask(
        "processing",
        Builder.dynamicCompositeTask([
          childWorkflowAV2Builder,
          childWorkflowBV2Builder,
        ]).withActivities({
          onEnabled: async ({ workflow, executionMode }) => {
            if (executionMode === "fastForward") {
              return;
            }
            await workflow.initialize.childWorkflowA();
            await workflow.initialize.childWorkflowB();
          },
        })
      )
      .task("finalize", noOpTask().withJoinType("and"))
      .endCondition("end")
      .connectCondition("start", (to) => to.task("intake"))
      .connectTask("intake", (to) => to.task("processing"))
      .connectTask("processing", (to) => to.task("finalize"))
      .connectTask("finalize", (to) => to.condition("end"));

    // Reset mocks and create processing migrator that handles both types
    const multiProcessingMigrator: DynamicCompositeTaskOnMigrate<DynamicWorkflowPayloads> =
      vi.fn(async ({ workflow }) => {
        // Re-initialize both child workflows during migration
        await workflow.initialize.childWorkflowA();
        await workflow.initialize.childWorkflowB();
        return MigrationMode.continue;
      });

    const multiMigration = migrate(customRootWorkflowV1, customRootWorkflowV2)
      .withTaskMigrators({
        "dynamicCompositeRoot/intake": intakeMigrator,
        "dynamicCompositeRoot/processing": multiProcessingMigrator,
        "dynamicCompositeRoot/finalize": finalizeMigrator,
        "childWorkflowA/stepA1": stepA1Migrator,
        "childWorkflowB/stepB1": stepB1Migrator,
      })
      .build();

    const multiVersionManager = versionManagerFor("dynamicCompositeRoot")
      .registerVersion("v1", customRootWorkflowV1)
      .registerVersion("v2", customRootWorkflowV2)
      .withMigration("v1->v2", multiMigration)
      .build();

    // Unregister original and register custom version manager
    internalVersionManagerRegistry.unregisterVersionManager(
      dynamicCompositeVersionManager
    );
    internalVersionManagerRegistry.registerVersionManager(multiVersionManager);

    // Initialize v1 workflow
    const v1RootId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "dynamicCompositeRoot",
        workflowVersionName: "v1",
      }
    );

    // Complete intake
    await completeTask(t, "dynamicCompositeRoot", "v1", v1RootId, "intake");

    // Get both child workflows
    const processingChildren = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: v1RootId,
        taskName: "processing",
      }
    );
    expect(processingChildren.length).toBe(2);

    // Complete tasks in both child workflows
    const childWorkflowA = processingChildren.find(
      (c) => c.name === "childWorkflowA"
    )!;
    const childWorkflowB = processingChildren.find(
      (c) => c.name === "childWorkflowB"
    )!;

    await completeTask(
      t,
      "dynamicCompositeRoot",
      "v1",
      childWorkflowA._id,
      "stepA1"
    );
    await completeTask(
      t,
      "dynamicCompositeRoot",
      "v1",
      childWorkflowB._id,
      "stepB1"
    );

    // Migrate to v2
    await t.action(internal.testing.tasquencer.migrate, {
      workflowId: v1RootId,
      nextVersionName: "v2",
    });

    // Verify migrators were called
    expect(multiProcessingMigrator).toHaveBeenCalled();
    expect(stepA1Migrator).toHaveBeenCalled();
    expect(stepB1Migrator).toHaveBeenCalled();

    // Get the new v2 root workflow
    const v2Root = await getRootWorkflowByVersion(
      t,
      "dynamicCompositeRoot",
      "v2"
    );
    expect(v2Root).not.toBeNull();

    // Get v2 child workflows
    const v2ProcessingChildren = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: v2Root!._id,
        taskName: "processing",
      }
    );
    expect(v2ProcessingChildren.length).toBe(2);

    // Verify both have the new tasks enabled
    const v2ChildA = v2ProcessingChildren.find(
      (c) => c.name === "childWorkflowA"
    )!;
    const v2ChildB = v2ProcessingChildren.find(
      (c) => c.name === "childWorkflowB"
    )!;

    const childATasks = indexByName(await getWorkflowTasks(t, v2ChildA._id));
    const childBTasks = indexByName(await getWorkflowTasks(t, v2ChildB._id));

    expect(childATasks.stepA1?.state).toBe("completed");
    expect(childATasks.stepA2?.state).toBe("enabled");
    expect(childBTasks.stepB1?.state).toBe("completed");
    expect(childBTasks.stepB2?.state).toBe("enabled");

    // Restore original version manager
    internalVersionManagerRegistry.unregisterVersionManager(multiVersionManager);
    internalVersionManagerRegistry.registerVersionManager(
      dynamicCompositeVersionManager
    );
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
