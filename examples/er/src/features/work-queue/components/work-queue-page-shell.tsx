import { Suspense, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface WorkQueuePageShellProps {
  header: {
    badge?: {
      icon: LucideIcon
      label: string
    }
    title: string
    description?: string
    actions?: ReactNode
  }
  fallback: ReactNode
  children: ReactNode
}

export function WorkQueuePageShell({
  header,
  fallback,
  children,
}: WorkQueuePageShellProps) {
  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="px-6 py-8 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            {header.badge && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
                <header.badge.icon className="h-4 w-4 text-primary" />
                {header.badge.label}
              </span>
            )}
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {header.title}
            </h1>
            {header.description && (
              <p className="text-base md:text-lg text-muted-foreground max-w-xl">
                {header.description}
              </p>
            )}
          </div>
          {header.actions}
        </div>
        <Suspense fallback={fallback}>{children}</Suspense>
      </div>
    </div>
  )
}
