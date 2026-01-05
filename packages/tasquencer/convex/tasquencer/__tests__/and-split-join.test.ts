import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import { versionManagerFor } from "../../../convex/tasquencer/versionManager";
import schema from "../../schema";
import { internalVersionManagerRegistry } from "../../testing/tasquencer";

const WORKFLOW_VERSION_NAME = "v0";

const workflowDefinition = Builder.workflow("checkout")
  .startCondition("start")
  .task(
    "scan_goods",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "pay",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "pack_goods",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "issue_receipt",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .task(
    "check_goods",
    Builder.noOpTask.withActivities({
      onEnabled: async ({ workItem }) => {
        await workItem.initialize();
      },
    })
  )
  .endCondition("end")
  .connectCondition("start", (to) => to.task("scan_goods"))
  .connectTask("scan_goods", (to) => to.task("pay"))
  .connectTask("pay", (to) => to.task("pack_goods").task("issue_receipt"))
  .connectTask("pack_goods", (to) => to.task("check_goods"))
  .connectTask("issue_receipt", (to) => to.task("check_goods"))
  .connectTask("check_goods", (to) => to.condition("end"));

const checkoutVersionManager = versionManagerFor("checkout")
  .registerVersion(WORKFLOW_VERSION_NAME, workflowDefinition)
  .build();

beforeEach(() => {
  vi.useFakeTimers();
  internalVersionManagerRegistry.registerVersionManager(checkoutVersionManager);
});

afterEach(() => {
  vi.useRealTimers();
  internalVersionManagerRegistry.unregisterVersionManager(
    checkoutVersionManager
  );
});

it('runs a net with "and" split and "and" join', async ({ expect }) => {
  const t = setup();

  const id = await t.mutation(
    internal.testing.tasquencer.initializeRootWorkflow,
    {
      workflowName: "checkout",
      workflowVersionName: WORKFLOW_VERSION_NAME,
    }
  );

  const enabledTasks1 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks1.length).toBe(1);
  expect(enabledTasks1[0].name).toBe("scan_goods");

  const workItemsScanGoods = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "scan_goods",
    }
  );
  expect(workItemsScanGoods.length).toBe(1);
  expect(workItemsScanGoods[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsScanGoods[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks2 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks2.length).toBe(0);

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsScanGoods[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks3 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks3.length).toBe(1);
  expect(enabledTasks3[0].name).toBe("pay");

  const workItemsPay = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "pay",
    }
  );
  expect(workItemsPay.length).toBe(1);
  expect(workItemsPay[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsPay[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks4 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks4.length).toBe(0);

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsPay[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks5 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks5.length).toBe(2);
  expect(new Set(enabledTasks5.map((t) => t.name))).toEqual(
    new Set(["pack_goods", "issue_receipt"])
  );

  const workItemsPackGoods = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "pack_goods",
    }
  );
  expect(workItemsPackGoods.length).toBe(1);
  expect(workItemsPackGoods[0].state).toBe("initialized");

  const workItemsIssueReceipt = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "issue_receipt",
    }
  );
  expect(workItemsIssueReceipt.length).toBe(1);
  expect(workItemsIssueReceipt[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsIssueReceipt[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks6 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks6.length).toBe(1);
  expect(enabledTasks6[0].name).toBe("pack_goods");

  const workItemsPackGoods2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "pack_goods",
    }
  );
  expect(workItemsPackGoods2.length).toBe(1);
  expect(workItemsPackGoods2[0].state).toBe("initialized");

  const workItemsIssueReceipt2 = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "issue_receipt",
    }
  );
  expect(workItemsIssueReceipt2.length).toBe(1);
  expect(workItemsIssueReceipt2[0].state).toBe("started");

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsIssueReceipt2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsPackGoods2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsPackGoods2[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks7 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks7.length).toBe(1);
  expect(enabledTasks7[0].name).toBe("check_goods");

  const workItemsCheckGoods = await t.query(
    internal.testing.tasquencer.getWorkflowTaskWorkItems,
    {
      workflowId: id,
      taskName: "check_goods",
    }
  );
  expect(workItemsCheckGoods.length).toBe(1);
  expect(workItemsCheckGoods[0].state).toBe("initialized");

  await t.mutation(internal.testing.tasquencer.startWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsCheckGoods[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  await t.mutation(internal.testing.tasquencer.completeWorkItem, {
    workflowName: "checkout",
    workItemId: workItemsCheckGoods[0]._id,
    workflowVersionName: WORKFLOW_VERSION_NAME,
  });

  const enabledTasks8 = await t.query(
    internal.testing.tasquencer.getWorkflowTasksByState,
    {
      workflowId: id,
      state: "enabled",
    }
  );
  expect(enabledTasks8.length).toBe(0);

  const workflowInstance = await t.query(
    internal.testing.tasquencer.getWorkflowById,
    {
      workflowId: id,
    }
  );
  expect(workflowInstance.state).toBe("completed");
});
