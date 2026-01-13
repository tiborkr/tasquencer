import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { ClipboardCheck, Plus, ListTodo, Hash, CheckCircle2, Clock } from 'lucide-react'

export const Route = createFileRoute('/_app/simple/')({
  component: SessionsIndex,
})

function SessionsIndex() {
  const sessionsQ = convexQuery(api.workflows.cstabletops.api.getSessions, {})
  const capabilitiesQ = convexQuery(api.workflows.cstabletops.api.getUserCapabilities, {})

  const { data: capabilities, isLoading: capsLoading } = useQuery(capabilitiesQ)
  const canCreateSessions = capabilities?.canCreateSessions ?? false

  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery({ ...sessionsQ, enabled: canCreateSessions })

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed').length
    const active = sessions.filter((s) => s.status === 'active').length
    return { total: sessions.length, completed, active }
  }, [sessions])

  if (capsLoading || (canCreateSessions && sessionsLoading)) {
    return <SessionsPageSkeleton />
  }

  if (!canCreateSessions) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Tabletop Sessions</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link to="/simple/join">Join Session</Link>
            </Button>
          </div>
        </div>

        <div className="border rounded-lg p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            You don’t have access to manage sessions yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Use a join code from a facilitator to participate in an exercise.
          </p>
          <div className="flex justify-center">
            <Button asChild size="sm">
              <Link to="/simple/join">Join with code</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (sessionsError) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <ClipboardCheck className="h-5 w-5" />
          <p className="text-sm font-medium">Unable to load sessions</p>
        </div>
        <p className="text-sm text-muted-foreground">Please try again or check your access.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Tabletop Sessions</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple/queue">
              <ListTodo className="mr-2 h-4 w-4" />
              Work Queue
            </Link>
          </Button>
          {canCreateSessions && (
            <Button asChild size="sm">
              <Link to="/simple/new">
                <Plus className="mr-2 h-4 w-4" />
                New Session
              </Link>
            </Button>
          )}
        </div>
      </div>

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
              Active
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{stats.active}</p>
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
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <ClipboardCheck className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No sessions yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {canCreateSessions
              ? 'Create a session to generate the first exercise card'
              : 'Join a session using a join code to get started'}
          </p>
          {canCreateSessions ? (
            <Button asChild size="sm" className="mt-4">
              <Link to="/simple/new">
                <Plus className="mr-2 h-4 w-4" />
                New Session
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="mt-4">
              <Link to="/simple/join">
                Join Session
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session, index) => (
                <TableRow key={session._id}>
                  <TableCell className="text-muted-foreground font-mono">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-medium">{session.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {session.exerciseTitle}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        session.status === 'completed'
                          ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                          : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                      }
                    >
                      {session.status === 'completed' ? 'Completed' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/simple/session/$sessionId" params={{ sessionId: session._id }}>
                        View
                      </Link>
                    </Button>
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

function SessionsPageSkeleton() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-40 bg-muted rounded" />
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
