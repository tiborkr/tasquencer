import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type InternalNode,
  getStraightPath,
  useEdges,
  useStore,
} from "@xyflow/react";
import { getEdgeParams, getQuadraticPath } from "./utils.js";

import { type WorkflowEdge } from "./nodes-edges.js";
import { useContext } from "react";
import { CancellationRegionHoverContext } from "./contexts.js";
import { cn } from "@repo/ui/lib/utils";

function getIsEdgeBidirectional(source: string, target: string, edges: Edge[]) {
  for (const edge of edges) {
    if (edge.source === target && edge.target === source) {
      return true;
    }
  }
  return false;
}

function getEdgePath(
  sourceNode: InternalNode,
  targetNode: InternalNode,
  isBidirectional: boolean
) {
  const { sx, sy, tx, ty } = getEdgeParams(sourceNode, targetNode);

  if (isBidirectional) {
    return getQuadraticPath({
      sx,
      sy,
      tx,
      ty,
    });
  }

  const [path, labelX, labelY] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });
  return { path, labelX, labelY };
}

export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  data,
}: EdgeProps<WorkflowEdge>) {
  const cancellationHover = useContext(CancellationRegionHoverContext);
  const edges = useEdges();
  const { sourceNode, targetNode } = useStore((s) => {
    const sourceNode = s.nodeLookup.get(source);
    const targetNode = s.nodeLookup.get(target);

    return { sourceNode, targetNode };
  });

  if (!sourceNode || !targetNode) {
    return null;
  }

  const isBidirectional = getIsEdgeBidirectional(source, target, edges);
  const { path, labelX, labelY } = getEdgePath(
    sourceNode,
    targetNode,
    isBidirectional
  );
  const hoveredOwner = cancellationHover?.hoveredOwner ?? null;
  let highlightedByCancellation = false;
  if (hoveredOwner) {
    if (data?.condition) {
      const owners =
        cancellationHover?.membership.conditions[data.condition] ?? [];
      highlightedByCancellation = owners.includes(hoveredOwner);
    } else if (sourceNode.type === "condition") {
      const owners =
        ((sourceNode.data as any)?.canceledBy as string[] | undefined) ?? [];
      highlightedByCancellation = owners.includes(hoveredOwner);
    }
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {data?.condition ? (
        <EdgeLabelRenderer>
          <div
            className={cn({
              "absolute size-5 rounded bg-zinc-300 dark:bg-zinc-700 flex items-center justify-center font-mono font-bold text-xs text-zinc-700 dark:text-zinc-300": true,
              "bg-red-500 dark:bg-red-600 text-white outline outline-[5px] outline-red-500/50 dark:outline-red-600/50":
                highlightedByCancellation,
            })}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.marking ?? 0}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
