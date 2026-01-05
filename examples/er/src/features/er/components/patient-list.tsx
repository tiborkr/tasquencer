import { Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Clock, UserPlus, Users } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { Doc } from "@/convex/_generated/dataModel";
import { useErPatients } from "../hooks/useErPatients";
import { PatientStatusBadge } from "./patient-status";

export function PatientListPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="px-6 py-8 md:px-8 lg:px-10">
        <PatientListHeader />
        <Suspense fallback={<PatientListSkeleton />}>
          <PatientListContent />
        </Suspense>
      </div>
    </div>
  );
}

function PatientListHeader() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
          <Activity className="h-4 w-4 text-primary" />
          Emergency Department
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Current Patients
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-xl">
          See who is in care, their presenting symptoms, and jump directly into
          charting.
        </p>
      </div>
      <Link to="/er/new" className="shrink-0">
        <Button size="lg" className="gap-2 shadow-sm">
          <UserPlus className="h-4 w-4" />
          Admit Patient
        </Button>
      </Link>
    </div>
  );
}

function PatientListContent() {
  const patients = useErPatients();

  if (patients.length === 0) {
    return <EmptyPatientState />;
  }

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {patients.map((patient) => (
        <PatientCard key={patient._id} patient={patient} />
      ))}
    </div>
  );
}

function EmptyPatientState() {
  return (
    <div className="mt-16 flex flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Users className="h-8 w-8 text-muted-foreground/60" />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-medium">No patients are currently admitted</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Admit a new patient to begin documenting their course of care.
        </p>
      </div>
      <Link to="/er/new" className="mt-2">
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Admit First Patient
        </Button>
      </Link>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusBorderColor(status: string): string {
  switch (status) {
    case "emergency_surgery":
      return "border-l-red-500";
    case "triage":
      return "border-l-amber-500";
    case "diagnostics":
      return "border-l-blue-500";
    case "review":
      return "border-l-indigo-500";
    case "consultation":
      return "border-l-violet-500";
    case "treatment":
      return "border-l-emerald-500";
    case "hospital_stay":
      return "border-l-cyan-500";
    case "discharged":
      return "border-l-gray-400";
    default:
      return "border-l-primary";
  }
}

function PatientCard({ patient }: { patient: Doc<"erPatients"> }) {
  const initials = getInitials(patient.name);
  const borderColor = getStatusBorderColor(patient.status);

  return (
    <Card
      className={`group flex h-full flex-col border-l-4 ${borderColor} bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 hover:bg-card`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <h3 className="text-lg font-semibold tracking-tight truncate">
              {patient.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <PatientStatusBadge status={patient.status} />
              <TimeSinceCreation timestamp={patient._creationTime} />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-0">
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {patient.complaint}
        </p>
        <div className="mt-4 pt-4 border-t flex justify-end">
          <Link to="/er/$patientId" params={{ patientId: patient._id }}>
            <Button
              variant="outline"
              size="sm"
              className="transition-colors"
            >
              Open Chart
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeSinceCreation({ timestamp }: { timestamp: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      {formatDistanceToNow(timestamp, { addSuffix: true })}
    </span>
  );
}

function PatientListSkeleton() {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="flex h-full flex-col border-l-4 border-l-muted">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-0">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4 mt-2" />
            <div className="mt-4 pt-4 border-t flex justify-end">
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
