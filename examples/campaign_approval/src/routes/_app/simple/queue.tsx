import { createFileRoute, Link } from '@tanstack/react-router'
import { Suspense, useMemo, useState } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import {
  ListTodo,
  ArrowLeft,
  Hash,
  Clock,
  UserCheck,
  Inbox,
  ChevronRight,
  Plus,
  Filter,
  Layers,
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

type WorkflowPhase =
  | 'initiation'
  | 'strategy'
  | 'budget'
  | 'creative'
  | 'technical'
  | 'launch'
  | 'execution'
  | 'closure'

const PHASE_OPTIONS: { value: WorkflowPhase | 'all'; label: string }[] = [
  { value: 'all', label: 'All Phases' },
  { value: 'initiation', label: '1. Initiation' },
  { value: 'strategy', label: '2. Strategy' },
  { value: 'budget', label: '3. Budget' },
  { value: 'creative', label: '4. Creative' },
  { value: 'technical', label: '5. Technical' },
  { value: 'launch', label: '6. Launch' },
  { value: 'execution', label: '7. Execution' },
  { value: 'closure', label: '8. Closure' },
]

const PHASE_COLORS: Record<WorkflowPhase, string> = {
  initiation: 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800',
  strategy: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  budget: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  creative: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  technical: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  launch: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  execution: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  closure: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
}

function QueuePageInner() {
  // Filter state
  const [phaseFilter, setPhaseFilter] = useState<WorkflowPhase | 'all'>('all')
  const [groupByPhase, setGroupByPhase] = useState(false)

  // Fetch with API filter when phase is selected
  const q = convexQuery(api.workflows.campaign_approval.api.getCampaignWorkQueue, {
    ...(phaseFilter !== 'all' && { phase: phaseFilter }),
  })
  const { data: workItems } = useSuspenseQuery(q)

  // Calculate stats
  const stats = useMemo(() => {
    const pending = workItems.filter((w) => w.status === 'pending').length
    const claimed = workItems.filter((w) => w.status === 'claimed').length
    return { total: workItems.length, pending, claimed }
  }, [workItems])

  // Group items by phase if enabled
  const groupedWorkItems = useMemo(() => {
    if (!groupByPhase) return null
    const groups: Record<string, typeof workItems> = {}
    for (const item of workItems) {
      const phase = item.phase || 'unknown'
      if (!groups[phase]) groups[phase] = []
      groups[phase].push(item)
    }
    return groups
  }, [workItems, groupByPhase])

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

      {/* Filters Row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={phaseFilter}
            onValueChange={(v) => setPhaseFilter(v as WorkflowPhase | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by phase" />
            </SelectTrigger>
            <SelectContent>
              {PHASE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant={groupByPhase ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGroupByPhase(!groupByPhase)}
        >
          <Layers className="mr-2 h-4 w-4" />
          Group by Phase
        </Button>
        {phaseFilter !== 'all' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPhaseFilter('all')}
          >
            Clear filter
          </Button>
        )}
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
                {workItems.length} task{workItems.length === 1 ? '' : 's'} waiting
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
                Create a new Campaign to add tasks to the queue
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/simple/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Campaign
                </Link>
              </Button>
            </div>
          ) : groupByPhase && groupedWorkItems ? (
            <div className="divide-y">
              {Object.entries(groupedWorkItems).map(([phase, items]) => (
                <div key={phase}>
                  <div className="px-6 py-3 bg-muted/30 flex items-center gap-2">
                    <Badge className={PHASE_COLORS[phase as WorkflowPhase] || ''}>
                      {PHASE_OPTIONS.find((p) => p.value === phase)?.label || phase}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {items.length} task{items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Table>
                    <TableBody>
                      {items.map((item, index) => (
                        <WorkItemRow key={item._id} item={item} index={index} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
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
                    Phase
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
                  <WorkItemRow key={item._id} item={item} index={index} showPhase />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface WorkItemRowProps {
  item: {
    _id: string
    _creationTime: number
    workItemId: string
    taskName: string
    status: string
    phase?: string | null
  }
  index: number
  showPhase?: boolean
}

function WorkItemRow({ item, index, showPhase }: WorkItemRowProps) {
  return (
    <TableRow className="group transition-colors">
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
      {showPhase && (
        <TableCell className="px-6 py-4">
          {item.phase && (
            <Badge className={PHASE_COLORS[item.phase as WorkflowPhase] || 'bg-muted'}>
              {item.phase}
            </Badge>
          )}
        </TableCell>
      )}
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
