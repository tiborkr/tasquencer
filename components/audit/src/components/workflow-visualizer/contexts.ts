import type { ExtractedWorkflowStructure } from "@repo/tasquencer";
import { createContext } from "react";

// Context to pass task click handler to TaskNode (supports composite + dynamic composite)
export const TaskClickContext = createContext<
  ((task: ExtractedWorkflowStructure["tasks"][number]) => void) | null
>(null);

export const CancellationRegionHoverContext = createContext<{
  hoveredOwner: string | null;
  setHovered: (taskName: string | null) => void;
  membership: {
    tasks: Record<string, string[]>;
    conditions: Record<string, string[]>;
    owners: Record<string, { tasks: string[]; conditions: string[] }>;
  };
} | null>(null);
