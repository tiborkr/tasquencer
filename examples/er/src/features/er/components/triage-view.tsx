import type { Doc } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { ClipboardList, User, Clock, CheckCircle, Loader2 } from "lucide-react";
import { JourneySummary } from "./journey-summary";
import type { PatientJourneyDetails, TaskMetadata } from "@/types/er";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function TriageView({
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
  const triageTask = humanTasks.find((t) => t.taskType === "triagePatient");
  const triageStatus = triageTask?.status || "pending";

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
              <ClipboardList className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Patient Triage
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Initial assessment and vital signs evaluation
              </p>
            </div>
          </div>
          <Badge className="bg-amber-500 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
            TRIAGE
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
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground">Admitted</div>
                <div className="font-medium">
                  {new Date(patient._creationTime).toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Triage Status */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <ClipboardList className="h-5 w-5 text-amber-500" />
              Triage Assessment
            </CardTitle>
            <CardDescription>
              Nurse is evaluating patient condition and vital signs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              {triageStatus === "completed" ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Triage Complete</span>
                </div>
              ) : triageStatus === "claimed" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Nurse is assessing the patient...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Awaiting triage nurse</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <JourneySummary timeline={journeyDetails?.timeline ?? []} />
      </div>
    </div>
  );
}
