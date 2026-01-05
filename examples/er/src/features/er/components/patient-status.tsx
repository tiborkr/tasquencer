import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

type PatientStatus =
  | "triage"
  | "diagnostics"
  | "emergency_surgery"
  | "review"
  | "consultation"
  | "treatment"
  | "hospital_stay"
  | "discharged"
  | "ready_for_discharge";

const statusConfig: Record<
  PatientStatus,
  { label: string; className: string }
> = {
  triage: {
    label: "Triage",
    className: "bg-amber-500 text-white hover:bg-amber-500/90 border-transparent",
  },
  diagnostics: {
    label: "Diagnostics",
    className: "bg-blue-600 text-white hover:bg-blue-600/90 border-transparent",
  },
  emergency_surgery: {
    label: "Emergency Surgery",
    className:
      "bg-red-600 text-white hover:bg-red-600/90 border-transparent animate-pulse",
  },
  review: {
    label: "Review",
    className: "bg-indigo-600 text-white hover:bg-indigo-600/90 border-transparent",
  },
  consultation: {
    label: "Consultation",
    className: "bg-violet-600 text-white hover:bg-violet-600/90 border-transparent",
  },
  treatment: {
    label: "Treatment",
    className: "bg-emerald-600 text-white hover:bg-emerald-600/90 border-transparent",
  },
  hospital_stay: {
    label: "Hospital Stay",
    className: "bg-cyan-600 text-white hover:bg-cyan-600/90 border-transparent",
  },
  discharged: {
    label: "Discharged",
    className: "bg-gray-500 text-white hover:bg-gray-500/90 border-transparent",
  },
  ready_for_discharge: {
    label: "Ready for Discharge",
    className: "bg-green-600 text-white hover:bg-green-600/90 border-transparent",
  },
};

export function PatientStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as PatientStatus];

  if (config) {
    return (
      <Badge
        className={cn(
          "uppercase text-xs font-semibold tracking-wide shadow-sm",
          config.className
        )}
      >
        {config.label}
      </Badge>
    );
  }

  // Fallback for unknown statuses
  const label = status.replace(/_/g, " ");
  return (
    <Badge className="uppercase text-xs font-semibold tracking-wide">
      {label}
    </Badge>
  );
}

// Priority badges for work queue
export type Priority = "critical" | "urgent" | "routine";

const priorityConfig: Record<Priority, { className: string }> = {
  critical: {
    className: "bg-red-600 text-white hover:bg-red-600/90 border-transparent",
  },
  urgent: {
    className: "bg-amber-500 text-white hover:bg-amber-500/90 border-transparent",
  },
  routine: {
    className: "bg-gray-400 text-white hover:bg-gray-400/90 border-transparent",
  },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority as Priority];

  return (
    <Badge
      className={cn(
        "uppercase text-xs font-semibold tracking-wide shadow-sm",
        config?.className ?? ""
      )}
    >
      {priority}
    </Badge>
  );
}
