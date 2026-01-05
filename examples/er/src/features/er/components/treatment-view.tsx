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
import { Pill, User, CheckCircle, Clock, Loader2 } from "lucide-react";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function TreatmentView({
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
  const medicationTask = humanTasks.find(
    (t) => t.taskType === "administerMedication"
  );
  const medicationStatus = medicationTask?.status || "pending";
  const medications = journeyDetails?.medications ?? [];

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
              <Pill className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Treatment Phase
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Administering medication and monitoring patient
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-600 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
            TREATMENT
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

        {/* Medication Administration */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Pill className="h-5 w-5 text-emerald-500" />
              Medication Administration
            </CardTitle>
            <CardDescription>
              Floor nurse administering prescribed medications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              {medicationStatus === "completed" ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Treatment Complete</span>
                </div>
              ) : medicationStatus === "claimed" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Nurse is providing medications...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Awaiting floor nurse</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {medications.length > 0 && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Pill className="h-5 w-5 text-emerald-500" />
                Medication Log
              </CardTitle>
              <CardDescription>
                Recorded administrations across the patient journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {medications.map((medication) => (
                  <div key={medication._id} className="rounded-lg border border-border/50 p-3">
                    <div className="text-sm font-medium">
                      {medication.source === "daily"
                        ? "Daily Administration"
                        : "Discharge Preparation"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {medication.medicationsAdministered}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <JourneySummary timeline={journeyDetails?.timeline ?? []} />
      </div>
    </div>
  );
}
