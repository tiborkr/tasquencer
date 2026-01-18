import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { Checkbox } from "@repo/ui/components/checkbox";
import { CalendarCheck } from "lucide-react";
import { SpinningLoader } from "@/components/spinning-loader";
import { createPsaTaskComponent } from "@/features/psa/task/createPsaTaskComponent";

const schema = z.object({
  confirmed: z.boolean().refine((val) => val === true, {
    message: "You must confirm the bookings to proceed",
  }),
  notes: z.string().optional(),
});

const ConfirmBookingsTaskComponent = createPsaTaskComponent({
  workflowTaskName: "confirmBookings",
  schema,
  getDefaultValues: () => ({
    confirmed: false,
    notes: "",
  }),
  mapSubmit: ({ values, task }) => ({
    payload: {
      confirmed: values.confirmed,
      notes: values.notes || "",
      dealId: task.aggregateTableId,
    },
  }),
  renderForm: ({ form, isStarted }) => (
    <>
      <div className="rounded-lg border bg-muted/50 p-4 mb-4">
        <h4 className="text-sm font-medium mb-2">Confirmation Summary</h4>
        <p className="text-sm text-muted-foreground">
          You are about to confirm the tentative resource bookings for this
          project. Once confirmed, the allocated team members will be notified
          and the project status will be updated to Active.
        </p>
      </div>

      <div className="flex items-start space-x-3">
        <Checkbox
          id="confirmed"
          checked={form.watch("confirmed") === true}
          onCheckedChange={(checked) =>
            form.setValue("confirmed", checked === true)
          }
          disabled={!isStarted}
        />
        <div className="space-y-1">
          <Label htmlFor="confirmed" className="font-medium">
            I confirm these resource allocations
          </Label>
          <p className="text-sm text-muted-foreground">
            By checking this box, you confirm that the tentative bookings are
            approved and should be converted to confirmed status.
          </p>
        </div>
      </div>
      {form.formState.errors.confirmed && (
        <p className="text-sm text-destructive">
          {form.formState.errors.confirmed.message}
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor="notes">Additional Notes (Optional)</Label>
        <Textarea
          id="notes"
          placeholder="Enter any notes about the resource allocation decisions..."
          rows={3}
          {...form.register("notes")}
          disabled={!isStarted}
        />
      </div>
    </>
  ),
  icon: <CalendarCheck className="h-8 w-8 text-cyan-500" />,
  title: "Confirm Resource Bookings",
  description: "Finalize the tentative resource allocations for this project",
  formTitle: "Resource Confirmation",
  formDescription:
    "Review and confirm the tentative bookings to activate the project team.",
  submitButtonText: "Confirm Bookings",
  onSuccess: ({ navigate }) => {
    navigate({ to: "/projects" });
  },
});

export const Route = createFileRoute(
  "/_app/tasks/confirmbookings/$workItemId"
)({
  component: ConfirmBookingsTask,
});

function ConfirmBookingsTask() {
  const { workItemId } = Route.useParams() as { workItemId: Id<"tasquencerWorkItems"> };
  return (
    <Suspense fallback={<SpinningLoader />}>
      <ConfirmBookingsTaskComponent workItemId={workItemId} />
    </Suspense>
  );
}
