import {
  InvalidStateTransitionError,
  assertTaskExists,
  assertWorkItemExists,
  assertWorkItemState,
  WorkItemAutoTriggerAlreadySetError,
} from "../exceptions";
import { type Doc, type Id } from "../../_generated/dataModel";
import {
  type AnyWorkItemActions,
  type WorkItemActivities,
} from "../builder/workItem";
import { Task } from "./task";
import {
  createWorkItemActivitySpan,
  completeSpan,
  failSpan,
  type AuditCallbackInfo,
} from "../audit/integration";
import { cancelScheduledForWorkItem } from "../util/scheduler";
import { applyStatsTransition } from "../util/statsShards";
import { parsePayload } from "../util/helpers";
import {
  createActionAuditInfo,
  createActivityAuditInfo,
} from "./helpers/auditHelpers";
import { createWorkItemRegisterScheduled } from "./helpers/schedulerHelpers";
import { ExecutionContext } from "./executionContext";
import { activeTaskStates, type CancellationReason } from "../types";
import { getAuditService } from "../../components/audit/src/client/service";
import { getSpanBuffer } from "../../components/audit/src/client/buffer";
import { createWorkItemAttributes } from "../util/attributeHelpers";

export type AutoTriggerEntry = {
  workItemId: Id<"tasquencerWorkItems">;
  transition: "start" | "complete" | "fail" | "cancel";
  payload: unknown;
};

/**
 * FIFO buffer that defers auto-triggered work item transitions until the owner finishes
 * its current mutation. Downstream callers drain the queue sequentially so transitions
 * run in the exact order they were enqueued (see auto-trigger.test.ts).
 */
export class WorkItemAutoTriggerQueue {
  private queue: AutoTriggerEntry[] = [];

  add(entry: AutoTriggerEntry) {
    this.queue.push(entry);
  }

  getQueue(): AutoTriggerEntry[] {
    return this.queue;
  }

  async drainSequentially(handler: (entry: AutoTriggerEntry) => Promise<void>) {
    for (const entry of this.queue) {
      await handler(entry);
    }
    this.queue.length = 0;
  }
}

/**
 * Runtime representation of a work item.
 *
 * Handles boundary actions, lifecycle activities, stats bookkeeping, and audit tracing.
 * Methods are designed to run inside a single Convex mutation and cooperate with
 * {@link WorkItemAutoTriggerQueue} for chained transitions.
 */
export class WorkItem {
  constructor(
    readonly name: string,
    readonly versionName: string,
    readonly path: string[],
    private readonly activities: WorkItemActivities,
    private readonly actions: AnyWorkItemActions["actions"],
    readonly task: Task
  ) {}

