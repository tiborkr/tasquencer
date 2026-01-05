import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@/lib/utils";

export interface WorkQueueColumn<T> {
  key: string;
  header: ReactNode;
  className?: string;
  cellClassName?: string;
  render: (item: T) => ReactNode;
}

export interface WorkQueueSection<T> {
  key: string;
  label?: ReactNode;
  description?: ReactNode;
  items: readonly T[];
  hideHeader?: boolean;
}

interface ViewTarget {
  to: string;
  params?: Record<string, unknown>;
  search?: Record<string, unknown>;
}

interface WorkQueueActions<T> {
  view: {
    resolve: (item: T) => ViewTarget | null;
    label?: string;
    disabledLabel?: string;
  };
  claim?: {
    onClaim: (item: T) => Promise<void>;
    canClaim?: (item: T) => boolean;
    label?: string;
    pendingLabel?: string;
  };
}

interface WorkQueueTablePresenterProps<T> {
  sections: readonly WorkQueueSection<T>[];
  columns: readonly WorkQueueColumn<T>[];
  getRowKey: (item: T) => string;
  actions?: WorkQueueActions<T>;
  renderEmpty?: ReactNode;
  className?: string;
}

const DEFAULT_EMPTY_STATE = (
  <div className="text-center py-12 text-muted-foreground">
    <p>No work items found.</p>
  </div>
);

export function WorkQueueTablePresenter<T>({
  sections,
  columns,
  getRowKey,
  actions,
  renderEmpty,
  className,
}: WorkQueueTablePresenterProps<T>) {
  const [claimingKey, setClaimingKey] = useState<string | null>(null);

  const resolvedSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        items: section.items ?? [],
      }))
      .filter((section) => section.items.length > 0 || !section.hideHeader);
  }, [sections]);

  const totalItems = useMemo(
    () =>
      resolvedSections.reduce((acc, section) => acc + section.items.length, 0),
    [resolvedSections]
  );

  if (totalItems === 0) {
    return <>{renderEmpty ?? DEFAULT_EMPTY_STATE}</>;
  }

  const columnCount = columns.length + (actions ? 1 : 0);

  const handleClaim = async (item: T) => {
    if (!actions?.claim) return;
    const key = getRowKey(item);
    setClaimingKey(key);
    try {
      await actions.claim.onClaim(item);
    } finally {
      setClaimingKey(null);
    }
  };

  return (
    <div className={cn("rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {columns.map((column) => (
              <TableHead key={column.key} className={cn("font-semibold text-foreground/80", column.className)}>
                {column.header}
              </TableHead>
            ))}
            {actions && <TableHead className="text-right font-semibold text-foreground/80">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resolvedSections.map((section) => (
            <Fragment key={section.key}>
              {!section.hideHeader &&
                (section.label || section.description) && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40 border-y border-border/30">
                    <TableCell
                      colSpan={columnCount}
                      className="py-3"
                    >
                      <div className="flex flex-col">
                        {section.label}
                        {section.description && (
                          <span className="text-xs text-muted-foreground">
                            {section.description}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}

              {section.items.map((item) => {
                const rowKey = getRowKey(item);
                const viewTarget = actions?.view.resolve(item) ?? null;
                const canClaim =
                  actions?.claim?.canClaim?.(item) ?? Boolean(actions?.claim);
                const isClaiming = claimingKey === rowKey;

                return (
                  <TableRow key={rowKey} className="hover:bg-muted/20 transition-colors">
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={column.cellClassName}
                      >
                        {column.render(item)}
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {actions.claim && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleClaim(item)}
                              disabled={isClaiming || !canClaim}
                            >
                              {isClaiming ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {actions.claim.pendingLabel ?? "Claiming..."}
                                </>
                              ) : (
                                (actions.claim.label ?? "Claim")
                              )}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!viewTarget}
                            asChild={Boolean(viewTarget)}
                            className="transition-colors"
                          >
                            {viewTarget ? (
                              <Link
                                to={viewTarget.to}
                                params={viewTarget.params}
                                search={viewTarget.search}
                              >
                                {actions.view.label ?? "Open"}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center">
                                {actions.view.disabledLabel ?? "Unavailable"}
                              </span>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
