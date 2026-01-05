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
import { AlertTriangle, Heart, User, Clock, CheckCircle, Loader2, Zap } from "lucide-react";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function EmergencySurgeryView({
  patient,
  taskStates: _taskStates,
  humanTasks,
  journeyDetails,
}: {
  patient: Doc<"erPatients">;
  taskStates: Record<string, TaskState>;
  humanTasks: TaskMetadata[];
  journeyDetails?: PatientJourneyDetails;
}) {
  const surgeryTask = humanTasks.find((t) => t.taskType === "performSurgery");
  const surgeryStatus = surgeryTask?.status || "pending";
  const latestSurgeryNote = journeyDetails?.surgeries?.[0]?.notes;

  return (
    <div className="min-h-full bg-gradient-to-b from-red-500/5 to-background dark:from-red-500/10">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Critical Alert Header */}
        <div className="relative overflow-hidden rounded-xl border-2 border-red-500/50 bg-red-500/10 p-6 dark:bg-red-500/5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-red-500/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-red-500/20 animate-pulse">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <div className="space-y-1">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-red-600 dark:text-red-400">
                  CRITICAL CONDITION
                </h1>
                <p className="text-base md:text-lg text-muted-foreground">
                  Emergency surgical intervention required
                </p>
              </div>
            </div>
            <Badge className="bg-red-600 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start animate-pulse">
              EMERGENCY
            </Badge>
          </div>
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
          <CardContent className="pt-0">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 dark:bg-amber-500/5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
                  <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-amber-600 dark:text-amber-400">
                    X-Ray Critical Finding
                  </div>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    Critical abnormality detected on imaging. Blood work has been
                    automatically canceled. Patient fast-tracked to surgery.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Surgery Status */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Heart className="h-5 w-5 text-red-500" />
              Emergency Surgery
            </CardTitle>
            <CardDescription>
              Surgical team has been notified and is preparing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              {surgeryStatus === "completed" ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Surgery Completed</span>
                </div>
              ) : surgeryStatus === "claimed" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Surgery in progress...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Ready for surgery - awaiting surgeon</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {latestSurgeryNote && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Surgery Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {latestSurgeryNote}
            </CardContent>
          </Card>
        )}

        <JourneySummary timeline={journeyDetails?.timeline ?? []} />
      </div>
    </div>
  );
}
