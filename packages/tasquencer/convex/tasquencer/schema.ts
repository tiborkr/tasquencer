import { defineTable } from "convex/server";
import { v } from "convex/values";

export const workflowStatesValidator = v.union(
  v.literal("initialized"),
  v.literal("started"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled")
);

export const workItemStatesValidator = workflowStatesValidator;

export const taskStatesValidator = v.union(
  v.literal("disabled"),
  v.literal("enabled"),
  v.literal("started"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled")
);

export const workflowExecutionModeValidator = v.union(
  v.literal("normal"),
  v.literal("fastForward")
);

const tasquencerWorkflows = defineTable({
  name: v.string(),
  path: v.array(v.string()),
  versionName: v.string(),
  executionMode: workflowExecutionModeValidator,
  realizedPath: v.array(v.string()),
  state: workflowStatesValidator,
  parent: v.optional(
    v.object({
      workflowId: v.id("tasquencerWorkflows"),
      taskName: v.string(),
      taskGeneration: v.number(),
    })
  ),
})
  .index("by_parent_workflow_id_task_name_task_generation_state_and_name", [
    "parent.workflowId",
    "parent.taskName",
    "parent.taskGeneration",
    "state",
    "name",
  ])
  .index("by_parent_workflow_id_task_name_task_generation_and_name", [
    "parent.workflowId",
    "parent.taskName",
    "parent.taskGeneration",
    "name",
  ]);

const tasquencerWorkItems = defineTable({
  name: v.string(),
  path: v.array(v.string()),
  versionName: v.string(),
  realizedPath: v.array(v.string()),
  state: workItemStatesValidator,
  parent: v.object({
    workflowId: v.id("tasquencerWorkflows"),
    taskName: v.string(),
    taskGeneration: v.number(),
  }),
}).index("by_parent_workflow_id_task_name_task_generation_and_state", [
  "parent.workflowId",
  "parent.taskName",
  "parent.taskGeneration",
  "state",
]);

const tasquencerTasks = defineTable({
  name: v.string(),
  path: v.array(v.string()),
  versionName: v.string(),
  executionMode: workflowExecutionModeValidator,
  workflowId: v.id("tasquencerWorkflows"),
  realizedPath: v.array(v.string()),
  state: taskStatesValidator,
  generation: v.number(),
})
  .index("by_workflow_id_and_state", ["workflowId", "state"])
  .index("by_workflow_id_name_and_generation", [
    "workflowId",
    "name",
    "generation",
  ]);

const tasquencerTasksStateLog = defineTable({
  workflowId: v.id("tasquencerWorkflows"),
  name: v.string(),
  generation: v.number(),
  versionName: v.string(),
  state: taskStatesValidator,
}).index("by_workflow_id_name_and_generation", [
  "workflowId",
  "name",
  "generation",
]);

const tasquencerConditions = defineTable({
  name: v.string(),
  path: v.array(v.string()),
  versionName: v.string(),
  workflowId: v.id("tasquencerWorkflows"),
  realizedPath: v.array(v.string()),
  marking: v.number(),
})
  .index("by_workflow_id_and_name", ["workflowId", "name"])
  .index("by_workflow_id_and_marking", ["workflowId", "marking"]);

const tasquencerTaskStatsShards = defineTable({
  workflowId: v.id("tasquencerWorkflows"),
  taskName: v.string(),
  taskGeneration: v.number(),
  versionName: v.string(),
  shardId: v.number(),
  total: v.number(),
  initialized: v.number(),
  started: v.number(),
  completed: v.number(),
  failed: v.number(),
  canceled: v.number(),
})
  .index("by_workflow_task_generation_shard", [
    "workflowId",
    "taskName",
    "taskGeneration",
    "shardId",
  ])
  .index("by_workflow_task_generation", [
    "workflowId",
    "taskName",
    "taskGeneration",
  ]);

const tasquencerScheduledInitializations = defineTable({
  scheduledFunctionId: v.id("_scheduled_functions"),
  key: v.string(),
  createdAt: v.number(),
}).index("by_key", ["key"]);

const tasquencerMigration = defineTable({
  fromWorkflowId: v.id("tasquencerWorkflows"),
  toWorkflowId: v.id("tasquencerWorkflows"),
}).index("by_toWorkflowId", ["toWorkflowId"]);

export const schema = {
  tasquencerWorkflows,
  tasquencerWorkItems,
  tasquencerTasks,
  tasquencerTasksStateLog,
  tasquencerConditions,
  tasquencerTaskStatsShards,
  tasquencerScheduledInitializations,
  tasquencerMigration,
};
