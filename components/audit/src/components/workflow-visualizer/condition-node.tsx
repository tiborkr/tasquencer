import { type ConditionNode } from "./nodes-edges.js";
import { cn } from "@repo/ui/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useContext } from "react";
import { CancellationRegionHoverContext } from "./contexts.js";

export function ConditionNode({ data }: NodeProps<ConditionNode>) {
  const marking = data.marking ?? 0;
  const cancellationControllers = data.canceledBy ?? [];
  const isCancellationTarget = cancellationControllers.length > 0;
  const cancellationHover = useContext(CancellationRegionHoverContext);
  const hoveredOwner = cancellationHover?.hoveredOwner ?? null;
  const highlightedByCancellation =
    hoveredOwner != null && cancellationControllers.includes(hoveredOwner);

  const containerClasses = cn(
    "w-[120px] h-7 rounded border relative transition-colors",
    highlightedByCancellation
      ? "bg-red-100 dark:bg-red-900 border-red-500 dark:border-red-400 text-red-900 dark:text-red-100 shadow-sm shadow-red-500/40"
      : data.isStartCondition
        ? "bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700 text-green-900 dark:text-green-100"
        : data.isEndCondition
          ? "bg-red-100 dark:bg-red-900 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100"
          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100"
  );

  const badgeClasses = cn(
    "w-7 flex items-center justify-center font-mono font-bold flex-shrink-0 h-full rounded-l ml-[-1px]",
    highlightedByCancellation
      ? "bg-red-500 dark:bg-red-600 text-white"
      : data.isStartCondition
        ? "bg-green-300 dark:bg-green-700"
        : data.isEndCondition
          ? "bg-red-300 dark:bg-red-700"
          : "bg-zinc-300 dark:bg-zinc-700"
  );

  return (
    <div className={containerClasses}>
      {data.isStartCondition ? null : (
        <div className="opacity-0">
          <Handle type="target" position={Position.Top} isConnectable={false} />
        </div>
      )}
      <div className="h-full w-full  flex items-center text-xs gap-1 pr-1">
        <div className={badgeClasses}>{marking}</div>
        <div className="flex-grow text-center truncate px-1">{data.name}</div>
      </div>
      {data.isEndCondition ? null : (
        <div className="opacity-0">
          <Handle
            type="source"
            position={Position.Bottom}
            isConnectable={false}
          />
        </div>
      )}
      {isCancellationTarget ? (
        <div className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white text-[0.625rem] font-semibold w-5 h-5 flex items-center justify-center shadow-sm shadow-red-500/30">
          {cancellationControllers.length}
        </div>
      ) : null}
    </div>
  );
}
