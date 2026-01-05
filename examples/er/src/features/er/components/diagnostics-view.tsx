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
import { Microscope, Scan, User, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function DiagnosticsView({
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
  const xrayTask = humanTasks.find((t) => t.taskType === "conductXRay");
  const bloodTask = humanTasks.find((t) => t.taskType === "analyzeBloodSample");

  const getHumanTaskStatus = (
    taskName: string,
    humanTask: TaskMetadata | undefined
  ): "pending" | "claimed" | "completed" | "canceled" => {
    if (humanTask) {
      return humanTask.status;
    }
    const workflowTaskState = taskStates[taskName];
    if (workflowTaskState === "canceled") {
      return "canceled";
    }
    return "pending";
  };

  const xrayStatus = getHumanTaskStatus("conductXRay", xrayTask);
  const bloodStatus = getHumanTaskStatus("analyzeBloodSample", bloodTask);
  const diagnostics = journeyDetails?.diagnostics;

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/20">
              <Microscope className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Diagnostic Testing
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Imaging and labs to understand the patient&apos;s condition.
              </p>
            </div>
          </div>
          <Badge className="bg-blue-600 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
            DIAGNOSTICS
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

        {/* Parallel Diagnostics */}
        <div className="grid md:grid-cols-2 gap-4">
          <DiagnosticCard
            icon={Scan}
            iconColor="text-purple-500"
            title="X-Ray Imaging"
            status={xrayStatus}
            statusLabels={{
              pending: "Awaiting Radiologist",
              claimed: "Radiologist analyzing images...",
              completed: "Completed",
              canceled: "Canceled",
            }}
          />

          <DiagnosticCard
            icon={Microscope}
            iconColor="text-teal-500"
            title="Blood Work Analysis"
            status={bloodStatus}
            statusLabels={{
              pending: "Awaiting Lab Technician",
              claimed: "Lab analyzing blood sample...",
              completed: "Completed",
              canceled: "Canceled",
            }}
          />
        </div>

        {/* Diagnostic Findings */}
        {diagnostics && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">
                Latest Diagnostic Findings
              </CardTitle>
              <CardDescription>
                Recorded results from completed diagnostic tasks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <FindingItem
                  label="X-Ray Findings"
                  value={diagnostics.xrayFindings ?? "Pending"}
                  isPending={!diagnostics.xrayFindings}
                />
                <FindingItem
                  label="Critical Indicators"
                  value={diagnostics.xrayIsCritical ? "Critical" : "Stable"}
                  variant={diagnostics.xrayIsCritical ? "destructive" : "success"}
                />
                <FindingItem
                  label="Blood Work"
                  value={diagnostics.bloodResults ?? "Pending"}
                  isPending={!diagnostics.bloodResults}
                />
                <FindingItem
                  label="Status"
                  value={diagnostics.status.replace(/_/g, " ")}
                  className="capitalize"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <JourneySummary timeline={journeyDetails?.timeline ?? []} />
      </div>
    </div>
  );
}

function DiagnosticCard({
  icon: Icon,
  iconColor,
  title,
  status,
  statusLabels,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  status: "pending" | "claimed" | "completed" | "canceled";
  statusLabels: Record<string, string>;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-8">
          {status === "completed" ? (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">{statusLabels.completed}</span>
            </div>
          ) : status === "canceled" ? (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">{statusLabels.canceled}</span>
            </div>
          ) : status === "claimed" ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{statusLabels.claimed}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{statusLabels.pending}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FindingItem({
  label,
  value,
  isPending,
  variant,
  className,
}: {
  label: string;
  value: string;
  isPending?: boolean;
  variant?: "destructive" | "success";
  className?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div
        className={`text-sm ${
          isPending
            ? "text-muted-foreground/60 italic"
            : variant === "destructive"
              ? "text-red-600 dark:text-red-400 font-medium"
              : variant === "success"
                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                : ""
        } ${className ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}
