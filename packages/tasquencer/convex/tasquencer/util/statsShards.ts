import { type MutationCtx, type DatabaseReader } from "../../_generated/server";
import { type Doc, type Id } from "../../_generated/dataModel";
import { type WorkItemState } from "../types";

export type AggregatedStats = {
  total: number;
  initialized: number;
  started: number;
  completed: number;
  failed: number;
  canceled: number;
};

export const DEFAULT_STATS_SHARD_COUNT = 8;
// Shard count lives in tasquencerTaskStatsShards (separate table) for OCC; changing it is a breaking change.

type CountedState = Extract<
  WorkItemState,
  "initialized" | "started" | "completed" | "failed" | "canceled"
>;

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function emptyStats(): AggregatedStats {
  return {
    total: 0,
    initialized: 0,
    started: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
  };
}

export async function ensureTaskStatsShards(args: {
  ctx: MutationCtx;
  workflowId: Id<"tasquencerWorkflows">;
  taskName: string;
  taskGeneration: number;
  versionName: string;
  shardCount: number;
}): Promise<void> {
  const { ctx, workflowId, taskName, taskGeneration, versionName, shardCount } =
    args;

  for (let shardId = 0; shardId < shardCount; shardId++) {
    const existing = await ctx.db
      .query("tasquencerTaskStatsShards")
      .withIndex("by_workflow_task_generation_shard", (q) =>
        q
          .eq("workflowId", workflowId)
          .eq("taskName", taskName)
          .eq("taskGeneration", taskGeneration)
          .eq("shardId", shardId)
      )
      .unique();

    if (existing) {
      continue;
    }

    await ctx.db.insert("tasquencerTaskStatsShards", {
      workflowId,
      taskName,
      taskGeneration,
      versionName,
      shardId,
      total: 0,
      initialized: 0,
      started: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
    });
  }
}

async function getStatsShardDoc(
  ctx: MutationCtx,
  args: {
    workflowId: Id<"tasquencerWorkflows">;
    taskName: string;
    taskGeneration: number;
    shardId: number;
  }
): Promise<Doc<"tasquencerTaskStatsShards">> {
  const { workflowId, taskName, taskGeneration, shardId } = args;
  const shard = await ctx.db
    .query("tasquencerTaskStatsShards")
    .withIndex("by_workflow_task_generation_shard", (q) =>
      q
        .eq("workflowId", workflowId)
        .eq("taskName", taskName)
        .eq("taskGeneration", taskGeneration)
        .eq("shardId", shardId)
    )
    .unique();

  if (!shard) {
    throw new Error(
      `Missing stats shard for ${workflowId}:${taskName} generation ${taskGeneration} shard ${shardId}`
    );
  }

  return shard;
}

export async function applyStatsTransition(args: {
  ctx: MutationCtx;
  workflowId: Id<"tasquencerWorkflows">;
  taskName: string;
  taskGeneration: number;
  shardCount: number;
  entityId: Id<any>;
  prevState?: CountedState;
  nextState: CountedState;
}): Promise<void> {
  const {
    ctx,
    workflowId,
    taskName,
    taskGeneration,
    shardCount,
    entityId,
    prevState,
    nextState,
  } = args;

  if (prevState === nextState) {
    return;
  }

  const shardId = hashId(String(entityId)) % shardCount;

  const shard = await getStatsShardDoc(ctx, {
    workflowId,
    taskName,
    taskGeneration,
    shardId,
  });

  const deltas: AggregatedStats = {
    total: prevState ? 0 : 1,
    initialized: 0,
    started: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
  };

  if (prevState) {
    deltas[prevState] -= 1;
  }
  deltas[nextState] += 1;

  await ctx.db.patch(shard._id, {
    total: shard.total + deltas.total,
    initialized: shard.initialized + deltas.initialized,
    started: shard.started + deltas.started,
    completed: shard.completed + deltas.completed,
    failed: shard.failed + deltas.failed,
    canceled: shard.canceled + deltas.canceled,
  });
}

export async function getAggregatedTaskStats(
  db: DatabaseReader,
  args: {
    workflowId: Id<"tasquencerWorkflows">;
    taskName: string;
    taskGeneration: number;
  }
): Promise<AggregatedStats> {
  const { workflowId, taskName, taskGeneration } = args;

  const shards = await db
    .query("tasquencerTaskStatsShards")
    .withIndex("by_workflow_task_generation", (q) =>
      q
        .eq("workflowId", workflowId)
        .eq("taskName", taskName)
        .eq("taskGeneration", taskGeneration)
    )
    .collect();

  return shards.reduce((acc, shard) => {
    acc.total += shard.total;
    acc.initialized += shard.initialized;
    acc.started += shard.started;
    acc.completed += shard.completed;
    acc.failed += shard.failed;
    acc.canceled += shard.canceled;
    return acc;
  }, emptyStats());
}
