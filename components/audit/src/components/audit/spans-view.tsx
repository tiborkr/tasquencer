import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { ButtonGroup } from "@repo/ui/components/button-group";
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Plus,
  Minus,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useState, useMemo, memo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { cn } from "@repo/ui/lib/utils";
import { formatDurationIntelligently } from "../../util/audit.js";
import { Alert, AlertTitle } from "@repo/ui/components/alert";
import type { AuditSpansDoc, AuditTracesDoc } from "@repo/tasquencer";

// Constants - reduced for compact display
const DEPTH_INDENT_PX = 10;
const BASE_PADDING_PX = 4;

// Span state styling configuration
const SPAN_STATE_STYLES = {
  completed: {
    textColor: "text-green-600 dark:text-green-400",
    badgeVariant: "default" as const,
    pillClasses:
      "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  },
  failed: {
    textColor: "text-red-600 dark:text-red-400",
    badgeVariant: "destructive" as const,
    pillClasses: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  },
  canceled: {
    textColor: "text-gray-500",
    badgeVariant: "secondary" as const,
    pillClasses:
      "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  },
  default: {
    textColor: "text-blue-600 dark:text-blue-400",
    badgeVariant: "outline" as const,
    pillClasses:
      "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  },
} as const;

type SpanState = keyof typeof SPAN_STATE_STYLES;

// Type definitions
type SpanEvent = {
  timestamp: number;
  name: string;
  data?: Record<string, unknown>;
};

function getSpanAttributes(span: AuditSpansDoc) {
  if (!span.attributes || typeof span.attributes !== "object") {
    return undefined;
  }
  return span.attributes;
}

function getSpanVersionName(span: AuditSpansDoc) {
  const attributes = getSpanAttributes(span);
  if (!attributes) return undefined;

  // Handle discriminated union - versionName exists in workflow, task, workItem
  if (
    attributes.type === "workflow" ||
    attributes.type === "task" ||
    attributes.type === "workItem"
  ) {
    return attributes.versionName;
  }

  // For custom attributes, check if versionName exists in payload
  if (attributes.type === "custom") {
    const version = (attributes.payload as any)?.versionName;
    return typeof version === "string" ? version : undefined;
  }

  // Activity and condition types don't have versionName
  return undefined;
}

interface Props {
  traceId: string;
  trace?: AuditTracesDoc;
  rootSpans: AuditSpansDoc[];
  onLoadChildren: (parentSpanId: string) => Promise<AuditSpansDoc[]>;
  currentTimestamp?: number;
  onJumpToSpan?: (spanId: string) => void;
  showRelativeTime?: boolean;
}

export function SpansView({
  traceId,
  trace,
  rootSpans,
  onLoadChildren,
  currentTimestamp,
  onJumpToSpan,
  showRelativeTime = true,
}: Props) {
  const currentSpanId = useMemo(() => {
    if (!currentTimestamp || !rootSpans) return null;
    // For finding current span, we'd need all spans, but since we're lazy loading,
    // we'll just use root spans for now. The visualizer handles full timeline.
    const sortedSpans = [...rootSpans].sort(
      (a, b) => b.startedAt - a.startedAt
    );
    const currentSpan = sortedSpans.find(
      (span) => span.startedAt <= currentTimestamp
    );
    return currentSpan?.spanId || null;
  }, [rootSpans, currentTimestamp]);

  if (rootSpans.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No spans to display
      </div>
    );
  }

  return (
    <div className="@container">
      {rootSpans.map((span, index) => (
        <SpanTreeNode
          key={span.spanId}
          span={span}
          traceId={traceId}
          traceStartedAt={trace?.startedAt}
          depth={0}
          index={index}
          currentSpanId={currentSpanId}
          currentTimestamp={currentTimestamp}
          onJumpToSpan={onJumpToSpan}
          onLoadChildren={onLoadChildren}
          showRelativeTime={showRelativeTime}
        />
      ))}
    </div>
  );
}

// Custom hook for span tree state management
function useSpanTree(
  span: AuditSpansDoc,
  onLoadChildren: (parentSpanId: string) => Promise<AuditSpansDoc[]>
) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [children, setChildren] = useState<AuditSpansDoc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (isExpanded && !loadedRef.current) {
      loadedRef.current = true;
      setIsLoading(true);
      onLoadChildren(span.spanId)
        .then(setChildren)
        .catch(() => setHasError(true))
        .finally(() => setIsLoading(false));
    }
  }, [isExpanded, span.spanId, onLoadChildren]);

  return {
    isExpanded,
    setIsExpanded,
    showDetails,
    setShowDetails,
    children,
    isLoadingChildren: isLoading,
    hasError,
  };
}

