/**
 * CloseProject Work Item
 *
 * Officially close the project and verify completion criteria.
 *
 * Entry condition: All billing complete, all invoices paid (or marked)
 * Exit condition: Project status = "Completed", metrics captured
 *
 * Reference: .review/recipes/psa-platform/specs/13-workflow-close-phase.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth, updateWorkItemMetadataPayload } from "./helpersAuth";
import { authService } from "../../../authorization";
import { authComponent } from "../../../auth";
import { getProject, updateProjectStatus } from "../db/projects";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertProjectExists, assertAuthenticatedUser } from "../exceptions";

// Policy: Requires 'dealToDelivery:projects:close' scope
const projectsClosePolicy = authService.policies.requireScope(
  "dealToDelivery:projects:close"
);

/**
 * Actions for the closeProject work item.
 */
const closeProjectWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      projectId: zid("projects"),
    }),
    projectsClosePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      // Get deal from workflow context for metadata
      const { deal } = await getRootWorkflowAndDealForWorkItem(
        mutationCtx.db,
        workItemId
      );

      // Validate project exists
      const project = await getProject(mutationCtx.db, payload.projectId);
      assertProjectExists(project, { projectId: payload.projectId });

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:projects:close",
        dealId: deal._id,
        payload: {
          type: "closeProject",
          taskName: "Close Project",
          priority: "normal",
        },
      });
    }
  )
  .start(z.never(), projectsClosePolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      projectId: zid("projects"),
      closeDate: z.number(),
      completionStatus: z.enum(["completed", "cancelled", "on_hold_indefinitely"]),
      closureNotes: z.string().optional(),
      finalDeliverables: z.array(z.object({
        name: z.string(),
        description: z.string(),
        deliveredAt: z.number(),
      })).optional(),
      acknowledgements: z.object({
        clientSignoff: z.boolean().optional(),
        clientSignoffDate: z.number().optional(),
        clientSignoffBy: z.string().optional(),
      }).optional(),
    }),
    projectsClosePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "closeProject:complete",
        workItemId: workItem.id,
      });

      // Validate project exists
      const project = await getProject(mutationCtx.db, payload.projectId);
      assertProjectExists(project, { projectId: payload.projectId });

      // In a real implementation, we would:
      // 1. Verify closure criteria (all tasks, time entries, expenses approved)
      // 2. Verify all invoices sent and paid
      // 3. Cancel pending bookings
      // 4. Calculate final metrics (revenue, cost, profit, etc.)

      // Update project status
      const statusMap = {
        completed: "Completed" as const,
        cancelled: "Archived" as const,
        on_hold_indefinitely: "OnHold" as const,
      };
      await updateProjectStatus(mutationCtx.db, payload.projectId, statusMap[payload.completionStatus]);

      // Update the project end date
      await mutationCtx.db.patch(payload.projectId, {
        endDate: payload.closeDate,
      });

      // Update metadata
      await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
        type: "closeProject",
        taskName: "Close Project",
        priority: "normal",
      });

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), projectsClosePolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The closeProject work item with actions and lifecycle activities.
 */
export const closeProjectWorkItem = Builder.workItem("closeProject")
  .withActions(closeProjectWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The closeProject task.
 */
export const closeProjectTask = Builder.task(closeProjectWorkItem);
