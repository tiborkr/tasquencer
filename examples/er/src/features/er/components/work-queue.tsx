import { useMemo } from "react";
import { Activity, Briefcase, ClipboardList } from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import type { Id } from "@/convex/_generated/dataModel";
import {
  WorkQueueTablePresenter,
  type WorkQueueColumn,
  type WorkQueueSection,
} from "@/features/work-queue/components/work-queue-table-presenter";
import { WorkQueuePageShell } from "@/features/work-queue/components/work-queue-page-shell";
import { useErWorkQueue, type WorkQueueTask } from "../hooks/useErWorkQueue";
import { usePatientSnapshot } from "../hooks/usePatientSnapshot";
import { resolveTaskRoute } from "./task-routing";
import { cn } from "@/lib/utils";
import { ER_SCOPE_SECTIONS } from "../constants";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

interface RoleLabelData {
  label: string;
  sortIndex: number;
}

const ROLE_LABEL_DATA: Map<string, RoleLabelData> = new Map(
  ER_SCOPE_SECTIONS.map((section, index) => [
    section.scope,
    { label: section.label, sortIndex: index },
  ])
);

function formatScopeLabel(scopeName?: string) {
  if (!scopeName) return "Unassigned Tasks";
  const known = ROLE_LABEL_DATA.get(scopeName);
  if (known) {
    return known.label;
  }
  return scopeName;
}

export function WorkQueuePage() {
  return (
    <WorkQueuePageShell
      header={{
        badge: { icon: Briefcase, label: "Team Tasks" },
        title: "ER Work Queue",
        description:
          "Review everything waiting for a clinician and claim what you can help with.",
      }}
      fallback={<ErWorkQueueSkeleton />}
    >
      <ErWorkQueueContent />
    </WorkQueuePageShell>
  );
}

function ErWorkQueueContent() {
  const tasks = useErWorkQueue();

  const columns: WorkQueueColumn<WorkQueueTask>[] = useMemo(
    () => [
      {
        key: "task",
        header: "Task",
        render: (task) => (
          <div>
            <div className="font-semibold">{task.taskName}</div>
            <div className="text-xs text-muted-foreground uppercase">
              {formatScopeLabel(task.requiredScope)}
            </div>
          </div>
        ),
      },
      {
        key: "patient",
        header: "Patient",
        render: (task) => (
          <div className="flex flex-col">
            <span className="font-medium">
              <PatientNameCell patientId={task.patientId} />
            </span>
            <span className="text-sm text-muted-foreground">
              <PatientComplaintCell patientId={task.patientId} />
            </span>
          </div>
        ),
      },
      {
        key: "priority",
        header: "Priority",
        render: (task) => <TaskPriorityBadge priority={task.priority} />,
      },
    ],
    []
  );

  const sections = useMemo(() => {
    if (tasks.length === 0) {
      return [] as WorkQueueSection<WorkQueueTask>[];
    }

    const grouped = new Map<
      string,
      { label: string; sortIndex: number; tasks: WorkQueueTask[] }
    >();

    tasks.forEach((task) => {
      const roleKey = task.requiredScope ?? "unassigned";
      const known = ROLE_LABEL_DATA.get(roleKey);
      const sortIndex =
        known?.sortIndex ?? ER_SCOPE_SECTIONS.length + (grouped.size || 0);
      const existing = grouped.get(roleKey);
      if (existing) {
        existing.tasks.push(task);
      } else {
        grouped.set(roleKey, {
          label: formatScopeLabel(task.requiredScope),
          sortIndex,
          tasks: [task],
        });
      }
    });

    return Array.from(grouped.entries())
      .sort((a, b) => {
        const [, groupA] = a;
        const [, groupB] = b;
        return (
          groupA.sortIndex - groupB.sortIndex ||
          groupA.label.localeCompare(groupB.label)
        );
      })
      .map(([key, group]) => ({
        key,
        label: (
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{group.label}</span>
            <span className="text-xs text-muted-foreground">
              {group.tasks.length} open{" "}
              {group.tasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>
        ),
        items: group.tasks,
      })) satisfies WorkQueueSection<WorkQueueTask>[];
  }, [tasks]);

  return (
    <WorkQueueTablePresenter
      sections={sections}
      columns={columns}
      getRowKey={(task) => task._id}
      className="mt-8"
      renderEmpty={
        <div className="mt-16 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Activity className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium">All caught up</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              There are no pending tasks. We&apos;ll show new work here as soon as a patient needs attention.
            </p>
          </div>
        </div>
      }
      actions={{
        view: {
          resolve: (task) => resolveTaskRoute(task),
          label: "Open Task",
          disabledLabel: "Unknown Task",
        },
      }}
    />
  );
}

function PatientNameCell({ patientId }: { patientId: Id<"erPatients"> }) {
  const patient = usePatientSnapshot(patientId);
  return <>{patient?.name ?? "—"}</>;
}

function PatientComplaintCell({ patientId }: { patientId: Id<"erPatients"> }) {
  const patient = usePatientSnapshot(patientId);
  return <>{patient?.complaint ?? "—"}</>;
}

function TaskPriorityBadge({
  priority,
}: {
  priority: WorkQueueTask["priority"];
}) {
  if (!priority) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const priorityStyles = {
    critical: "bg-red-600 text-white hover:bg-red-600/90 border-transparent shadow-sm",
    urgent: "bg-amber-500 text-white hover:bg-amber-500/90 border-transparent shadow-sm",
    routine: "bg-gray-400 text-white hover:bg-gray-400/90 border-transparent shadow-sm",
  };

  return (
    <Badge
      className={cn(
        "uppercase text-xs font-semibold tracking-wide",
        priorityStyles[priority] ?? ""
      )}
    >
      {priority}
    </Badge>
  );
}

function ErWorkQueueSkeleton() {
  return (
    <div className="mt-8 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="font-semibold text-foreground/80">Task</TableHead>
            <TableHead className="font-semibold text-foreground/80">Patient</TableHead>
            <TableHead className="font-semibold text-foreground/80">Priority</TableHead>
            <TableHead className="text-right font-semibold text-foreground/80">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-2 h-4 w-48" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-8 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
