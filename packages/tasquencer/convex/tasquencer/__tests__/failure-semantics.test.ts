import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";

import { internalVersionManagerRegistry } from "../../testing/tasquencer";
import { waitForFlush } from "./audit/helpers.test";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("failureSemantics")
  .startCondition("start")
  .task(
    "t1",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
        await workItem.initialize();
      },
    })
  )
  .condition("c1")
  .task(
    "t2",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("t1"))
  .connectTask("t1", (to) => to.condition("c1"))
  .connectCondition("c1", (to) => to.task("t2"))
  .connectTask("t2", (to) => to.condition("end"));

const failureSemanticsVersionManager = versionManagerFor("failureSemantics")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowDefinition)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(
    failureSemanticsVersionManager
  );
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    failureSemanticsVersionManager
  );
});

it("demonstrates failure propagation - work item fails → task fails → workflow fails → other tasks canceled", async ({
  expect,
}) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "failureSemantics",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  expect(id).toBeDefined();

  await waitForFlush(t);

  // Get the work items from t1 (t2 is not enabled yet)
  const t1WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(t1WorkItems.length).toBe(2);
  expect(t1WorkItems[0].state).toBe("initialized");
  expect(t1WorkItems[1].state).toBe("initialized");

  // Start both work items in t1
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureSemantics",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureSemantics",
    workItemId: t1WorkItems[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  // Verify t1 is started, t2 is still disabled
  const tasksBeforeFail = await t.query(
    internal.testing.tasquencer.getWorkflowTasks,
    {
      workflowId: id,
    }
  );
  const t1BeforeFail = tasksBeforeFail.find((t) => t.name === "t1");
  const t2BeforeFail = tasksBeforeFail.find((t) => t.name === "t2");
  expect(t1BeforeFail?.state).toBe("started");
  expect(t2BeforeFail?.state).toBe("disabled");

  // Fail one work item in t1
  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "failureSemantics",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  // Verify the originating work item is failed
  const t1WorkItemsAfterFail = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  const failedWorkItem = t1WorkItemsAfterFail.find(
    (wi) => wi._id === t1WorkItems[0]._id
  );
  const otherT1WorkItem = t1WorkItemsAfterFail.find(
    (wi) => wi._id === t1WorkItems[1]._id
  );
  expect(failedWorkItem?.state).toBe("failed");

  // Verify the other work item in t1 is canceled (task failed, so it cancels its work items)
  expect(otherT1WorkItem?.state).toBe("canceled");

  // Verify t1 task is failed (policy returned 'fail')
  const tasksAfterFail = await t.query(
    internal.testing.tasquencer.getWorkflowTasks,
    {
      workflowId: id,
    }
  );
  const t1AfterFail = tasksAfterFail.find((t) => t.name === "t1");
  expect(t1AfterFail?.state).toBe("failed");

  // Verify workflow is failed
  const workflowAfterFail = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowAfterFail.state).toBe("failed");

  // Verify t2 task is still disabled (was never enabled, so workflow failure disabled it)
  const t2AfterFail = tasksAfterFail.find((t) => t.name === "t2");
  expect(t2AfterFail?.state).toBe("disabled");
});

it("demonstrates proper state tracking - failed vs canceled entities", async ({
  expect,
}) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "failureSemantics",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  await waitForFlush(t);

  // Get work items from t1
  const t1WorkItems = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  expect(t1WorkItems.length).toBe(2);
  expect(t1WorkItems[0].state).toBe("initialized");
  expect(t1WorkItems[1].state).toBe("initialized");

  // Start all work items in t1
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureSemantics",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });
  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "failureSemantics",
    workItemId: t1WorkItems[1]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  // Fail one work item in t1
  await t.mutation(internal.testing.tasquencer.failWorkItem, {
    workflowName: "failureSemantics",
    workItemId: t1WorkItems[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await waitForFlush(t);

  // Verify state tracking correctness:
  // 1. Originating work item: failed
  const t1WorkItemsAfter = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "t1",
    }
  );
  const originatingWorkItem = t1WorkItemsAfter.find(
    (wi) => wi._id === t1WorkItems[0]._id
  );
  expect(originatingWorkItem?.state).toBe("failed");

  // 2. Other work item in same task: canceled (task failed, canceled its work items)
  const siblingWorkItem = t1WorkItemsAfter.find(
    (wi) => wi._id === t1WorkItems[1]._id
  );
  expect(siblingWorkItem?.state).toBe("canceled");

  // 3. Originating task: failed
  const tasks = await t.query(internal.testing.tasquencer.getWorkflowTasks, {
    workflowId: id,
  });
  const originatingTask = tasks.find((t) => t.name === "t1");
  expect(originatingTask?.state).toBe("failed");

  // 4. Workflow: failed
  const wf = await t.query(internal.testing.tasquencer.getWorkflowById, {
    workflowId: id,
  });
  expect(wf.state).toBe("failed");

  // 5. Task t2: disabled (was never enabled since t1 failed before completing)
  const t2Task = tasks.find((t) => t.name === "t2");
  expect(t2Task?.state).toBe("disabled");
});

