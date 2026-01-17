/**
 * PauseWork Work Item
 *
 * Pauses project work pending budget resolution.
 * Updates project status to OnHold and pauses specified tasks.
 *
 * Entry condition: Budget overrun detected (> 90%)
 * Exit condition: Project/tasks paused, team notified
 *
 * Reference: .review/recipes/psa-platform/specs/06-workflow-execution-phase.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth } from "./helpersAuth";
import { authService } from "../../../authorization";
import { getProject, updateProjectStatus } from "../db/projects";
import { listTasksByProject, updateTaskStatus } from "../db/tasks";
import { getRootWorkflowAndProjectForWorkItem } from "../db/workItemContext";
import { DealToDeliveryWorkItemHelpers } from "../helpers";
import { assertProjectExists } from "../exceptions";
import type { Id, Doc } from "../../../_generated/dataModel";

// Policy: Requires 'dealToDelivery:projects:edit:own' scope
const projectsEditPolicy = authService.policies.requireScope(
  "dealToDelivery:projects:edit:own"
);

/**
 * Actions for the pauseWork work item.
 *
 * - initialize: Sets up work item metadata with project context
 * - start: Claims the work item for the current user
 * - complete: Pauses project and tasks, notifies team
 * - fail: Marks the work item as failed
 */
const pauseWorkWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      projectId: zid("projects"),
    }),
    projectsEditPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      const project = await getProject(mutationCtx.db, payload.projectId);
      assertProjectExists(project, { projectId: payload.projectId });

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:projects:edit:own",
        dealId: project.dealId!,
        payload: {
          type: "pauseWork",
          taskName: "Pause Work",
          priority: "high",
          previousStatus: project.status, // Store for rollback
        },
      });
    }
  )
  .start(z.never(), projectsEditPolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      projectId: zid("projects"),
      reason: z.string().min(1),
      notifyTeam: z.boolean().default(true),
      pausedTaskIds: z.array(zid("tasks")).optional(),
    }),
    projectsEditPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const { project } = await getRootWorkflowAndProjectForWorkItem(
        mutationCtx.db,
        workItem.id
      );

      if (project._id !== payload.projectId) {
        throw new Error(
          `Project mismatch: expected ${project._id}, got ${payload.projectId}`
        );
      }

      // Update project status to OnHold
      await updateProjectStatus(mutationCtx.db, project._id, "OnHold");

      // Get tasks to pause - either specified or all in-progress
      let tasksToUpdate: Id<"tasks">[] = [];

      if (payload.pausedTaskIds && payload.pausedTaskIds.length > 0) {
        tasksToUpdate = payload.pausedTaskIds;
      } else {
        // Pause all "InProgress" tasks
        const allTasks = await listTasksByProject(mutationCtx.db, project._id);
        tasksToUpdate = allTasks
          .filter((t) => t.status === "InProgress")
          .map((t) => t._id);
      }

      // Update task statuses to OnHold
      let pausedTaskCount = 0;
      for (const taskId of tasksToUpdate) {
        await updateTaskStatus(mutationCtx.db, taskId, "OnHold");
        pausedTaskCount++;
      }

      // TODO: Send notifications to team if notifyTeam is true
      // This would be done via a scheduled action
      // (deferred:execution-phase-notifications)
      if (payload.notifyTeam) {
        console.log(
          `Pause notification: Project ${project._id} paused. ` +
            `Reason: ${payload.reason}. ` +
            `${pausedTaskCount} task(s) affected.`
        );
      }

      // Log the pause event
      console.log(
        `Project ${project._id} paused: ${pausedTaskCount} tasks on hold. ` +
          `Reason: ${payload.reason}`
      );

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), projectsEditPolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * Cleanup function that reverts project status when work item is canceled.
 */
async function cleanupPauseWorkOnCancel(
  mutationCtx: Parameters<typeof cleanupWorkItemOnCancel>[0],
  workItemId: Id<"tasquencerWorkItems">
): Promise<void> {
  const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
    mutationCtx.db,
    workItemId
  );

  if (metadata) {
    const payload = metadata.payload as Doc<"dealToDeliveryWorkItems">["payload"] & {
      previousStatus?: Doc<"projects">["status"];
    };

    if (payload.type === "pauseWork" && payload.previousStatus) {
      // Revert project status
      const dealId = metadata.aggregateTableId as Id<"deals">;
      const deal = await mutationCtx.db.get(dealId);
      if (deal) {
        // Get project through deal
        const projects = await mutationCtx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", deal.organizationId)
          )
          .filter((q) => q.eq(q.field("dealId"), deal._id))
          .first();

        if (projects) {
          await updateProjectStatus(
            mutationCtx.db,
            projects._id,
            payload.previousStatus
          );
        }
      }
    }

    await mutationCtx.db.delete(metadata._id);
  }
}

/**
 * The pauseWork work item with actions and lifecycle activities.
 */
export const pauseWorkWorkItem = Builder.workItem("pauseWork")
  .withActions(pauseWorkWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupPauseWorkOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupPauseWorkOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The pauseWork task.
 */
export const pauseWorkTask = Builder.task(pauseWorkWorkItem);
