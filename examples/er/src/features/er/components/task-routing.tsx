import { Link } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/button";
import type { WorkQueueTask } from "@/features/er/hooks/useErWorkQueue";

const TASK_ROUTE_MAP: Record<string, string> = {
  triagePatient: "/er/tasks/triage/$workItemId",
  conductXRay: "/er/tasks/xray/$workItemId",
  analyzeBloodSample: "/er/tasks/blood/$workItemId",
  reviewDiagnostics: "/er/tasks/review/$workItemId",
  performSurgery: "/er/tasks/surgery/$workItemId",
  specialistConsult: "/er/tasks/consult/$workItemId",
  administerDailyMedication: "/er/tasks/dailymedication/$workItemId",
  administerMedication: "/er/tasks/medication/$workItemId",
  admitToHospital: "/er/tasks/admission/$workItemId",
  performDailyCheck: "/er/tasks/dailycheck/$workItemId",
  prepareForDischarge: "/er/tasks/discharge/$workItemId",
};

export function resolveTaskRoute(task: WorkQueueTask) {
  const routeFromType = task.taskType && TASK_ROUTE_MAP[task.taskType];

  const fallbackRoute = (() => {
    if (task.taskName.includes("Triage")) return "/er/tasks/triage/$workItemId";
    if (task.taskName.includes("X-Ray")) return "/er/tasks/xray/$workItemId";
    if (task.taskName.includes("Blood")) return "/er/tasks/blood/$workItemId";
    if (task.taskName.includes("Review")) return "/er/tasks/review/$workItemId";
    if (
      task.taskName.includes("Surgery") ||
      task.taskName.includes("Emergency Surgery")
    ) {
      return "/er/tasks/surgery/$workItemId";
    }
    if (task.taskName.includes("Specialist Consultation")) {
      return "/er/tasks/consult/$workItemId";
    }
    if (task.taskName.includes("Daily Medication")) {
      return "/er/tasks/dailymedication/$workItemId";
    }
    if (
      task.taskName.includes("Administer Medication") &&
      !task.taskName.includes("Daily")
    ) {
      return "/er/tasks/medication/$workItemId";
    }
    if (task.taskName.includes("Admit to Hospital")) {
      return "/er/tasks/admission/$workItemId";
    }
    if (task.taskName.includes("Daily Check")) {
      return "/er/tasks/dailycheck/$workItemId";
    }
    if (task.taskName.includes("Discharge")) {
      return "/er/tasks/discharge/$workItemId";
    }
    return undefined;
  })();

  const route = routeFromType ?? fallbackRoute;

  if (!route) {
    return null;
  }

  return {
    to: route,
    params: { workItemId: task.workItemId },
  } as const;
}

export function TaskActionButton({ task }: { task: WorkQueueTask }) {
  const route = resolveTaskRoute(task);

  if (!route) {
    return (
      <Button size="sm" disabled>
        Unknown Task
      </Button>
    );
  }

  return (
    <Link to={route.to} params={route.params}>
      <Button size="sm">Open Task</Button>
    </Link>
  );
}