it("complex nested failure - parallel composite tasks with sub-workflow failure", async ({
  expect,
}) => {
  // Create two sub-workflows for the composite tasks
  const subWorkflow1Definition = Builder.workflow("subWorkflow1")
    .startCondition("start")
    .task(
      "sw1_task1",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
          await workItem.initialize();
        },
      })
    )
    .endCondition("end")
    .connectCondition("start", (to) => to.task("sw1_task1"))
    .connectTask("sw1_task1", (to) => to.condition("end"));

  const subWorkflow2Definition = Builder.workflow("subWorkflow2")
    .startCondition("start")
    .task(
      "sw2_task1",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .endCondition("end")
    .connectCondition("start", (to) => to.task("sw2_task1"))
    .connectTask("sw2_task1", (to) => to.condition("end"));

  // Create main workflow with parallel composite tasks
  // Structure: start → t1 → (ct2, ct3) → end
  // ct2 and ct3 are enabled in parallel after t1 completes
  const mainWorkflowDefinition = Builder.workflow("complexFailureTest")
    .startCondition("start")
    .task(
      "t1",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .compositeTask(
      "ct2",
      Builder.compositeTask(subWorkflow1Definition).withActivities({
        onEnabled: async ({ workflow }) => {
          await workflow.initialize();
        },
      })
    )
    .compositeTask(
      "ct3",
      Builder.compositeTask(subWorkflow2Definition).withActivities({
        onEnabled: async ({ workflow }) => {
          await workflow.initialize();
        },
      })
    )
    .endCondition("end")
    .connectCondition("start", (to) => to.task("t1"))
    .connectTask("t1", (to) => to.task("ct2").task("ct3"))
    .connectTask("ct2", (to) => to.condition("end"))
    .connectTask("ct3", (to) => to.condition("end"));

  const subWorkflow1VersionManager = versionManagerFor("subWorkflow1")
    .registerVersion(WORKFLOW_VERSION_NAME, subWorkflow1Definition)
    .build();
  const subWorkflow2VersionManager = versionManagerFor("subWorkflow2")
    .registerVersion(WORKFLOW_VERSION_NAME, subWorkflow2Definition)
    .build();
  const complexFailureVersionManager = versionManagerFor("complexFailureTest")
    .registerVersion(WORKFLOW_VERSION_NAME, mainWorkflowDefinition)
    .build();

  internalVersionManagerRegistry.registerVersionManager(
    subWorkflow1VersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    subWorkflow2VersionManager
  );
  internalVersionManagerRegistry.registerVersionManager(
    complexFailureVersionManager
  );

  const t = setup();

  try {
    // Initialize the main workflow
    const mainWorkflowId = await t.mutation(
      internal.testing.tasquencer.initializeRootWorkflow,
      {
        workflowName: "complexFailureTest",
        workflowVersionName: WORKFLOW_VERSION_NAME,
      }
    );

    await waitForFlush(t);

    // Start t1's work item to enable the composite tasks
    const t1WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: mainWorkflowId,
        taskName: "t1",
      }
    );
    expect(t1WorkItems.length).toBe(1);

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "complexFailureTest",
      workItemId: t1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    await t.mutation(internal.testing.tasquencer.completeWorkItem, {
      workflowName: "complexFailureTest",
      workItemId: t1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Verify t1 is completed
    const tasksAfterT1 = await t.query(
      internal.testing.tasquencer.getWorkflowTasks,
      {
        workflowId: mainWorkflowId,
      }
    );
    const t1Task = tasksAfterT1.find((task) => task.name === "t1");
    expect(t1Task?.state).toBe("completed");

    // Verify both composite tasks are now enabled (sub-workflows initialized)
    const ct2Task = tasksAfterT1.find((task) => task.name === "ct2");
    const ct3Task = tasksAfterT1.find((task) => task.name === "ct3");
    expect(ct2Task?.state).toBe("enabled");
    expect(ct3Task?.state).toBe("enabled");

    // Get the sub-workflows using getWorkflowCompositeTaskWorkflows
    const ct2Workflows = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: mainWorkflowId,
        taskName: "ct2",
      }
    );
    expect(ct2Workflows.length).toBe(1);
    const subWorkflow1Instance = ct2Workflows[0];
    expect(subWorkflow1Instance.state).toBe("initialized");

    const ct3Workflows = await t.query(
      internal.testing.tasquencer.getWorkflowCompositeTaskWorkflows,
      {
        workflowId: mainWorkflowId,
        taskName: "ct3",
      }
    );
    expect(ct3Workflows.length).toBe(1);
    const subWorkflow2Instance = ct3Workflows[0];
    expect(subWorkflow2Instance.state).toBe("initialized");

    // Get work items from subWorkflow1
    const sw1WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: subWorkflow1Instance._id,
        taskName: "sw1_task1",
      }
    );
    expect(sw1WorkItems.length).toBe(2);
    expect(sw1WorkItems[0].state).toBe("initialized");
    expect(sw1WorkItems[1].state).toBe("initialized");

    // Start both work items in subWorkflow1 (use root workflow name)
    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "complexFailureTest",
      workItemId: sw1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "complexFailureTest",
      workItemId: sw1WorkItems[1]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Get work items from subWorkflow2 and start them
    const sw2WorkItems = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: subWorkflow2Instance._id,
        taskName: "sw2_task1",
      }
    );
    expect(sw2WorkItems.length).toBe(1);
    expect(sw2WorkItems[0].state).toBe("initialized");

    await t.mutation(internal.testing.tasquencer.startWorkItem, {
      workflowName: "complexFailureTest",
      workItemId: sw2WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // NOW FAIL one work item in subWorkflow1 (use root workflow name)
    await t.mutation(internal.testing.tasquencer.failWorkItem, {
      workflowName: "complexFailureTest",
      workItemId: sw1WorkItems[0]._id,
      workflowVersionName: WORKFLOW_VERSION_NAME,
    });

    await waitForFlush(t);

    // Verify the failure propagation chain:

    // 1. Originating work item in subWorkflow1: failed
    const sw1WorkItemsAfter = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: subWorkflow1Instance._id,
        taskName: "sw1_task1",
      }
    );
    const failedWorkItem = sw1WorkItemsAfter.find(
      (wi) => wi._id === sw1WorkItems[0]._id
    );
    expect(failedWorkItem?.state).toBe("failed");

    // 2. Sibling work item in subWorkflow1: canceled
    const siblingWorkItem = sw1WorkItemsAfter.find(
      (wi) => wi._id === sw1WorkItems[1]._id
    );
    expect(siblingWorkItem?.state).toBe("canceled");

    // 3. Task in subWorkflow1: failed
    const sw1Tasks = await t.query(
      internal.testing.tasquencer.getWorkflowTasks,
      {
        workflowId: subWorkflow1Instance._id,
      }
    );
    expect(sw1Tasks[0].state).toBe("failed");

    // 4. SubWorkflow1: failed
    const sw1After = await t.query(
      internal.testing.tasquencer.getWorkflowById,
      {
        workflowId: subWorkflow1Instance._id,
      }
    );
    expect(sw1After.state).toBe("failed");

    // 5. Composite task ct2 (parent of subWorkflow1): failed
    const mainTasksAfter = await t.query(
      internal.testing.tasquencer.getWorkflowTasks,
      {
        workflowId: mainWorkflowId,
      }
    );
    const ct2After = mainTasksAfter.find((task) => task.name === "ct2");
    expect(ct2After?.state).toBe("failed");

    // 6. Main workflow: failed
    const mainWorkflowAfter = await t.query(
      internal.testing.tasquencer.getWorkflowById,
      {
        workflowId: mainWorkflowId,
      }
    );
    expect(mainWorkflowAfter.state).toBe("failed");

    // 7. Sibling composite task ct3: canceled (not failed!)
    const ct3After = mainTasksAfter.find((task) => task.name === "ct3");
    expect(ct3After?.state).toBe("canceled");

    // 8. SubWorkflow2 (child of ct3): canceled
    const sw2After = await t.query(
      internal.testing.tasquencer.getWorkflowById,
      {
        workflowId: subWorkflow2Instance._id,
      }
    );
    expect(sw2After.state).toBe("canceled");

    // 9. Work items in subWorkflow2: canceled
    const sw2WorkItemsAfter = await t.query(
      internal.testing.tasquencer.getWorkflowTaskWorkItems,
      {
        workflowId: subWorkflow2Instance._id,
        taskName: "sw2_task1",
      }
    );
    expect(sw2WorkItemsAfter[0].state).toBe("canceled");

    // 10. Task t1 (already completed before failure): stays completed
    const t1After = mainTasksAfter.find((task) => task.name === "t1");
    expect(t1After?.state).toBe("completed");
  } finally {
    internalVersionManagerRegistry.unregisterVersionManager(
      complexFailureVersionManager
    );
    internalVersionManagerRegistry.unregisterVersionManager(
      subWorkflow2VersionManager
    );
    internalVersionManagerRegistry.unregisterVersionManager(
      subWorkflow1VersionManager
    );
  }
});
