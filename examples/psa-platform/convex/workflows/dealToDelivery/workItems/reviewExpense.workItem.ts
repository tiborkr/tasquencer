/**
 * ReviewExpense Work Item
 *
 * Manager reviews submitted expense and decides to approve or reject.
 * Routes to approveExpense or rejectExpense based on decision.
 *
 * Entry condition: Expense exists with status = "Submitted", reviewer has approval scope
 * Exit condition: Decision recorded, routed to approve or reject work item
 *
 * Reference: .review/recipes/psa-platform/specs/10-workflow-expense-approval.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth, updateWorkItemMetadataPayload } from "./helpersAuth";
import { authService } from "../../../authorization";
import { authComponent } from "../../../auth";
import { getExpense } from "../db/expenses";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertExpenseExists, assertAuthenticatedUser } from "../exceptions";
import type { Id } from "../../../_generated/dataModel";

// Policy: Requires 'dealToDelivery:expenses:approve' scope
const expensesApprovePolicy = authService.policies.requireScope(
  "dealToDelivery:expenses:approve"
);

/**
 * Actions for the reviewExpense work item.
 *
 * - initialize: Sets up work item metadata with expense context
 * - start: Claims the work item for the reviewer
 * - complete: Records approval decision and routes accordingly
 * - fail: Marks the work item as failed
 */
const reviewExpenseWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      expenseId: zid("expenses"),
    }),
    expensesApprovePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      // Get deal from workflow context for metadata
      const { deal } = await getRootWorkflowAndDealForWorkItem(
        mutationCtx.db,
        workItemId
      );

      // Validate expense exists and is in Submitted status
      const expense = await getExpense(mutationCtx.db, payload.expenseId);
      assertExpenseExists(expense, { expenseId: payload.expenseId });

      if (expense.status !== "Submitted") {
        throw new Error(
          `Expense must be in Submitted status to review. Current status: ${expense.status}`
        );
      }

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:expenses:approve",
        dealId: deal._id,
        payload: {
          type: "reviewExpense",
          taskName: "Review Expense",
          priority: "normal",
          expenseId: payload.expenseId,
        },
      });
    }
  )
  .start(z.never(), expensesApprovePolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      expenseId: zid("expenses"),
      decision: z.enum(["approve", "reject"]),
      comments: z.string().optional(),
      adjustments: z.object({
        billable: z.boolean().optional(),
        markupRate: z.number().min(1.0).max(1.5).optional(),
        category: z.string().optional(),
      }).optional(),
    }),
    expensesApprovePolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "reviewExpense:complete",
        workItemId: workItem.id,
      });

      const reviewerId = authUser.userId as Id<"users">;

      // Validate expense exists and is in Submitted status
      const expense = await getExpense(mutationCtx.db, payload.expenseId);
      assertExpenseExists(expense, { expenseId: payload.expenseId });

      if (expense.status !== "Submitted") {
        throw new Error(
          `Expense must be in Submitted status to review. Current status: ${expense.status}`
        );
      }

      // Prevent self-approval (business rule)
      if (expense.userId === reviewerId) {
        throw new Error(
          "Cannot approve your own expenses. Please request another manager to review."
        );
      }

      // Store the decision in work item metadata for routing
      // The workflow router will read this to determine the next task (approve vs reject)
      await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
        type: "reviewExpense",
        taskName: "Review Expense",
        priority: "normal",
        expenseId: payload.expenseId,
        decision: payload.decision,
      });

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), expensesApprovePolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The reviewExpense work item with actions and lifecycle activities.
 */
export const reviewExpenseWorkItem = Builder.workItem("reviewExpense")
  .withActions(reviewExpenseWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The reviewExpense task.
 */
export const reviewExpenseTask = Builder.task(reviewExpenseWorkItem);
