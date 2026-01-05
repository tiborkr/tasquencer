import type { Doc } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/card";
import { Badge } from "@repo/ui/components/badge";
import { Activity, User, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PatientJourneyDetails, TaskMetadata } from "@/types/er";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function PatientDashboard({
  patient,
  taskStates,
  humanTasks: _humanTasks,
  journeyDetails: _journeyDetails,
}: {
  patient: Doc<"erPatients">;
  taskStates: Record<string, TaskState>;
  humanTasks: TaskMetadata[];
  journeyDetails?: PatientJourneyDetails;
}) {
  const getTaskColor = (state: TaskState) => {
    switch (state) {
      case "completed":
        return "bg-green-500";
      case "started":
        return "bg-blue-500 animate-pulse";
      case "enabled":
        return "bg-yellow-500";
      case "canceled":
        return "bg-red-500";
      case "failed":
        return "bg-red-600";
      default:
        return "bg-gray-300";
    }
  };

  const getTaskLabel = (state: TaskState) => {
    switch (state) {
      case "completed":
        return "✓ Completed";
      case "started":
        return "→ In Progress";
      case "enabled":
        return "◯ Ready";
      case "canceled":
        return "✕ Canceled";
      case "failed":
        return "! Failed";
      default:
        return "○ Waiting";
    }
  };

  const tasks = [
    { key: "triage", label: "Triage" },
    { key: "diagnostics", label: "Diagnostics" },
    { key: "performSurgery", label: "Emergency Surgery" },
    { key: "reviewDiagnostics", label: "Diagnostic Review" },
    { key: "consultCardiologist", label: "Cardiology Consult" },
    { key: "consultNeurologist", label: "Neurology Consult" },
    { key: "gatherConsultations", label: "Gather Consultations" },
    { key: "administerMedication", label: "Administer Medication" },
    { key: "discharge", label: "Discharge" },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{patient.name}</h1>
            <p className="text-muted-foreground">{patient.complaint}</p>
          </div>
        </div>
        <Badge
          variant={
            patient.status === "emergency_surgery" ? "destructive" : "default"
          }
          className="text-lg px-4 py-2"
        >
          {patient.status.replace(/_/g, " ").toUpperCase()}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Care Milestones
          </CardTitle>
          <CardDescription className="flex items-center gap-2 text-xs md:text-sm">
            <Stethoscope className="h-4 w-4" />
            Track which portions of the visit remain outstanding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tasks.map((task) => {
              const state = taskStates[task.key] as TaskState;
              return (
                <div
                  key={task.key}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-lg border",
                    state === "started" && "border-blue-500 bg-blue-50/5",
                    state === "completed" && "border-green-500 bg-green-50/5",
                    state === "canceled" && "border-red-500 bg-red-50/5"
                  )}
                >
                  <div
                    className={cn("h-3 w-3 rounded-full", getTaskColor(state))}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{task.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {getTaskLabel(state)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
