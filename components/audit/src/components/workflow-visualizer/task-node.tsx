import { type TaskNode } from "./nodes-edges.js";

import {
  Handle,
  Position,
  useStore,
  type ReactFlowState,
  type NodeProps,
} from "@xyflow/react";
import { ChevronRight, ChevronsRight } from "lucide-react";
import { useCallback, useContext } from "react";
import {
  CancellationRegionHoverContext,
  TaskClickContext,
} from "./contexts.js";
import { cn } from "@repo/ui/lib/utils";

function edgesSelectorEquality(
  prev: { incomingEdgesCount: number; outgoingEdgesCount: number },
  next: { incomingEdgesCount: number; outgoingEdgesCount: number }
) {
  return (
    prev.incomingEdgesCount === next.incomingEdgesCount &&
    prev.outgoingEdgesCount === next.outgoingEdgesCount
  );
}

export function TaskNode({ data, id }: NodeProps<TaskNode>) {
  const onTaskClick = useContext(TaskClickContext);
  const cancellationHover = useContext(CancellationRegionHoverContext);

  const edgesSelector = useCallback(
    (state: ReactFlowState) => {
      let incomingEdgesCount = 0;
      let outgoingEdgesCount = 0;
      state.edges.forEach((edge) => {
        if (edge.source === id) {
          outgoingEdgesCount++;
        }
        if (edge.target === id) {
          incomingEdgesCount++;
        }
      });
      return { incomingEdgesCount, outgoingEdgesCount };
    },
    [id]
  );
  const { incomingEdgesCount, outgoingEdgesCount } = useStore(
    edgesSelector,
    edgesSelectorEquality
  );

  const isCompositeTask =
    data.type === "compositeTask" || data.type === "dynamicCompositeTask";
  const isClickable = Boolean(onTaskClick);
  const taskState = data.taskState || "disabled";
  const cancellationControllers = data.canceledBy ?? [];
  const isCancellationOwner = data.isCancellationOwner ?? false;
  const hoveredOwner = cancellationHover?.hoveredOwner ?? null;
  const highlightedByCancellation =
    hoveredOwner != null && cancellationControllers.includes(hoveredOwner);
  const ownerRegionMembership =
    isCancellationOwner && cancellationHover
      ? cancellationHover.membership.owners[data.name]
      : undefined;
  const cancellationOwnerTooltip =
    isCancellationOwner && ownerRegionMembership
      ? [
          ownerRegionMembership.tasks.length > 0
            ? `Tasks: ${ownerRegionMembership.tasks.join(", ")}`
            : null,
          ownerRegionMembership.conditions.length > 0
            ? `Conditions: ${ownerRegionMembership.conditions.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" • ")
      : undefined;

  const formattedCancellationOwnerTooltip = cancellationOwnerTooltip
    ? `Cancellation region controls • ${cancellationOwnerTooltip}`
    : undefined;

  const stateClass = (() => {
    if (taskState === "disabled") {
      return "border-zinc-400 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900";
    } else if (taskState === "enabled") {
      return "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-950 shadow-sm shadow-blue-500/20";
    } else if (taskState === "started") {
      return "border-cyan-500 dark:border-cyan-400 bg-cyan-50 dark:bg-cyan-950 shadow-sm shadow-cyan-500/20 animate-pulse";
    } else if (taskState === "completed") {
      return "border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-950";
    } else if (taskState === "failed") {
      return "border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-950";
    } else if (taskState === "canceled") {
      return "border-zinc-500 dark:border-zinc-400 bg-zinc-100 dark:bg-zinc-800";
    }
    return "border-zinc-800 dark:border-zinc-300 bg-white dark:bg-zinc-900";
  })();

  const taskClasses = cn(
    "group relative w-[250px] h-8 rounded-md border transition-colors",
    isClickable && "cursor-pointer",
    isCompositeTask &&
      "outline outline-zinc-600 dark:outline-zinc-400 outline-offset-3",
    isCancellationOwner && "ring-1 ring-red-500/60 dark:ring-red-500/60",
    stateClass
  );

  const handleClick = useCallback(() => {
    onTaskClick?.(data as any);
  }, [data, onTaskClick]);

  const handleMouseEnter = useCallback(() => {
    if (isCancellationOwner && cancellationHover) {
      cancellationHover.setHovered(data.name);
    }
  }, [isCancellationOwner, cancellationHover, data.name]);

  const handleMouseLeave = useCallback(() => {
    if (isCancellationOwner && cancellationHover) {
      cancellationHover.setHovered(null);
    }
  }, [isCancellationOwner, cancellationHover]);

  return (
    <div
      className={taskClasses}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={formattedCancellationOwnerTooltip}
    >
      {highlightedByCancellation ? (
        <div className="pointer-events-none absolute -inset-2 rounded-xl bg-red-500/15 border border-red-400/40 shadow-[0_0_0_1px_rgba(248,113,113,0.25)] -z-10" />
      ) : null}
      {isCancellationOwner ? (
        <div className="absolute -top-2 -left-2 rounded bg-red-500 text-white text-[0.625rem] uppercase px-1 py-[1px] shadow-sm shadow-red-500/30">
          CR
        </div>
      ) : null}
      <div className="opacity-0">
        <Handle type="target" position={Position.Top} isConnectable={false} />
      </div>
      <div className="w-full h-full flex items-center justify-between text-xs text-zinc-900 dark:text-zinc-100">
        {incomingEdgesCount > 1 ? (
          <div className="bg-zinc-800 dark:bg-zinc-300 h-8 w-12 flex rounded-l flex-shrink-0 items-center justify-between pr-2 ml-[-1px] pl-1">
            <ChevronRight className="w-4 h-4 text-white dark:text-zinc-900" />
            <div className="text-[0.625rem] text-white dark:text-zinc-900 uppercase font-bold flex items-center justify-center pt-[1px]">
              {data.joinType}
            </div>
          </div>
        ) : null}
        <div className="flex-grow truncate px-1 text-center flex items-center justify-center gap-1">
          {data.name}
          {isCompositeTask && (
            <ChevronsRight className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
          )}
        </div>
        {outgoingEdgesCount > 1 ? (
          <div className="bg-zinc-800 dark:bg-zinc-300 h-8 w-12 flex rounded-r flex-shrink-0 mr-[-1px] items-center justify-between pl-2 pr-1">
            <div className="text-[0.625rem] text-white dark:text-zinc-900 uppercase font-bold flex items-center justify-center pt-[1px]">
              {data.splitType}
            </div>
            <ChevronRight className="w-4 h-4 text-white dark:text-zinc-900" />
          </div>
        ) : null}
      </div>

      <div className="opacity-0">
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={false}
        />
      </div>
    </div>
  );
}