// Shared badge data preparation
interface SpanMetadata {
  duration: number;
  operationType: string;
  state: string;
  stateVariant: "default" | "destructive" | "secondary" | "outline";
  stateColorClasses: string;
  timestamp: string;
  dateTime: string;
  fullDateTime: string;
  relativeStart?: number;
  showTimestamp: boolean;
}

function getSpanMetadata(
  span: AuditSpansDoc,
  traceStartedAt?: number,
  depth: number = 0,
  currentTimestamp?: number
): SpanMetadata {
  // Use stable timestamp fallback instead of Date.now()
  const endedAt = span.endedAt || currentTimestamp || span.startedAt;
  const duration = span.duration || endedAt - span.startedAt;
  const relativeStart = traceStartedAt
    ? span.startedAt - traceStartedAt
    : undefined;

  // Get state styling from constants
  const stateKey = (
    span.state in SPAN_STATE_STYLES ? span.state : "default"
  ) as SpanState;
  const stateStyles = SPAN_STATE_STYLES[stateKey];

  return {
    duration,
    operationType: span.operationType,
    state: span.state,
    stateVariant: stateStyles.badgeVariant,
    stateColorClasses: stateStyles.pillClasses,
    timestamp: format(span.startedAt, "HH:mm:ss"),
    dateTime: format(span.startedAt, "MMM d, h:mm a"),
    fullDateTime: format(span.startedAt, "MMM d, yyyy h:mm a"),
    relativeStart,
    showTimestamp: depth === 0,
  };
}

// Desktop badges component - horizontal layout with Badge components
function DesktopBadges({
  metadata,
  showRelativeTime,
}: {
  metadata: SpanMetadata;
  showRelativeTime: boolean;
}) {
  return (
    <div className="hidden @md:flex items-center gap-2 flex-shrink-0">
      {metadata.showTimestamp && (
        <>
          {showRelativeTime && metadata.relativeStart !== undefined && (
            <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
              {metadata.fullDateTime} (+
              {formatDurationIntelligently(metadata.relativeStart)})
            </span>
          )}
          {!showRelativeTime && (
            <span className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">
              {metadata.dateTime}
            </span>
          )}
        </>
      )}

      <span className="font-mono text-[10px] text-muted-foreground">
        {formatDurationIntelligently(metadata.duration)}
      </span>

      <Badge variant="outline" className="text-[10px] h-4 px-1">
        {metadata.operationType}
      </Badge>

      <Badge
        variant={metadata.stateVariant}
        className="text-[10px] h-4 px-1 w-16 justify-center"
      >
        {metadata.state}
      </Badge>
    </div>
  );
}

// Mobile badges component - vertical stacked layout with pill-style badges
function MobileBadges({
  metadata,
  showRelativeTime,
  showOperation,
}: {
  metadata: SpanMetadata;
  showRelativeTime: boolean;
  showOperation?: string;
}) {
  return (
    <div className="flex @md:hidden flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
        {metadata.showTimestamp && (
          <>
            {showRelativeTime && metadata.relativeStart !== undefined ? (
              <span className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {metadata.dateTime}
              </span>
            ) : (
              <span className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {showRelativeTime ? metadata.dateTime : metadata.timestamp}
              </span>
            )}
          </>
        )}
        <span className="px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono">
          {formatDurationIntelligently(metadata.duration)}
        </span>
        <span className="px-1 py-0.5 rounded bg-muted text-muted-foreground">
          {metadata.operationType}
        </span>
        <span className={cn("px-1 py-0.5 rounded", metadata.stateColorClasses)}>
          {metadata.state}
        </span>
      </div>

      {showOperation && (
        <div className="text-[10px] text-muted-foreground truncate">
          {showOperation}
        </div>
      )}
    </div>
  );
}

// Expand/collapse button component
function ExpandButton({
  isExpanded,
  isLoading,
  onClick,
}: {
  isExpanded: boolean;
  isLoading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-accent rounded p-0.5 transition-colors flex-shrink-0 mt-0.5 @md:mt-0"
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 @md:h-4 @md:w-4 animate-spin" />
      ) : isExpanded ? (
        <ChevronDown className="h-3 w-3 @md:h-4 @md:w-4" />
      ) : (
        <ChevronRight className="h-3 w-3 @md:h-4 @md:w-4" />
      )}
    </button>
  );
}

