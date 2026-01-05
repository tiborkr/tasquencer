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
import { FileSearch, User, CheckCircle, Clock, Loader2 } from "lucide-react";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function ReviewView({
  patient,
  taskStates,
  humanTasks,
  journeyDetails,
}: {
  patient: Doc<"erPatients">;
  taskStates: Record<string, TaskState>;
  humanTasks: TaskMetadata[];
  journeyDetails?: PatientJourneyDetails;
}) {
  const reviewTask = humanTasks.find((t) => t.taskType === "reviewDiagnostics");
  const reviewStatus = reviewTask?.status || "pending";
  const diagnosticsState = taskStates.diagnostics;
  const latestReview = journeyDetails?.latestReview;

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <FileSearch className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Diagnostic Review
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Senior doctor analyzing test results
              </p>
            </div>
          </div>
          <Badge className="bg-indigo-600 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
            REVIEW
          </Badge>
        </div>

        {/* Patient Info */}
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
        </Card>

        {/* Diagnostics Complete */}
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Diagnostics Completed</div>
                <div className="text-sm text-muted-foreground">
                  X-Ray and blood work results are available for review
                </div>
              </div>
              <Badge variant="outline" className="capitalize">
                {diagnosticsState?.replace(/_/g, " ")}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Review Status */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <FileSearch className="h-5 w-5 text-indigo-500" />
              Doctor Review
            </CardTitle>
            <CardDescription>
              Senior doctor is determining treatment plan and consultation needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              {reviewStatus === "completed" ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Review Complete</span>
                </div>
              ) : reviewStatus === "claimed" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Doctor reviewing diagnostic results...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Awaiting senior doctor review</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {latestReview && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Treatment Plan</CardTitle>
              <CardDescription>
                Authored during the diagnostic review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Plan</div>
                  <div className="text-sm">{latestReview.treatmentPlan}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Consultations Requested</div>
                  <div className="text-sm">
                    {latestReview.consultationsNeeded.length > 0
                      ? latestReview.consultationsNeeded.join(", ")
                      : "None"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Medication Prescribed</div>
                  <div className="text-sm">
                    {latestReview.prescribeMedication ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <JourneySummary timeline={journeyDetails?.timeline ?? []} />
      </div>
    </div>
  );
}
