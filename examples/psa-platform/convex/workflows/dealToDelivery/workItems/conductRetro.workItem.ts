/**
 * ConductRetro Work Item
 *
 * Document retrospective learnings from the project.
 *
 * Entry condition: Project has been closed
 * Exit condition: Retrospective documented, project scorecard calculated
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
import { getProject } from "../db/projects";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertProjectExists, assertAuthenticatedUser } from "../exceptions";

// Policy: Requires 'dealToDelivery:projects:view:own' scope
const projectsViewPolicy = authService.policies.requireScope(
  "dealToDelivery:projects:view:own"
);

const retroCategory = z.enum(["timeline", "budget", "quality", "communication", "process", "other"]);
const retroImpact = z.enum(["high", "medium", "low"]);

/**
 * Actions for the conductRetro work item.
 */
const conductRetroWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      projectId: zid("projects"),
    }),
    projectsViewPolicy,
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
        scope: "dealToDelivery:projects:view:own",
        dealId: deal._id,
        payload: {
          type: "conductRetro",
          taskName: "Conduct Retrospective",
          priority: "normal",
        },
      });
    }
  )
  .start(z.never(), projectsViewPolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      projectId: zid("projects"),
      retrospective: z.object({
        successes: z.array(z.object({
          category: retroCategory,
          description: z.string(),
          impact: retroImpact,
        })),
        improvements: z.array(z.object({
          category: retroCategory,
          description: z.string(),
          impact: retroImpact,
          recommendation: z.string().optional(),
        })),
        keyLearnings: z.array(z.string()),
        recommendations: z.array(z.string()),
        clientSatisfaction: z.object({
          rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
          feedback: z.string().optional(),
          wouldRecommend: z.boolean().optional(),
          testimonialProvided: z.boolean().optional(),
        }).optional(),
        teamFeedback: z.array(z.object({
          userId: zid("users"),
          feedback: z.string(),
          anonymous: z.boolean(),
        })).optional(),
      }),
      participants: z.array(zid("users")).optional(),
    }),
    projectsViewPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "conductRetro:complete",
        workItemId: workItem.id,
      });

      // Validate project exists
      const project = await getProject(mutationCtx.db, payload.projectId);
      assertProjectExists(project, { projectId: payload.projectId });

      // In a real implementation, we would:
      // 1. Store retrospective with project
      // 2. Tag learnings for searchability
      // 3. Update organization knowledge base
      // 4. Calculate and store project scorecard
      // 5. Archive project if auto-archive enabled

      // Update metadata
      await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
        type: "conductRetro",
        taskName: "Conduct Retrospective",
        priority: "normal",
      });

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), projectsViewPolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The conductRetro work item with actions and lifecycle activities.
 */
export const conductRetroWorkItem = Builder.workItem("conductRetro")
  .withActions(conductRetroWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The conductRetro task.
 */
export const conductRetroTask = Builder.task(conductRetroWorkItem);