// Children state wrapper component
function ChildrenStateWrapper({
  isCurrent,
  depth,
  children,
}: {
  isCurrent: boolean;
  depth: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn({
        "border-l": true,
        "bg-primary/5 border-l-primary": isCurrent,
      })}
    >
      <div
        className="pb-2 pr-2 @md:pr-3 ml-1 @md:ml-5"
        style={{ paddingLeft: `${depth * DEPTH_INDENT_PX}px` }}
      >
        <div className="pl-8">{children}</div>
      </div>
    </div>
  );
}

// Span details panel component
function SpanDetails({ span }: { span: AuditSpansDoc }) {
  const attributes = getSpanAttributes(span);
  const versionName = getSpanVersionName(span);
  const attributePayload =
    attributes && versionName
      ? Object.fromEntries(
          Object.entries(attributes).filter(([key]) => key !== "versionName")
        )
      : attributes;
  const hasAttributePayload =
    attributePayload && Object.keys(attributePayload).length > 0;

  return (
    <div className="pb-1">
      <div className="bg-muted/30 p-2 space-y-2 mr-1 rounded ml-5 text-[11px]">
        {versionName && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium">Version</span>
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">
              {versionName}
            </code>
          </div>
        )}

        {hasAttributePayload && (
          <div>
            <div className="font-medium mb-1 text-muted-foreground">
              Attributes
            </div>
            <pre className="text-[10px] bg-background p-2 rounded overflow-x-auto border font-mono">
              {JSON.stringify(attributePayload, null, 2)}
            </pre>
          </div>
        )}

        {span.events && span.events.length > 0 && (
          <div>
            <div className="font-medium mb-1 text-muted-foreground">Events</div>
            <div className="space-y-0.5">
              {(span.events as SpanEvent[]).map((evt, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-1.5 bg-background p-1.5 rounded border text-[10px]"
                >
                  {evt.timestamp && (
                    <span className="text-muted-foreground font-mono">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                  {evt.timestamp === undefined && (
                    <span className="text-muted-foreground font-mono">—</span>
                  )}
                  {(() => {
                    const isWorkItemEvent = evt.name === "workItemIdAssigned";
                    const eventData = evt.data as
                      | Record<string, unknown>
                      | undefined;
                    const workItemId =
                      isWorkItemEvent &&
                      eventData &&
                      typeof eventData.workItemId === "string"
                        ? eventData.workItemId
                        : undefined;
                    return (
                      <>
                        <span className="font-medium">
                          {isWorkItemEvent ? "Work Item Assigned" : evt.name}
                        </span>
                        {workItemId && (
                          <code className="bg-muted px-1 py-0.5 rounded font-mono">
                            {workItemId}
                          </code>
                        )}
                        {!isWorkItemEvent && eventData && (
                          <pre className="flex-1 overflow-x-auto font-mono">
                            {JSON.stringify(eventData)}
                          </pre>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {span.error && (
          <div>
            <div className="font-medium mb-1 text-destructive">Error</div>
            <div className="bg-destructive/10 p-2 rounded border border-destructive/20 space-y-1">
              <div>
                <span className="font-medium">Message:</span>{" "}
                {span.error.message}
              </div>
              {span.error.stack && (
                <div>
                  <span className="font-medium">Stack:</span>
                  <pre className="text-[10px] overflow-x-auto mt-1 p-1.5 bg-background rounded border font-mono">
                    {span.error.stack}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SpanTreeNode = memo(function SpanTreeNode({
  span,
  traceId,
  traceStartedAt,
  depth,
  index,
  currentSpanId,
  currentTimestamp,
  onJumpToSpan,
  onLoadChildren,
  showRelativeTime,
  parentIsCurrent = false,
}: {
  span: AuditSpansDoc;
  traceId: string;
  traceStartedAt?: number;
  depth: number;
  index?: number;
  currentSpanId: string | null;
  currentTimestamp?: number;
  onJumpToSpan?: (spanId: string) => void;
  onLoadChildren: (parentSpanId: string) => Promise<AuditSpansDoc[]>;
  showRelativeTime: boolean;
  parentIsCurrent?: boolean;
}) {
  // Use custom hook for state management
  const {
    isExpanded,
    setIsExpanded,
    showDetails,
    setShowDetails,
    children,
    isLoadingChildren,
    hasError,
  } = useSpanTree(span, onLoadChildren);

  const hasDetails = span.attributes || span.events || span.error;
  const isCurrent = span.spanId === currentSpanId || parentIsCurrent;
  const hasExecuted = !currentTimestamp || span.startedAt <= currentTimestamp;

  // Prepare badge metadata once
  const metadata = getSpanMetadata(
    span,
    traceStartedAt,
    depth,
    currentTimestamp
  );
  const versionName = getSpanVersionName(span);

  // Helper to get state text color from constants
  const getStateColor = (state: string) => {
    const stateKey = (
      state in SPAN_STATE_STYLES ? state : "default"
    ) as SpanState;
    return SPAN_STATE_STYLES[stateKey].textColor;
  };

  return (
    <div>
      <div
        className={cn({
          "hover:bg-black/10 transition-colors border-l": true,
          "border-t-2 border-white/20": depth === 0,
          "border-t border-white/10": depth !== 0,
          "border-t-0": index === 0,
          "bg-primary/5 border-l-primary": isCurrent,
          "grayscale opacity-75": !hasExecuted,
        })}
        style={{
          paddingLeft: `${depth * DEPTH_INDENT_PX + BASE_PADDING_PX}px`,
        }}
      >
        <div className="flex items-start gap-1.5 @md:gap-2 py-1 @md:py-1.5 pl-1 px-1.5 @md:px-2">
          {/* Chevron button - always show */}
          <ExpandButton
            isExpanded={isExpanded}
            isLoading={isLoadingChildren}
            onClick={() => setIsExpanded(!isExpanded)}
          />

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1 @md:space-y-0">
            {/* Name and operation - always visible */}
            <div className="flex items-start @md:items-center gap-2 flex-wrap @md:flex-nowrap @md:w-full">
              <div className="flex flex-col @md:flex-row @md:items-center @md:gap-2 flex-1 min-w-0">
                <span
                  className={cn(
                    "font-medium text-[11px] @md:text-xs truncate",
                    getStateColor(span.state),
                    isCurrent && "font-semibold"
                  )}
                >
                  {span.resourceName || span.operation}
                </span>
                {span.operation && (
                  <span className="hidden @md:inline text-[10px] text-muted-foreground truncate">
                    {span.operation}
                  </span>
                )}
                {versionName && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1 mt-0.5 @md:mt-0"
                  >
                    v{versionName}
                  </Badge>
                )}
              </div>

              {/* Wide layout: badges inline */}
              <DesktopBadges
                metadata={metadata}
                showRelativeTime={showRelativeTime}
              />

              {/* Button group - right aligned when in visualizer */}
              {(hasDetails || (depth === 0 && onJumpToSpan)) && (
                <ButtonGroup
                  className={cn(onJumpToSpan && "ml-auto relative top-1 -mb-2")}
                >
                  {depth === 0 && onJumpToSpan && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToSpan(span.spanId);
                      }}
                      title="Jump to timeline position"
                    >
                      <Crosshair className="h-3 w-3" />
                    </Button>
                  )}
                  {hasDetails && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowDetails(!showDetails)}
                      title={showDetails ? "Hide details" : "Show details"}
                    >
                      {showDetails ? (
                        <Minus className="h-3 w-3" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </ButtonGroup>
              )}
            </div>

            {/* Compact layout: stacked badges and metadata */}
            <MobileBadges
              metadata={metadata}
              showRelativeTime={showRelativeTime}
              showOperation={span.operation}
            />
          </div>
        </div>

        {/* Details panel */}
        {showDetails && hasDetails && <SpanDetails span={span} />}
      </div>

      {/* Children rendering */}
      {isExpanded && (
        <div>
          {hasError && (
            <ChildrenStateWrapper isCurrent={isCurrent} depth={depth}>
              <Alert className="py-2 px-3" variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to load child spans</AlertTitle>
              </Alert>
            </ChildrenStateWrapper>
          )}
          {!hasError && children.length === 0 && !isLoadingChildren && (
            <ChildrenStateWrapper isCurrent={isCurrent} depth={depth}>
              <span className="text-[10px] text-muted-foreground/60 italic pl-1">
                No children
              </span>
            </ChildrenStateWrapper>
          )}
          {!hasError && children.length > 0 && (
            <>
              {children.map((childSpan) => (
                <SpanTreeNode
                  key={childSpan.spanId}
                  span={childSpan}
                  traceId={traceId}
                  traceStartedAt={traceStartedAt}
                  depth={depth + 1}
                  currentSpanId={currentSpanId}
                  currentTimestamp={currentTimestamp}
                  onJumpToSpan={onJumpToSpan}
                  onLoadChildren={onLoadChildren}
                  showRelativeTime={showRelativeTime}
                  parentIsCurrent={isCurrent}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
});
