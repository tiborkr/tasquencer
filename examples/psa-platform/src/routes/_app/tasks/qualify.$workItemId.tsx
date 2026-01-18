import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { Checkbox } from "@repo/ui/components/checkbox";
import { UserCheck } from "lucide-react";
import { SpinningLoader } from "@/components/spinning-loader";
import { createPsaTaskComponent } from "@/features/psa/task/createPsaTaskComponent";

const schema = z.object({
  budgetConfirmed: z.boolean(),
  authorityConfirmed: z.boolean(),
  needConfirmed: z.boolean(),
  timelineConfirmed: z.boolean(),
  notes: z.string().min(10, "Notes must be at least 10 characters"),
});

const QualifyLeadTaskComponent = createPsaTaskComponent({
  workflowTaskName: "qualifyLead",
  schema,
  getDefaultValues: () => ({
    budgetConfirmed: false,
    authorityConfirmed: false,
    needConfirmed: false,
    timelineConfirmed: false,
    notes: "",
  }),
  mapSubmit: ({ values, task }) => ({
    payload: {
      budgetConfirmed: values.budgetConfirmed,
      authorityConfirmed: values.authorityConfirmed,
      needConfirmed: values.needConfirmed,
      timelineConfirmed: values.timelineConfirmed,
      notes: values.notes,
      dealId: task.aggregateTableId,
    },
  }),
  renderForm: ({ form, isStarted }) => (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Evaluate the lead against BANT criteria to determine qualification
          status.
        </p>

        <div className="grid gap-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="budgetConfirmed"
              checked={form.watch("budgetConfirmed")}
              onCheckedChange={(checked) =>
                form.setValue("budgetConfirmed", checked === true)
              }
              disabled={!isStarted}
            />
            <div className="space-y-1">
              <Label htmlFor="budgetConfirmed" className="font-medium">
                Budget
              </Label>
              <p className="text-sm text-muted-foreground">
                Does the prospect have an allocated budget for this solution?
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="authorityConfirmed"
              checked={form.watch("authorityConfirmed")}
              onCheckedChange={(checked) =>
                form.setValue("authorityConfirmed", checked === true)
              }
              disabled={!isStarted}
            />
            <div className="space-y-1">
              <Label htmlFor="authorityConfirmed" className="font-medium">
                Authority
              </Label>
              <p className="text-sm text-muted-foreground">
                Are you speaking with a decision-maker or key influencer?
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="needConfirmed"
              checked={form.watch("needConfirmed")}
              onCheckedChange={(checked) =>
                form.setValue("needConfirmed", checked === true)
              }
              disabled={!isStarted}
            />
            <div className="space-y-1">
              <Label htmlFor="needConfirmed" className="font-medium">
                Need
              </Label>
              <p className="text-sm text-muted-foreground">
                Does the prospect have a clear need your solution addresses?
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="timelineConfirmed"
              checked={form.watch("timelineConfirmed")}
              onCheckedChange={(checked) =>
                form.setValue("timelineConfirmed", checked === true)
              }
              disabled={!isStarted}
            />
            <div className="space-y-1">
              <Label htmlFor="timelineConfirmed" className="font-medium">
                Timeline
              </Label>
              <p className="text-sm text-muted-foreground">
                Is there a defined timeline or urgency to make a decision?
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Qualification Notes</Label>
        <Textarea
          id="notes"
          placeholder="Enter detailed notes about your qualification assessment..."
          rows={4}
          {...form.register("notes")}
          disabled={!isStarted}
        />
        {form.formState.errors.notes && (
          <p className="text-sm text-destructive">
            {form.formState.errors.notes.message}
          </p>
        )}
      </div>
    </>
  ),
  icon: <UserCheck className="h-8 w-8 text-blue-500" />,
  title: "Qualify Lead",
  description: "Evaluate the lead using BANT criteria",
  formTitle: "BANT Qualification Assessment",
  formDescription:
    "Check all criteria that apply and provide detailed notes on your qualification assessment.",
  submitButtonText: "Qualify Lead",
  onSuccess: ({ navigate, task }) => {
    navigate({ to: "/deals/$dealId", params: { dealId: task.aggregateTableId } });
  },
});

export const Route = createFileRoute("/_app/tasks/qualify/$workItemId")({
  component: QualifyLeadTask,
});

function QualifyLeadTask() {
  const { workItemId } = Route.useParams() as { workItemId: Id<"tasquencerWorkItems"> };
  return (
    <Suspense fallback={<SpinningLoader />}>
      <QualifyLeadTaskComponent workItemId={workItemId} />
    </Suspense>
  );
}
