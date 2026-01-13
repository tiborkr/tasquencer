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
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import {
  MessageSquare,
  Plus,
  ListTodo,
  Hash,
  CheckCircle2,
  Clock,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/')({
  component: SimpleIndex,
})

function SimpleIndex() {
  return (
    <Suspense fallback={<UcampaignUapprovalsPageSkeleton />}>
      <UcampaignUapprovalsPageInner />
    </Suspense>
  )
}

function UcampaignUapprovalsPageInner() {
  const q = convexQuery(api.workflows.LUcampaignUapproval.api.getUcampaignUapprovals, {})
  const { data: LUcampaignUapprovals } = useSuspenseQuery(q)

  // Calculate stats
  const stats = useMemo(() => {
    const completed = LUcampaignUapprovals.filter((g) => g.message).length
    const pending = LUcampaignUapprovals.filter((g) => !g.message).length
    return { total: LUcampaignUapprovals.length, completed, pending }
  }, [LUcampaignUapprovals])

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">UcampaignUapprovals</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple/queue">
              <ListTodo className="mr-2 h-4 w-4" />
              Work Queue
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/simple/new">
              <Plus className="mr-2 h-4 w-4" />
              New UcampaignUapproval
            </Link>
          </Button>
        </div>
      </div>

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
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Completed
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{stats.completed}</p>
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
      </div>

      {/* UcampaignUapprovals Table */}
      {LUcampaignUapprovals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No LUcampaignUapprovals yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first LUcampaignUapproval to get started
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/simple/new">
              <Plus className="mr-2 h-4 w-4" />
              New UcampaignUapproval
            </Link>
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">#</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LUcampaignUapprovals.map((LUcampaignUapproval, index) => (
                <TableRow key={LUcampaignUapproval._id}>
                  <TableCell className="text-muted-foreground font-mono">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    {LUcampaignUapproval.message ? (
                      <span className="font-medium">{LUcampaignUapproval.message}</span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Pending...
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {new Date(LUcampaignUapproval.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        LUcampaignUapproval.message
                          ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                          : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                      }
                    >
                      {LUcampaignUapproval.message ? 'Completed' : 'Pending'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function UcampaignUapprovalsPageSkeleton() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 bg-muted rounded" />
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-muted rounded" />
            <div className="h-9 w-32 bg-muted rounded" />
          </div>
        </div>
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
