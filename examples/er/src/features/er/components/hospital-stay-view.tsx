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
import { Bed, Activity, User, Pill, ClipboardCheck, CheckCircle, Clock, Loader2 } from "lucide-react";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

export function HospitalStayView({
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
  const admissionTask = humanTasks.find(
    (t) => t.taskType === "admitToHospital"
  );
  const dailyCheckTask = humanTasks.find(
    (t) => t.taskType === "performDailyCheck"
  );
  const dailyMedicationTask = humanTasks.find(
    (t) => t.taskType === "administerDailyMedication"
  );
  const dischargeTask = humanTasks.find(
    (t) => t.taskType === "prepareForDischarge"
  );

  const admissionStatus = admissionTask?.status || "pending";
  const dailyCheckStatus = dailyCheckTask?.status || "pending";
  const dailyMedicationStatus = dailyMedicationTask?.status || "pending";
  const dischargeStatus = dischargeTask?.status || "pending";

  const showDischargePrepSection =
    taskStates.prepareForDischarge &&
    taskStates.prepareForDischarge !== "disabled";

  const medications = journeyDetails?.medications ?? [];
  const dailyMedications = medications.filter((m) => m.source === "daily");

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 dark:bg-cyan-500/20">
              <Bed className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Hospital Stay
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Post-surgery recovery and monitoring
              </p>
            </div>
          </div>
          <Badge className="bg-cyan-600 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
            INPATIENT
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

        {/* Hospital Admission */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Bed className="h-5 w-5 text-cyan-500" />
              Hospital Admission
            </CardTitle>
            <CardDescription>
              Admissions clerk assigns patient to ward and room
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              {admissionStatus === "completed" ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Admitted to Ward</span>
                </div>
              ) : admissionStatus === "claimed" ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing admission...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Awaiting admission</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Daily Care Cycle */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Daily Check */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-5 w-5 text-blue-500" />
                Daily Check
              </CardTitle>
              <CardDescription>Ward physician assessment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8">
                {dailyCheckStatus === "completed" ? (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Assessment Complete</span>
                  </div>
                ) : dailyCheckStatus === "claimed" ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Physician assessing...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Awaiting physician</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Daily Medication */}
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Pill className="h-5 w-5 text-green-500" />
                Daily Medication
              </CardTitle>
              <CardDescription>Routine medication administration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8">
                {dailyMedicationStatus === "completed" ? (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Medications Given</span>
                  </div>
                ) : dailyMedicationStatus === "claimed" ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Administering medications...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Awaiting nurse</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Discharge Preparation */}
        {showDischargePrepSection && (
          <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ClipboardCheck className="h-5 w-5 text-emerald-500" />
                Discharge Preparation
              </CardTitle>
              <CardDescription>
                Patient is ready to leave the hospital
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8">
                {dischargeStatus === "completed" ? (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Discharge Complete</span>
                  </div>
                ) : dischargeStatus === "claimed" ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Preparing discharge paperwork...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Ready for discharge</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Medication Log */}
        {dailyMedications.length > 0 && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Pill className="h-5 w-5 text-green-500" />
                Daily Medication Log
              </CardTitle>
              <CardDescription>
                Medications administered during hospital stay
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dailyMedications.map((medication) => (
                  <div key={medication._id} className="rounded-lg border border-border/50 p-3">
                    <div className="text-sm font-medium">Daily Administration</div>
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
