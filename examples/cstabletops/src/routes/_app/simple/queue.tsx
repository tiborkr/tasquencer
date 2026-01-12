import { createFileRoute, Link } from '@tanstack/react-router'
import { Suspense, useMemo } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Separator } from '@repo/ui/components/separator'
import {
  ListTodo,
  ArrowLeft,
  Hash,
  Clock,
  UserCheck,
  Inbox,
  ChevronRight,
  Plus,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/queue')({
  component: WorkQueue,
})

function WorkQueue() {
  return (
    <Suspense fallback={<QueuePageSkeleton />}>
      <QueuePageInner />
    </Suspense>
  )
}

function QueuePageInner() {
  const q = convexQuery(api.workflows.cstabletops.api.getCstabletopsWorkQueue, {})
  const { data: workItems } = useSuspenseQuery(q)

  // Calculate stats and split by status
  const { stats, pendingItems, claimedItems } = useMemo(() => {
    const pending = workItems.filter((w) => w.status === 'pending')
    const claimed = workItems.filter((w) => w.status === 'claimed')
    return {
      stats: { total: workItems.length, pending: pending.length, claimed: claimed.length },
      pendingItems: pending,
      claimedItems: claimed,
    }
  }, [workItems])

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Work Queue
              </h1>
              <p className="text-sm text-muted-foreground">
                Pending tasks waiting to be completed
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Sessions
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/simple/new">
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Link>
          </Button>
        </div>
      </div>

      <Separator />

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Total
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Pending
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{stats.pending}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <UserCheck className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Claimed
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{stats.claimed}</p>
        </div>
      </div>

      {/* Claimed Tasks Section */}
      {claimedItems.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-blue-50/50 dark:bg-blue-950/20 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Claimed Tasks</CardTitle>
                <CardDescription className="text-xs">
                  Tasks you&apos;ve started but not yet completed
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground w-12">
                    <span className="sr-only">Number</span>
                    <Hash className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Task
                  </TableHead>
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claimedItems.map((item, index) => (
                  <TableRow key={item._id} className="group transition-colors">
                    <TableCell className="px-6 py-4 text-muted-foreground">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs tabular-nums"
                      >
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="space-y-0.5">
                        <div className="font-medium">{item.taskName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.session ? item.session.title : 'Unknown session'} ·{' '}
                          {item.card.order ? `Card ${item.card.order}: ` : ''}
                          {item.card.title}
                          {item.card.assignedPlayerRoleTitle ? (
                            <> · Assigned: {item.card.assignedPlayerRoleTitle}</>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-muted-foreground">
                      <span className="font-mono text-xs">
                        {new Date(item._creationTime).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="default"
                        className="group/btn gap-1.5 transition-all"
                      >
                        <Link
                          to="/simple/tasks/store/$workItemId"
                          params={{ workItemId: item.workItemId }}
                        >
                          <span>Continue</span>
                          <ChevronRight className="h-3.5 w-3.5 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pending Tasks Section */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Pending Tasks</CardTitle>
              <CardDescription className="text-xs">
                Tasks available for you to claim based on your role
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pendingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ListTodo className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">
                {claimedItems.length > 0
                  ? 'No pending tasks'
                  : 'No tasks in queue'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {claimedItems.length > 0
                  ? 'Complete your claimed tasks to advance the exercise'
                  : 'Create a session to generate the first exercise card'}
              </p>
              {claimedItems.length === 0 && (
                <Button asChild size="sm" className="mt-4">
                  <Link to="/simple/new">
                    <Plus className="mr-2 h-4 w-4" />
                    New Session
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground w-12">
                    <span className="sr-only">Number</span>
                    <Hash className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Task
                  </TableHead>
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Created
                  </TableHead>
                  <TableHead className="h-11 px-6 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingItems.map((item, index) => (
                  <TableRow key={item._id} className="group transition-colors">
                    <TableCell className="px-6 py-4 text-muted-foreground">
                      <Badge
                        variant="outline"
                        className="font-mono text-xs tabular-nums"
                      >
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="space-y-0.5">
                        <div className="font-medium">{item.taskName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.session ? item.session.title : 'Unknown session'} ·{' '}
                          {item.card.order ? `Card ${item.card.order}: ` : ''}
                          {item.card.title}
                          {item.card.assignedPlayerRoleTitle ? (
                            <> · Assigned: {item.card.assignedPlayerRoleTitle}</>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-muted-foreground">
                      <span className="font-mono text-xs">
                        {new Date(item._creationTime).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="group/btn gap-1.5 transition-all"
                      >
                        <Link
                          to="/simple/tasks/store/$workItemId"
                          params={{ workItemId: item.workItemId }}
                        >
                          <span>Claim & Start</span>
                          <ChevronRight className="h-3.5 w-3.5 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function QueuePageSkeleton() {
  return (
    <div className="p-6 lg:p-8">
      <div className="animate-pulse space-y-8">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-4 w-72 bg-muted rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 bg-muted rounded" />
            <div className="h-9 w-32 bg-muted rounded" />
          </div>
        </div>
        <div className="h-px bg-muted" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-20 bg-muted rounded-lg" />
        </div>
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