  async initialize(
    executionContext: ExecutionContext,
    parent: {
      workflowId: Id<"tasquencerWorkflows">;
      taskName: string;
      taskGeneration: number;
    },
    payload: unknown,
    autoTriggerQueue: WorkItemAutoTriggerQueue | undefined = undefined
  ): Promise<Id<"tasquencerWorkItems">> {
    return await executionContext.withSpan(
      {
        operation: "WorkItem.initialize",
        operationType: "workItem",
        resourceType: "workItem",
        resourceName: this.name,
        attributes: createWorkItemAttributes({
          workflowId: parent.workflowId,
          parent,
          versionName: this.versionName,
          state: "initialized",
        }),
      },
      async (executionContext) => {
        let inserted = false;
        const initializeFn = (() => {
          let workItemId: Id<"tasquencerWorkItems"> | undefined;
          return async () => {
            if (workItemId) {
              return workItemId;
            }

            const task = await executionContext.mutationCtx.db
              .query("tasquencerTasks")
              .withIndex("by_workflow_id_name_and_generation", (q) =>
                q
                  .eq("workflowId", parent.workflowId)
                  .eq("name", parent.taskName)
                  .eq("generation", parent.taskGeneration)
              )
              .unique();

            assertTaskExists(task, parent.taskName, parent.workflowId);
            if (
              !activeTaskStates.includes(
                task.state as (typeof activeTaskStates)[number]
              )
            ) {
              throw new InvalidStateTransitionError(
                "Task",
                String(task._id),
                task.state,
                [...activeTaskStates]
              );
            }

            workItemId = await executionContext.mutationCtx.db.insert(
              "tasquencerWorkItems",
              {
                name: this.name,
                path: this.path,
                versionName: this.versionName,
                state: "initialized",
                realizedPath: [...task.realizedPath, task._id],
                parent: {
                  workflowId: parent.workflowId,
                  taskName: task.name,
                  taskGeneration: task.generation,
                },
              }
            );

            inserted = true;

            return workItemId;
          };
        })();

        const registerScheduled = createWorkItemRegisterScheduled(
          executionContext.mutationCtx,
          initializeFn
        );

        const parsedPayload = parsePayload(
          this.actions.initialize.schema,
          payload
        );
        const auditInfo = createActionAuditInfo(
          executionContext.auditContext,
          executionContext.auditContext,
          executionContext.maybeSpanId
        );

        await this.actions.initialize.callback(
          {
            mutationCtx: executionContext.mutationCtx,
            isInternalMutation: executionContext.isInternalMutation,
            executionMode: executionContext.executionMode,
            registerScheduled,
            parent: {
              workflow: {
                name: this.task.parentWorkflow.name,
                id: parent.workflowId,
              },
              task: {
                name: this.task.name,
                generation: parent.taskGeneration,
                path: this.task.path,
              },
            },
            workItem: {
              name: this.name,
              initialize: initializeFn,
            },
            audit: auditInfo,
          },
          parsedPayload
        );

        const workItemId = await initializeFn();
        const spanId = executionContext.maybeSpanId;

        if (spanId) {
          const buffer = getSpanBuffer();
          buffer.updateSpan(executionContext.auditContext.traceId, spanId, {
            resourceId: workItemId,
          });
        }

        const auditService = getAuditService();
        auditService.addEvent(
          executionContext.auditContext.traceId,
          executionContext.spanId,
          {
            name: "workItemIdAssigned",
            data: { workItemId },
          }
        );

        if (inserted) {
          await applyStatsTransition({
            ctx: executionContext.mutationCtx,
            workflowId: parent.workflowId,
            taskName: parent.taskName,
            taskGeneration: parent.taskGeneration,
            shardCount: this.task.getStatsShardCount(),
            entityId: workItemId,
            nextState: "initialized",
          });
        }

        const activitySpan = createWorkItemActivitySpan({
          activityName: "onInitialized",
          workItemId: workItemId,
          workItemName: this.name,
          workflowId: parent.workflowId,
          parentContext: executionContext.auditContext,
        });

        const activityAuditInfo = createActivityAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.maybeSpanId,
          activitySpan
        );

        try {
          let autoTrigger: AutoTriggerEntry | undefined;

          const registerScheduled = createWorkItemRegisterScheduled(
            executionContext.mutationCtx,
            () => workItemId
          );

          const workItem =
            await executionContext.mutationCtx.db.get(workItemId);
          assertWorkItemExists(workItem, workItemId);

          const initialActivityContext = this.makeWorkItemActivityInfo(
            executionContext,
            activityAuditInfo,
            workItem
          );

          await this.activities.onInitialized({
            ...initialActivityContext,
            registerScheduled,
            workItem: {
              ...initialActivityContext.workItem,
              start: (payload) => {
                if (autoTrigger) {
                  throw new WorkItemAutoTriggerAlreadySetError();
                }
                autoTrigger = {
                  workItemId,
                  transition: "start",
                  payload,
                };
              },
            },
          });

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId
          );

          if (autoTrigger) {
            if (autoTriggerQueue) {
              autoTriggerQueue.add(autoTrigger);
            } else {
              const workItem =
                await executionContext.mutationCtx.db.get(workItemId);
              assertWorkItemExists(workItem, workItemId);
              await this.start(executionContext, workItem, autoTrigger.payload);
            }
          }
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        return workItemId;
      }
    );
  }

  async getAllWorkItemIds(
    executionContext: ExecutionContext,
    parent: {
      workflowId: Id<"tasquencerWorkflows">;
      taskName: string;
      taskGeneration: number;
    }
  ) {
    const workItems = await executionContext.mutationCtx.db
      .query("tasquencerWorkItems")
      .withIndex(
        "by_parent_workflow_id_task_name_task_generation_and_state",
        (q) =>
          q
            .eq("parent.workflowId", parent.workflowId)
            .eq("parent.taskName", parent.taskName)
            .eq("parent.taskGeneration", parent.taskGeneration)
      )
      .collect();

    return workItems.map((workItem) => workItem._id);
  }

  async start(
    executionContext: ExecutionContext,
    workItem: Doc<"tasquencerWorkItems">,
    payload: unknown,
    autoTriggerQueue: WorkItemAutoTriggerQueue | undefined = undefined
  ) {
    assertWorkItemState(workItem, ["initialized"]);

    return await executionContext.withSpan(
      {
        operation: "WorkItem.start",
        operationType: "workItem",
        resourceType: "workItem",
        resourceId: workItem._id,
        resourceName: this.name,
        attributes: createWorkItemAttributes({
          workflowId: workItem.parent.workflowId,
          parent: workItem.parent,
          versionName: this.versionName,
          state: "started",
        }),
      },
      async (executionContext) => {
        const prevState = workItem.state;

        await this.task.ensureStarted(
          executionContext,
          workItem.parent.workflowId,
          workItem.parent.taskGeneration
        );

        const startFn = (() => {
          let called = false;
          return async () => {
            if (called) {
              return;
            }
            await executionContext.mutationCtx.db.patch(workItem._id, {
              state: "started",
            });
            called = true;
          };
        })();

        const parsedPayload = parsePayload(this.actions.start.schema, payload);

        const auditInfo = createActionAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId
        );

        const registerScheduled = createWorkItemRegisterScheduled(
          executionContext.mutationCtx,
          () => workItem._id
        );

        const initialActivityContext = this.makeWorkItemActivityInfo(
          executionContext,
          auditInfo,
          workItem
        );

        await this.actions.start.callback(
          {
            ...initialActivityContext,
            registerScheduled,
            workItem: { ...initialActivityContext.workItem, start: startFn },
          },
          parsedPayload
        );

        await startFn();

        await applyStatsTransition({
          ctx: executionContext.mutationCtx,
          workflowId: workItem.parent.workflowId,
          taskName: workItem.parent.taskName,
          taskGeneration: workItem.parent.taskGeneration,
          shardCount: this.task.getStatsShardCount(),
          entityId: workItem._id,
          prevState,
          nextState: "started",
        });

        const activitySpan = createWorkItemActivitySpan({
          activityName: "onStarted",
          workItemId: workItem._id,
          workItemName: this.name,
          workflowId: workItem.parent.workflowId,
          parentContext: executionContext.auditContext,
        });

        const activityAuditInfo = createActivityAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId,
          activitySpan
        );

        try {
          let autoTrigger: AutoTriggerEntry | undefined;

          const registerScheduled = createWorkItemRegisterScheduled(
            executionContext.mutationCtx,
            () => workItem._id
          );

          const initialActivityContext = this.makeWorkItemActivityInfo(
            executionContext,
            activityAuditInfo,
            workItem
          );

          await this.activities.onStarted({
            ...initialActivityContext,
            registerScheduled,
            workItem: {
              ...initialActivityContext.workItem,
              complete: (payload) => {
                if (autoTrigger) {
                  throw new WorkItemAutoTriggerAlreadySetError();
                }
                autoTrigger = {
                  workItemId: workItem._id,
                  transition: "complete",
                  payload,
                };
              },
              fail: (payload) => {
                if (autoTrigger) {
                  throw new WorkItemAutoTriggerAlreadySetError();
                }
                autoTrigger = {
                  workItemId: workItem._id,
                  transition: "fail",
                  payload,
                };
              },
              cancel: (payload) => {
                if (autoTrigger) {
                  throw new WorkItemAutoTriggerAlreadySetError();
                }
                autoTrigger = {
                  workItemId: workItem._id,
                  transition: "cancel",
                  payload,
                };
              },
            },
          });

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId
          );

          if (autoTrigger) {
            if (autoTriggerQueue) {
              autoTriggerQueue.add(autoTrigger);
            } else {
              const freshWorkItem = await executionContext.mutationCtx.db.get(
                workItem._id
              );
              assertWorkItemExists(freshWorkItem, workItem._id);

              switch (autoTrigger.transition) {
                case "complete":
                  await this.complete(
                    executionContext,
                    freshWorkItem,
                    autoTrigger.payload
                  );
                  break;
                case "fail":
                  await this.fail(
                    executionContext,
                    freshWorkItem,
                    autoTrigger.payload
                  );
                  break;
                case "cancel":
                  await this.cancel(
                    executionContext,
                    freshWorkItem,
                    autoTrigger.payload
                  );
                  break;
              }
            }
          }
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        await this.task.workItemStateChanged(
          executionContext,
          workItem.parent.workflowId,
          workItem,
          workItem.state,
          "started",
          true
        );
      }
    );
  }

  async complete(
    executionContext: ExecutionContext,
    workItem: Doc<"tasquencerWorkItems">,
    payload: unknown
  ) {
    assertWorkItemState(workItem, ["started"]);

    return await executionContext.withSpan(
      {
        operation: "WorkItem.complete",
        operationType: "workItem",
        resourceType: "workItem",
        resourceId: workItem._id,
        resourceName: this.name,
        attributes: createWorkItemAttributes({
          workflowId: workItem.parent.workflowId,
          parent: workItem.parent,
          versionName: this.versionName,
          state: "completed",
        }),
      },
      async (executionContext) => {
        const prevState = workItem.state;
        const completeFn = (() => {
          let called = false;
          return async () => {
            if (called) {
              return;
            }
            await executionContext.mutationCtx.db.patch(workItem._id, {
              state: "completed",
            });
            called = true;
          };
        })();

        const parsedPayload = parsePayload(
          this.actions.complete.schema,
          payload
        );
        const auditInfo = createActionAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId
        );

        const initialActivityContext = this.makeWorkItemActivityInfo(
          executionContext,
          auditInfo,
          workItem
        );

        await this.actions.complete.callback(
          {
            ...initialActivityContext,
            workItem: {
              ...initialActivityContext.workItem,
              complete: completeFn,
            },
          },
          parsedPayload
        );

        await completeFn();

        await applyStatsTransition({
          ctx: executionContext.mutationCtx,
          workflowId: workItem.parent.workflowId,
          taskName: workItem.parent.taskName,
          taskGeneration: workItem.parent.taskGeneration,
          shardCount: this.task.getStatsShardCount(),
          entityId: workItem._id,
          prevState,
          nextState: "completed",
        });

        const activitySpan = createWorkItemActivitySpan({
          activityName: "onCompleted",
          workItemId: workItem._id,
          workItemName: this.name,
          workflowId: workItem.parent.workflowId,
          parentContext: executionContext.auditContext,
        });

        const activityAuditInfo = createActivityAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId,
          activitySpan
        );

        try {
          await cancelScheduledForWorkItem(
            executionContext.mutationCtx,
            workItem._id
          );

          await this.activities.onCompleted(
            this.makeWorkItemActivityInfo(
              executionContext,
              activityAuditInfo,
              workItem
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        await this.task.workItemStateChanged(
          executionContext,
          workItem.parent.workflowId,
          workItem,
          workItem.state,
          "completed",
          true
        );
      }
    );
  }

  async reset(
    executionContext: ExecutionContext,
    workItem: Doc<"tasquencerWorkItems">,
    payload: unknown
  ) {
    assertWorkItemState(workItem, ["started"]);

    return await executionContext.withSpan(
      {
        operation: "WorkItem.reset",
        operationType: "workItem",
        resourceType: "workItem",
        resourceId: workItem._id,
        resourceName: this.name,
        attributes: createWorkItemAttributes({
          workflowId: workItem.parent.workflowId,
          parent: workItem.parent,
          versionName: this.versionName,
          state: "initialized",
        }),
      },
      async (executionContext) => {
        const prevState = workItem.state;
        const resetFn = (() => {
          let called = false;
          return async () => {
            if (called) {
              return;
            }
            await executionContext.mutationCtx.db.patch(workItem._id, {
              state: "initialized",
            });
            called = true;
          };
        })();

        const parsedPayload = parsePayload(this.actions.reset.schema, payload);

        const auditInfo = createActionAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId
        );

        const initialActivityContext = this.makeWorkItemActivityInfo(
          executionContext,
          auditInfo,
          workItem
        );

        await this.actions.reset.callback(
          {
            ...initialActivityContext,
            workItem: { ...initialActivityContext.workItem, reset: resetFn },
          },
          parsedPayload
        );

        await resetFn();
        await applyStatsTransition({
          ctx: executionContext.mutationCtx,
          workflowId: workItem.parent.workflowId,
          taskName: workItem.parent.taskName,
          taskGeneration: workItem.parent.taskGeneration,
          shardCount: this.task.getStatsShardCount(),
          entityId: workItem._id,
          prevState,
          nextState: "initialized",
        });

        const activitySpan = createWorkItemActivitySpan({
          activityName: "onReset",
          workItemId: workItem._id,
          workItemName: this.name,
          workflowId: workItem.parent.workflowId,
          parentContext: executionContext.auditContext,
        });

        const activityAuditInfo = createActivityAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId,
          activitySpan
        );

        try {
          await cancelScheduledForWorkItem(
            executionContext.mutationCtx,
            workItem._id
          );

          await this.activities.onReset(
            this.makeWorkItemActivityInfo(
              executionContext,
              activityAuditInfo,
              workItem
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            {
              type: "activity",
              workflowId: workItem.parent.workflowId,
              activityName: "onReset",
              data: { businessResult: "reset" },
            }
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        await this.task.workItemStateChanged(
          executionContext,
          workItem.parent.workflowId,
          workItem,
          workItem.state,
          "initialized",
          true
        );
      }
    );
  }

  async fail(
    executionContext: ExecutionContext,
    workItem: Doc<"tasquencerWorkItems">,
    payload: unknown
  ) {
    assertWorkItemState(workItem, ["started"]);

    return await executionContext.withSpan(
      {
        operation: "WorkItem.fail",
        operationType: "workItem",
        resourceType: "workItem",
        resourceId: workItem._id,
        resourceName: this.name,
        attributes: createWorkItemAttributes({
          workflowId: workItem.parent.workflowId,
          parent: workItem.parent,
          versionName: this.versionName,
          state: "failed",
        }),
      },
      async (executionContext) => {
        const prevState = workItem.state;
        const failFn = (() => {
          let called = false;
          return async () => {
            if (called) {
              return;
            }
            await executionContext.mutationCtx.db.patch(workItem._id, {
              state: "failed",
            });
            called = true;
          };
        })();

        const parsedPayload = parsePayload(this.actions.fail.schema, payload);

        const auditInfo = createActionAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId
        );

        const initialActivityContext = this.makeWorkItemActivityInfo(
          executionContext,
          auditInfo,
          workItem
        );

        await this.actions.fail.callback(
          {
            ...initialActivityContext,
            workItem: { ...initialActivityContext.workItem, fail: failFn },
          },
          parsedPayload
        );

        await failFn();
        await applyStatsTransition({
          ctx: executionContext.mutationCtx,
          workflowId: workItem.parent.workflowId,
          taskName: workItem.parent.taskName,
          taskGeneration: workItem.parent.taskGeneration,
          shardCount: this.task.getStatsShardCount(),
          entityId: workItem._id,
          prevState,
          nextState: "failed",
        });

        const activitySpan = createWorkItemActivitySpan({
          activityName: "onFailed",
          workItemId: workItem._id,
          workItemName: this.name,
          workflowId: workItem.parent.workflowId,
          parentContext: executionContext.auditContext,
        });

        const activityAuditInfo = createActivityAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId,
          activitySpan
        );

        try {
          await cancelScheduledForWorkItem(
            executionContext.mutationCtx,
            workItem._id
          );

          await this.activities.onFailed(
            this.makeWorkItemActivityInfo(
              executionContext,
              activityAuditInfo,
              workItem
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            {
              type: "activity",
              workflowId: workItem.parent.workflowId,
              activityName: "onFailed",
              data: { businessResult: "failed" },
            }
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        await this.task.workItemStateChanged(
          executionContext,
          workItem.parent.workflowId,
          workItem,
          workItem.state,
          "failed",
          true
        );
      }
    );
  }

  async cancel(
    executionContext: ExecutionContext,
    workItem: Doc<"tasquencerWorkItems">,
    payload: unknown,
    reason: CancellationReason = "explicit",
    callPolicy: boolean = true
  ) {
    assertWorkItemState(workItem, ["started", "initialized"]);

    return await executionContext.withSpan(
      {
        operation: "WorkItem.cancel",
        operationType: "workItem",
        resourceType: "workItem",
        resourceId: workItem._id,
        resourceName: this.name,
        attributes: createWorkItemAttributes({
          workflowId: workItem.parent.workflowId,
          parent: workItem.parent,
          versionName: this.versionName,
          state: "canceled",
          payload: { reason },
        }),
      },
      async (executionContext) => {
        const prevState = workItem.state;
        const cancelFn = (() => {
          let called = false;
          return async () => {
            if (called) {
              return;
            }
            await executionContext.mutationCtx.db.patch(workItem._id, {
              state: "canceled",
            });
            called = true;
          };
        })();

        if (reason === "explicit") {
          const actionAuditInfo = createActionAuditInfo(
            executionContext.parent.auditContext,
            executionContext.auditContext,
            executionContext.spanId
          );

          const initialActivityContext = this.makeWorkItemActivityInfo(
            executionContext,
            actionAuditInfo,
            workItem
          );

          const parsedPayload = parsePayload(
            this.actions.cancel.schema,
            payload
          );
          await this.actions.cancel.callback(
            {
              ...initialActivityContext,
              workItem: {
                ...initialActivityContext.workItem,
                cancel: cancelFn,
              },
            },
            parsedPayload
          );
        }

        await cancelFn();

        await applyStatsTransition({
          ctx: executionContext.mutationCtx,
          workflowId: workItem.parent.workflowId,
          taskName: workItem.parent.taskName,
          taskGeneration: workItem.parent.taskGeneration,
          shardCount: this.task.getStatsShardCount(),
          entityId: workItem._id,
          prevState,
          nextState: "canceled",
        });

        const activitySpan = createWorkItemActivitySpan({
          activityName: "onCanceled",
          workItemId: workItem._id,
          workItemName: this.name,
          workflowId: workItem.parent.workflowId,
          parentContext: executionContext.auditContext,
        });

        const activityAuditInfo = createActivityAuditInfo(
          executionContext.parent.auditContext,
          executionContext.auditContext,
          executionContext.spanId,
          activitySpan
        );

        try {
          await cancelScheduledForWorkItem(
            executionContext.mutationCtx,
            workItem._id
          );

          await this.activities.onCanceled(
            this.makeWorkItemActivityInfo(
              executionContext,
              activityAuditInfo,
              workItem
            )
          );

          completeSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            {
              type: "activity",
              workflowId: workItem.parent.workflowId,
              activityName: "onCanceled",
              data: { businessResult: "canceled" },
            }
          );
        } catch (error) {
          failSpan(
            executionContext.auditContext.traceId,
            activitySpan.spanId,
            error as Error
          );
          throw error;
        }

        await this.task.workItemStateChanged(
          executionContext,
          workItem.parent.workflowId,
          workItem,
          workItem.state,
          "canceled",
          callPolicy
        );
      }
    );
  }
  private makeWorkItemActivityInfo(
    executionContext: ExecutionContext,
    activityAuditInfo: AuditCallbackInfo,
    workItem: Doc<"tasquencerWorkItems">
  ) {
    return {
      mutationCtx: executionContext.mutationCtx,
      isInternalMutation: executionContext.isInternalMutation,
      executionMode: executionContext.executionMode,
      parent: {
        workflow: {
          id: workItem.parent.workflowId,
          name: this.task.parentWorkflow.name,
        },
        task: {
          name: this.task.name,
          generation: workItem.parent.taskGeneration,
          path: this.task.path,
        },
      },
      workItem: {
        name: this.name,
        id: workItem._id,
      },
      audit: activityAuditInfo,
    };
  }
}
