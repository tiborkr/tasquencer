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
  component: CampaignQueue,
})

function CampaignQueue() {
  return (
    <Suspense fallback={<QueuePageSkeleton />}>
      <QueuePageInner />
    </Suspense>
  )
}

function QueuePageInner() {
  const q = convexQuery(api.workflows.campaign_approval.api.getCampaignWorkQueue, {})
  const { data: workItems } = useSuspenseQuery(q)

  // Calculate stats
  const stats = useMemo(() => {
    const pending = workItems.filter((w) => w.status === 'pending').length
    const claimed = workItems.filter((w) => w.status === 'claimed').length
    return { total: workItems.length, pending, claimed }
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
              All Campaigns
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/simple/new">
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
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

      {/* Work Items Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Available Tasks</CardTitle>
              <CardDescription className="text-xs">
                Claim a task to start working on it
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {workItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ListTodo className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">No tasks in queue</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a new LCampaign to add tasks to the queue
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/simple/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Campaign
                </Link>
              </Button>
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
                    Status
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
                {workItems.map((item, index) => (
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
                      <span className="font-medium">{item.taskName}</span>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge
                        className={
                          item.status === 'pending'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : item.status === 'claimed'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : ''
                        }
                      >
                        {item.status}
                      </Badge>
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
                        variant={
                          item.status === 'pending' ? 'default' : 'outline'
                        }
                        className="group/btn gap-1.5 transition-all"
                      >
                        <Link
                          to="/simple/tasks/$workItemId"
                          params={{ workItemId: item.workItemId }}
                        >
                          <span>
                            {item.status === 'pending'
                              ? 'Claim & Start'
                              : 'Continue'}
                          </span>
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
