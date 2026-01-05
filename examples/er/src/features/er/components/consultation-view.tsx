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
import { Stethoscope, User, Heart, Brain, ClipboardCheck, CheckCircle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { JourneySummary } from "./journey-summary";

type TaskState =
  | "disabled"
  | "enabled"
  | "started"
  | "completed"
  | "failed"
  | "canceled";

type CompletedConsultation = Doc<"erSpecialistConsultations"> & {
  state: {
    status: "completed";
    initializedAt: number;
    recommendations: string;
    prescribeMedication: boolean;
    completedAt: number;
  };
};

function isCompletedConsultation(
  consultation: Doc<"erSpecialistConsultations">
): consultation is CompletedConsultation {
  return consultation.state.status === "completed";
}

export function ConsultationView({
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
  const cardioTask = humanTasks.find(
    (t) =>
      t.taskType === "specialistConsult" &&
      t.payload &&
      t.payload.type === "specialistConsult" &&
      t.payload.specialty === "cardiologist"
  );
  const neuroTask = humanTasks.find(
    (t) =>
      t.taskType === "specialistConsult" &&
      t.payload &&
      t.payload.type === "specialistConsult" &&
      t.payload.specialty === "neurologist"
  );

  const cardioStatus = cardioTask?.status;
  const neuroStatus = neuroTask?.status;
  const gatherState = taskStates.gatherConsultations;
  const completedConsultations =
    journeyDetails?.consultations.filter(isCompletedConsultation) ?? [];

  const consultations = [
    cardioStatus && {
      key: "cardio",
      state: cardioStatus,
      label: "Cardiology",
      icon: Heart,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    neuroStatus && {
      key: "neuro",
      state: neuroStatus,
      label: "Neurology",
      icon: Brain,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ].filter(Boolean) as Array<{
    key: string;
    state: string;
    label: string;
    icon: typeof Heart;
    color: string;
    bgColor: string;
  }>;

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500 dark:bg-violet-500/20">
              <Stethoscope className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Specialist Consultations
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Consult specialists and capture their recommendations
              </p>
            </div>
          </div>
          <Badge className="bg-violet-600 text-white text-sm px-4 py-1.5 shadow-sm shrink-0 self-start">
            CONSULTATION
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

        {/* Active Consultations */}
        <div className="grid md:grid-cols-2 gap-4">
          {consultations.map((consult) => (
            <Card key={consult.key} className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <consult.icon className={cn("h-5 w-5", consult.color)} />
                  {consult.label} Consultation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-8">
                  {consult.state === "completed" ? (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Completed</span>
                    </div>
                  ) : consult.state === "claimed" ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Specialist evaluating patient...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">Awaiting specialist</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {gatherState && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ClipboardCheck className="h-5 w-5 text-blue-500" />
                Consultation Status
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {gatherState === "completed"
                ? "All requested consultations are back with recommendations."
                : gatherState === "started"
                  ? "Consultations in progress — waiting on remaining specialists."
                  : "Consultation tasks are queued and ready to start."}
            </CardContent>
          </Card>
        )}

        {completedConsultations.length > 0 && (
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Consultation Outcomes</CardTitle>
              <CardDescription>
                Recommendations recorded by specialists
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {completedConsultations.map((consultation) => (
                  <div key={consultation._id} className="rounded-lg border border-border/50 p-4 space-y-2">
                    <div className="font-medium capitalize text-sm">
                      {consultation.specialty}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {consultation.state.recommendations}
                    </div>
                    <div className="text-xs text-muted-foreground/80">
                      Medication recommended:{" "}
                      {consultation.state.prescribeMedication ? "Yes" : "No"}
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
