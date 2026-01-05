import type { Doc } from "@/convex/_generated/dataModel";
import type { PatientJourneyDetails, TaskMetadata } from "@/types/er";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { CheckCircle, User, Clock, ArrowLeft, FileCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function DischargedView({
  patient,
  taskStates,
  humanTasks: _humanTasks,
  journeyDetails,
}: {
  patient: Doc<"erPatients">;
  taskStates: Record<string, TaskState>;
  humanTasks: TaskMetadata[];
  journeyDetails?: PatientJourneyDetails;
}) {
  const allTasksCompleted = Object.values(taskStates).every(
    (s) => s === "completed" || s === "disabled" || s === "canceled"
  );

  const review = journeyDetails?.latestReview;
  const consultations = journeyDetails?.consultations ?? [];
  const medications = journeyDetails?.medications ?? [];
  const surgeries = journeyDetails?.surgeries ?? [];

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-500/5 to-background dark:from-emerald-500/10">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Success Header */}
        <div className="relative overflow-hidden rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 p-6 dark:bg-emerald-500/5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
                <CheckCircle className="h-7 w-7 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  Patient Discharged
                </h1>
                <p className="text-base md:text-lg text-muted-foreground">
                  ER visit completed successfully
                </p>
              </div>
            </div>
            <Badge className="bg-gray-500 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
              DISCHARGED
            </Badge>
          </div>
        </div>

        {/* Patient Summary */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{patient.name}</CardTitle>
                <CardDescription>{patient.complaint}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground">Status</div>
                <Badge variant="outline" className="text-emerald-600 border-emerald-500/30">
                  Discharged
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Visit Snapshot */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Visit Snapshot
            </CardTitle>
            <CardDescription>
              Admission details and current disposition
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Admitted</span>
                <span className="font-medium">
                  {new Date(patient._creationTime).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline">
                  {allTasksCompleted ? "Complete" : "In Progress"}
                </Badge>
              </div>
              <div className="text-muted-foreground pt-1">
                Ready for discharge with follow-up instructions provided to the
                patient and caregiver.
              </div>
            </div>
          </CardContent>
        </Card>

        {journeyDetails && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">
                Clinical Summary
              </CardTitle>
              <CardDescription>
                Highlights from the patient&apos;s ER journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {review && (
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">Treatment Plan</div>
                    <div className="text-sm">{review.treatmentPlan}</div>
                  </div>
                )}
                {consultations.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-muted-foreground">Consultations</div>
                    <div className="text-sm">
                      {consultations
                        .map((consultation) => consultation.specialty)
                        .join(", ")}
                    </div>
                  </div>
                )}
                {surgeries.length > 0 && (
                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-sm font-medium text-muted-foreground">Emergency Surgery Notes</div>
                    <div className="text-sm">{surgeries[0].notes}</div>
                  </div>
                )}
                {medications.length > 0 && (
                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-sm font-medium text-muted-foreground">Medications Administered</div>
                    <div className="text-sm">
                      {medications
                        .map((medication) => medication.medicationsAdministered)
                        .join(" • ")}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <FileCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="font-medium">Documentation Complete</div>
                <div className="text-sm text-muted-foreground">
                  Confirm that follow-up appointments and prescriptions are in the chart
                  before closing the case.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <JourneySummary timeline={journeyDetails?.timeline ?? []} />

        <div className="flex justify-center pt-2">
          <Link to="/er">
            <Button size="lg" variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Patient List
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
