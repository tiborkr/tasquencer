import { setup, Builder } from "./setup.test";
import { it, vi, beforeEach, afterEach } from "vitest";
import { internal } from "../../../convex/_generated/api";

import schema from "../../schema";
import { withVersionManagerBuilders } from "./helpers/versionManager";
import { type AvailableRoutes } from "../builder/flow";

const WORKFLOW_VERSION_NAME = "v0";

function makeWorkflowDefinition(props: {
  shouldBookFlight: boolean;
  shouldBookCar: boolean;
}) {
  return Builder.workflow("or-split-join")
    .startCondition("start")
    .task(
      "register",
      Builder.noOpTask.withSplitType("or").withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "book_flight",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "book_car",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "book_hotel",
      Builder.noOpTask.withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .task(
      "pay",
      Builder.noOpTask.withJoinType("or").withActivities({
        onEnabled: async ({ workItem }) => {
          await workItem.initialize();
        },
      })
    )
    .endCondition("end")
    .connectCondition("start", (to) => to.task("register"))
    .connectTask("register", (to) =>
      to
        .task("book_flight")
        .task("book_car")
        .task("book_hotel")
        .route(async ({ route }) => {
          const routes: AvailableRoutes<typeof route>[] = [
            route.toTask("book_hotel"),
          ];

          if (props.shouldBookFlight) {
            routes.push(route.toTask("book_flight"));
          }

          if (props.shouldBookCar) {
            routes.push(route.toTask("book_car"));
          }

          return routes;
        })
    )
    .connectTask("book_flight", (to) => to.task("pay"))
    .connectTask("book_car", (to) => to.task("pay"))
    .connectTask("book_hotel", (to) => to.task("pay"))
    .connectTask("pay", (to) => to.condition("end"));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('runs a net with "or" split and "or" join (1)', async ({ expect }) => {
  await withVersionManagerBuilders(
    {
      workflowName: "or-split-join",
      versionName: WORKFLOW_VERSION_NAME,
      builder: makeWorkflowDefinition({
        shouldBookFlight: true,
        shouldBookCar: true,
      }),
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "or-split-join",
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
      expect(enabledTasks1[0].name).toEqual("register");

      const workItemsRegister = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "register",
        }
      );

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsRegister[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsRegister[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const enabledTasks2 = await t.query(
        internal.testing.tasquencer.getWorkflowTasksByState,
        {
          workflowId: id,
          state: "enabled",
        }
      );
      expect(enabledTasks2.length).toBe(3);
      expect(new Set(enabledTasks2.map((task) => task.name))).toEqual(
        new Set(["book_flight", "book_car", "book_hotel"])
      );

      const workItemsBookFlight = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "book_flight",
        }
      );
      expect(workItemsBookFlight.length).toBe(1);
      expect(workItemsBookFlight[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookFlight[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookFlight[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const workItemsBookCar = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "book_car",
        }
      );
      expect(workItemsBookCar.length).toBe(1);
      expect(workItemsBookCar[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookCar[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookCar[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const workItemsBookHotel = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "book_hotel",
        }
      );

      expect(workItemsBookHotel.length).toBe(1);
      expect(workItemsBookHotel[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookHotel[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookHotel[0]._id,
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
    }
  );
});

it('runs a net with "or" split and "or" join (2)', async ({ expect }) => {
  await withVersionManagerBuilders(
    {
      workflowName: "or-split-join",
      versionName: WORKFLOW_VERSION_NAME,
      builder: makeWorkflowDefinition({
        shouldBookFlight: false,
        shouldBookCar: true,
      }),
    },
    async () => {
      const t = setup();

      const id = await t.mutation(
        internal.testing.tasquencer.initializeRootWorkflow,
        {
          workflowName: "or-split-join",
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
      expect(enabledTasks1[0].name).toEqual("register");

      const workItemsRegister = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "register",
        }
      );

      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsRegister[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsRegister[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const enabledTasks2 = await t.query(
        internal.testing.tasquencer.getWorkflowTasksByState,
        {
          workflowId: id,
          state: "enabled",
        }
      );
      expect(enabledTasks2.length).toBe(2);
      expect(new Set(enabledTasks2.map((task) => task.name))).toEqual(
        new Set(["book_car", "book_hotel"])
      );

      const workItemsBookCar = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "book_car",
        }
      );
      expect(workItemsBookCar.length).toBe(1);
      expect(workItemsBookCar[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookCar[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });
      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookCar[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      const workItemsBookHotel = await t.query(
        internal.testing.tasquencer.getWorkflowTaskWorkItems,
        {
          workflowId: id,
          taskName: "book_hotel",
        }
      );

      expect(workItemsBookHotel.length).toBe(1);
      expect(workItemsBookHotel[0].state).toBe("initialized");
      await t.mutation(internal.testing.tasquencer.startWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookHotel[0]._id,
        workflowVersionName: WORKFLOW_VERSION_NAME,
      });

      await t.mutation(internal.testing.tasquencer.completeWorkItem, {
        workflowName: "or-split-join",
        workItemId: workItemsBookHotel[0]._id,
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
    }
  );
});
