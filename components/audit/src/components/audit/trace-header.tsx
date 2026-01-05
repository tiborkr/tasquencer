import { Badge } from "@repo/ui/components/badge";
import { formatDistanceToNow } from "date-fns";
import type { AuditTracesDoc } from "@repo/tasquencer";
import { formatDurationIntelligently } from "../../util/audit.js";
import { Activity } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

interface TraceHeaderProps {
  trace: AuditTracesDoc;
  duration: number;
  buttonSlot?: React.ReactNode;
}

// Status dot component for compact display
function StatusDot({ state }: { state: string }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full flex-shrink-0",
        state === "completed" && "bg-emerald-500",
        state === "failed" && "bg-red-500",
        state === "canceled" && "bg-zinc-400",
        !["completed", "failed", "canceled"].includes(state) &&
          "bg-blue-500 animate-pulse"
      )}
    />
  );
}

export function TraceHeader({ trace, duration, buttonSlot }: TraceHeaderProps) {
  const metadata = (trace.metadata ?? {}) as Record<string, unknown>;
  const workflowName =
    typeof metadata.workflowName === "string" ? metadata.workflowName : null;
  const workflowVersion =
    typeof metadata.workflowVersionName === "string"
      ? metadata.workflowVersionName
      : null;

  return (
    <div className="border-b bg-muted/10 px-4 py-3">
      {/* Single compact row */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Status + Name + Metadata */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <StatusDot state={trace.state} />
          <span className="text-sm font-medium truncate">{trace.name}</span>

          {/* Inline metadata badges */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
            {workflowName && (
              <Badge
                variant="outline"
                className="text-[10px] font-mono h-5 px-1.5"
              >
                {workflowName}
              </Badge>
            )}
            {workflowVersion && (
              <Badge
                variant="secondary"
                className="text-[10px] font-mono h-5 px-1.5"
              >
                v{workflowVersion}
              </Badge>
            )}
          </div>

          <code className="hidden md:block text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
            {trace.traceId}
          </code>
        </div>

        {/* Right: Stats + Button */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Inline stats */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="font-mono">
              <span className="text-foreground font-medium">
                {formatDurationIntelligently(duration)}
              </span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span>
              {formatDistanceToNow(new Date(trace.startedAt), {
                addSuffix: false,
              })}{" "}
              ago
            </span>
          </div>

          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-mono h-5 px-1.5",
              trace.state === "completed" &&
                "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
              trace.state === "failed" &&
                "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
              trace.state === "canceled" &&
                "border-zinc-500/30 text-zinc-500 bg-zinc-500/5",
              !["completed", "failed", "canceled"].includes(trace.state) &&
                "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5"
            )}
          >
            {trace.state}
          </Badge>

          {buttonSlot}
        </div>
      </div>
    </div>
  );
}
