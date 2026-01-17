/**
 * SubmitExpense Work Item
 *
 * Submit expense for manager approval.
 *
 * Entry condition: Expense in Draft status with billable status set
 * Exit condition: Expense status changed to "Submitted", manager notified
 *
 * Reference: .review/recipes/psa-platform/specs/08-workflow-expense-tracking.md
 */
import { Builder } from "../../../tasquencer";
import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";
import { startAndClaimWorkItem, cleanupWorkItemOnCancel } from "./helpers";
import { initializeDealWorkItemAuth, updateWorkItemMetadataPayload } from "./helpersAuth";
import { authService } from "../../../authorization";
import { authComponent } from "../../../auth";
import { getExpense, updateExpenseStatus } from "../db/expenses";
import { getRootWorkflowAndDealForWorkItem } from "../db/workItemContext";
import { assertExpenseExists, assertAuthenticatedUser } from "../exceptions";
import { DealToDeliveryWorkItemHelpers } from "../helpers";
import type { Id } from "../../../_generated/dataModel";

// Policy: Requires 'dealToDelivery:expenses:submit' scope
const expensesSubmitPolicy = authService.policies.requireScope(
  "dealToDelivery:expenses:submit"
);

/**
 * Actions for the submitExpense work item.
 *
 * - initialize: Sets up work item metadata with expense context
 * - start: Claims the work item for the current user
 * - complete: Submits expense for approval
 * - fail: Marks the work item as failed
 */
const submitExpenseWorkItemActions = authService.builders.workItemActions
  .initialize(
    z.object({
      expenseId: zid("expenses"),
    }),
    expensesSubmitPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const workItemId = await workItem.initialize();

      // Get deal from workflow context for metadata
      const { deal } = await getRootWorkflowAndDealForWorkItem(
        mutationCtx.db,
        workItemId
      );

      // Validate expense exists and is in Draft status
      const expense = await getExpense(mutationCtx.db, payload.expenseId);
      assertExpenseExists(expense, { expenseId: payload.expenseId });

      if (expense.status !== "Draft") {
        throw new Error(
          `Expense must be in Draft status to submit. Current status: ${expense.status}`
        );
      }

      await initializeDealWorkItemAuth(mutationCtx, workItemId, {
        scope: "dealToDelivery:expenses:submit",
        dealId: deal._id,
        payload: {
          type: "submitExpense",
          taskName: "Submit Expense",
          priority: "normal",
          expenseId: payload.expenseId,
        },
      });
    }
  )
  .start(z.never(), expensesSubmitPolicy, async ({ mutationCtx, workItem }) => {
    await startAndClaimWorkItem(mutationCtx, workItem);
  })
  .complete(
    z.object({
      expenseId: zid("expenses"),
    }),
    expensesSubmitPolicy,
    async ({ mutationCtx, workItem }, payload) => {
      const authUser = await authComponent.safeGetAuthUser(mutationCtx);
      assertAuthenticatedUser(authUser, {
        operation: "submitExpense:complete",
        workItemId: workItem.id,
      });

      const userId = authUser.userId as Id<"users">;

      // Validate expense exists
      const expense = await getExpense(mutationCtx.db, payload.expenseId);
      assertExpenseExists(expense, { expenseId: payload.expenseId });

      // Validate expense belongs to current user
      if (expense.userId !== userId) {
        throw new Error("Cannot submit expenses belonging to other users");
      }

      // Validate expense is in Draft status
      if (expense.status !== "Draft") {
        throw new Error(
          `Expense must be in Draft status to submit. Current status: ${expense.status}`
        );
      }

      // Update status to "Submitted"
      await updateExpenseStatus(mutationCtx.db, payload.expenseId, "Submitted");

      // Update work item metadata
      const metadata = await DealToDeliveryWorkItemHelpers.getWorkItemMetadata(
        mutationCtx.db,
        workItem.id
      );
      if (metadata) {
        await updateWorkItemMetadataPayload(mutationCtx, workItem.id, {
          type: "submitExpense",
          taskName: "Submit Expense",
          priority: "normal",
          expenseId: payload.expenseId,
        });
      }

      // TODO: Notify project manager about submitted expense
      // (deferred:expense-tracking-notifications)

      await workItem.complete();
    }
  )
  .fail(z.any().optional(), expensesSubmitPolicy, async ({ workItem }) => {
    await workItem.fail();
  });

/**
 * The submitExpense work item with actions and lifecycle activities.
 */
export const submitExpenseWorkItem = Builder.workItem("submitExpense")
  .withActions(submitExpenseWorkItemActions.build())
  .withActivities({
    onCanceled: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
    onFailed: async ({ mutationCtx, workItem }) => {
      await cleanupWorkItemOnCancel(mutationCtx, workItem.id);
    },
  });

/**
 * The submitExpense task.
 */
export const submitExpenseTask = Builder.task(submitExpenseWorkItem);
