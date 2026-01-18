/**
 * Set Budget Task Route - Domain-First Routing
 *
 * TENET-UI-DOMAIN: Route uses projectId (domain ID) for navigation.
 * The workItemId is looked up from the project for workflow execution.
 */
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { Label } from "@repo/ui/components/label";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { DollarSign } from "lucide-react";
import { SpinningLoader } from "@/components/spinning-loader";
import { createPsaTaskComponent } from "@/features/psa/task/createPsaTaskComponent";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const schema = z.object({
  budgetType: z.enum(["TimeAndMaterials", "FixedFee", "Retainer"]),
  laborBudget: z.coerce.number().min(0, "Labor budget must be positive"),
  expenseBudget: z.coerce.number().min(0, "Expense budget must be positive"),
  contingency: z.coerce.number().min(0).max(100, "Contingency must be 0-100%"),
});

const SetBudgetTaskComponent = createPsaTaskComponent({
  workflowTaskName: "setBudget",
  schema,
  getDefaultValues: () => ({
    budgetType: "TimeAndMaterials" as const,
    laborBudget: 0,
    expenseBudget: 0,
    contingency: 10,
  }),
  mapSubmit: ({ values, task }) => ({
    payload: {
      budgetType: values.budgetType,
      laborBudget: Math.round(values.laborBudget * 100), // Convert to cents
      expenseBudget: Math.round(values.expenseBudget * 100), // Convert to cents
      contingency: values.contingency,
      dealId: task.aggregateTableId,
    },
  }),
  renderForm: ({ form, isStarted }) => (
    <>
      <div className="grid gap-2">
        <Label htmlFor="budgetType">Budget Type</Label>
        <Select
          value={form.watch("budgetType")}
          onValueChange={(v) =>
            form.setValue(
              "budgetType",
              v as "TimeAndMaterials" | "FixedFee" | "Retainer"
            )
          }
          disabled={!isStarted}
        >
          <SelectTrigger id="budgetType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TimeAndMaterials">
              Time & Materials - Bill based on actual hours
            </SelectItem>
            <SelectItem value="FixedFee">
              Fixed Fee - Set price for defined scope
            </SelectItem>
            <SelectItem value="Retainer">
              Retainer - Monthly recurring budget
            </SelectItem>
          </SelectContent>
        </Select>
        {form.formState.errors.budgetType && (
          <p className="text-sm text-destructive">
            {form.formState.errors.budgetType.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="laborBudget">Labor Budget ($)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="laborBudget"
              type="number"
              min="0"
              step="100"
              placeholder="0"
              className="pl-9"
              {...form.register("laborBudget")}
              disabled={!isStarted}
            />
          </div>
          {form.formState.errors.laborBudget && (
            <p className="text-sm text-destructive">
              {form.formState.errors.laborBudget.message}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="expenseBudget">Expense Budget ($)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="expenseBudget"
              type="number"
              min="0"
              step="100"
              placeholder="0"
              className="pl-9"
              {...form.register("expenseBudget")}
              disabled={!isStarted}
            />
          </div>
          {form.formState.errors.expenseBudget && (
            <p className="text-sm text-destructive">
              {form.formState.errors.expenseBudget.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contingency">Contingency (%)</Label>
        <Input
          id="contingency"
          type="number"
          min="0"
          max="100"
          step="5"
          placeholder="10"
          {...form.register("contingency")}
          disabled={!isStarted}
        />
        <p className="text-xs text-muted-foreground">
          Buffer percentage for unexpected costs (typically 10-20%)
        </p>
        {form.formState.errors.contingency && (
          <p className="text-sm text-destructive">
            {form.formState.errors.contingency.message}
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-muted/50 p-4">
        <h4 className="text-sm font-medium mb-2">Budget Summary</h4>
        <div className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Labor:</span>
            <span>
              ${(Number(form.watch("laborBudget")) || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expenses:</span>
            <span>
              ${(Number(form.watch("expenseBudget")) || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Contingency ({Number(form.watch("contingency")) || 0}%):
            </span>
            <span>
              $
              {Math.round(
                ((Number(form.watch("laborBudget")) || 0) +
                  (Number(form.watch("expenseBudget")) || 0)) *
                  ((Number(form.watch("contingency")) || 0) / 100)
              ).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between font-medium border-t pt-1 mt-1">
            <span>Total Budget:</span>
            <span>
              $
              {Math.round(
                ((Number(form.watch("laborBudget")) || 0) +
                  (Number(form.watch("expenseBudget")) || 0)) *
                  (1 + (Number(form.watch("contingency")) || 0) / 100)
              ).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </>
  ),
  icon: <DollarSign className="h-8 w-8 text-green-500" />,
  title: "Set Project Budget",
  description: "Define the budget type and allocations for this project",
  formTitle: "Budget Configuration",
  formDescription:
    "Configure the project budget type and allocate funds for labor and expenses.",
  submitButtonText: "Set Budget",
  onSuccess: ({ navigate }) => {
    navigate({ to: "/projects" });
  },
});

export const Route = createFileRoute("/_app/tasks/setbudget/$projectId")({
  component: SetBudgetTask,
});

/**
 * Route component that looks up workItemId from projectId.
 *
 * TENET-UI-DOMAIN: Uses domain ID (projectId) for routing, looks up workItemId for execution.
 */
function SetBudgetTask() {
  const { projectId } = Route.useParams() as { projectId: Id<"projects"> };

  // Look up the work item from the project ID and task type
  const workItem = useQuery(
    api.workflows.dealToDelivery.api.workItems.getWorkItemByProjectAndType,
    { projectId, taskType: "setBudget" }
  );

  // Loading state
  if (workItem === undefined) {
    return <SpinningLoader />;
  }

  // No active work item for this task - redirect to projects page
  if (workItem === null) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-4">
          This task is not currently available for this project.
        </p>
        <Navigate to="/projects" />
      </div>
    );
  }

  return (
    <Suspense fallback={<SpinningLoader />}>
      <SetBudgetTaskComponent workItemId={workItem.workItemId} />
    </Suspense>
  );
}
