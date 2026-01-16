import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useMemo } from 'react'
import type { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog'
import { Textarea } from '@repo/ui/components/textarea'
import { Label } from '@repo/ui/components/label'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'
import { Checkbox } from '@repo/ui/components/checkbox'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/tabs'
import {
  Clock,
  Loader2,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  User,
} from 'lucide-react'

export const Route = createFileRoute('/_app/approvals-timesheets')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Timesheet Approvals',
  }),
})

// Format date range as "Jan 6-12, 2025"
function formatWeekRange(weekStartMs: number): string {
  const start = new Date(weekStartMs)
  const end = new Date(weekStartMs + 6 * 24 * 60 * 60 * 1000)

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const year = start.getFullYear()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}, ${year}`
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function RouteComponent() {
  const [activeTab, setActiveTab] = useState<'Submitted' | 'Approved' | 'Rejected'>('Submitted')
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<Id<'timeEntries'>>>(new Set())
  const [selectedTimesheetKey, setSelectedTimesheetKey] = useState<string | null>(null)
  const [expandedTimesheets, setExpandedTimesheets] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Get current user
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)

  // Get submitted timesheets for approval
  const timesheetsData = useQuery(
    api.workflows.dealToDelivery.api.getSubmittedTimesheetsForApproval,
    currentUser?.organizationId
      ? { organizationId: currentUser.organizationId, status: activeTab }
      : 'skip'
  )

  // Mutations
  const approveTimesheetMutation = useMutation(api.workflows.dealToDelivery.api.approveTimesheet)
  const rejectTimesheetMutation = useMutation(api.workflows.dealToDelivery.api.rejectTimesheet)

  // Get timesheet type from query
  type Timesheet = NonNullable<typeof timesheetsData>['timesheets'][number]

  // Get unique timesheet key
  const getTimesheetKey = (t: Timesheet) => `${t.userId}-${t.weekStart}`

  // Toggle timesheet expansion
  const toggleExpand = (key: string) => {
    setExpandedTimesheets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Toggle selection for a timesheet
  const toggleTimesheetSelection = (timesheet: Timesheet) => {
    const entryIds = timesheet.entries.map((e) => e._id)

    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      const allSelected = entryIds.every((id) => prev.has(id))

      if (allSelected) {
        // Deselect all
        entryIds.forEach((id) => next.delete(id))
      } else {
        // Select all
        entryIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Check if a timesheet is fully selected
  const isTimesheetSelected = (timesheet: Timesheet): boolean => {
    return timesheet.entries.every((e) => selectedEntryIds.has(e._id))
  }

  // Check if a timesheet is partially selected
  const isTimesheetPartiallySelected = (timesheet: Timesheet): boolean => {
    const selected = timesheet.entries.filter((e) => selectedEntryIds.has(e._id))
    return selected.length > 0 && selected.length < timesheet.entries.length
  }

  // Handle approve timesheet
  const handleApprove = async (timesheet: Timesheet) => {
    const entryIds = timesheet.entries.map((e) => e._id)
    setIsSubmitting(true)
    try {
      await approveTimesheetMutation({ timeEntryIds: entryIds })
      setSelectedEntryIds((prev) => {
        const next = new Set(prev)
        entryIds.forEach((id) => next.delete(id))
        return next
      })
    } catch (err) {
      console.error('Failed to approve timesheet:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (selectedEntryIds.size === 0) return

    setIsSubmitting(true)
    try {
      await approveTimesheetMutation({ timeEntryIds: Array.from(selectedEntryIds) })
      setSelectedEntryIds(new Set())
    } catch (err) {
      console.error('Failed to approve timesheets:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open reject dialog for a timesheet
  const openRejectDialog = (timesheet: Timesheet) => {
    setSelectedTimesheetKey(getTimesheetKey(timesheet))
    // Select all entries for this timesheet
    const entryIds = timesheet.entries.map((e) => e._id)
    setSelectedEntryIds(new Set(entryIds))
    setRejectReason('')
    setFormError(null)
    setRejectDialogOpen(true)
  }

  // Handle reject submission
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setFormError('Please provide a reason for rejection')
      return
    }

    if (selectedEntryIds.size === 0) {
      setFormError('No entries selected')
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      await rejectTimesheetMutation({
        timeEntryIds: Array.from(selectedEntryIds),
        comments: rejectReason,
      })
      setRejectDialogOpen(false)
      setSelectedEntryIds(new Set())
      setRejectReason('')
    } catch (err) {
      console.error('Failed to reject timesheet:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to reject timesheet')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Get selected timesheet info for reject dialog
  const selectedTimesheet = useMemo(() => {
    if (!selectedTimesheetKey || !timesheetsData) return null
    return timesheetsData.timesheets.find(
      (t) => getTimesheetKey(t) === selectedTimesheetKey
    )
  }, [selectedTimesheetKey, timesheetsData])

  // Calculate selected totals
  const selectedTotals = useMemo(() => {
    if (!timesheetsData) return { count: 0, hours: 0 }

    let hours = 0
    const selectedTimesheets = new Set<string>()

    for (const ts of timesheetsData.timesheets) {
      for (const entry of ts.entries) {
        if (selectedEntryIds.has(entry._id)) {
          hours += entry.hours
          selectedTimesheets.add(getTimesheetKey(ts))
        }
      }
    }

    return { count: selectedTimesheets.size, hours }
  }, [selectedEntryIds, timesheetsData])

  if (currentUser === undefined || timesheetsData === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  const { timesheets, summary } = timesheetsData

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Timesheet Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve submitted timesheets from your team
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary.pendingCount}
            </div>
            <div className="text-sm text-muted-foreground">Pending Approval</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary.pendingHours.toFixed(1)}h
            </div>
            <div className="text-sm text-muted-foreground">Pending Hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {summary.approvedCount}
            </div>
            <div className="text-sm text-muted-foreground">Approved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {summary.rejectedCount}
            </div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="Submitted">
            Pending ({activeTab === 'Submitted' ? timesheets.length : summary.pendingCount})
          </TabsTrigger>
          <TabsTrigger value="Approved">
            Approved ({activeTab === 'Approved' ? timesheets.length : summary.approvedCount})
          </TabsTrigger>
          <TabsTrigger value="Rejected">
            Rejected ({activeTab === 'Rejected' ? timesheets.length : summary.rejectedCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {activeTab === 'Submitted' && 'Timesheets Pending Approval'}
                {activeTab === 'Approved' && 'Recently Approved Timesheets'}
                {activeTab === 'Rejected' && 'Rejected Timesheets'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timesheets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {activeTab === 'Submitted' && (
                    <p>No timesheets pending approval. All caught up!</p>
                  )}
                  {activeTab === 'Approved' && (
                    <p>No approved timesheets to show.</p>
                  )}
                  {activeTab === 'Rejected' && (
                    <p>No rejected timesheets.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {timesheets.map((timesheet) => {
                    const key = getTimesheetKey(timesheet)
                    const isExpanded = expandedTimesheets.has(key)
                    const isSelected = isTimesheetSelected(timesheet)
                    const isPartial = isTimesheetPartiallySelected(timesheet)

                    // Group entries by project
                    const projectSummary = timesheet.entries.reduce(
                      (acc, entry) => {
                        const projectName = entry.project?.name ?? 'No Project'
                        if (!acc[projectName]) {
                          acc[projectName] = 0
                        }
                        acc[projectName] += entry.hours
                        return acc
                      },
                      {} as Record<string, number>
                    )

                    return (
                      <div
                        key={key}
                        className="border rounded-lg overflow-hidden"
                      >
                        {/* Timesheet Header */}
                        <div className="bg-muted/50 p-4">
                          <div className="flex items-center gap-4">
                            {activeTab === 'Submitted' && (
                              <Checkbox
                                checked={isSelected}
                                ref={(el) => {
                                  if (el && isPartial) {
                                    el.dataset.state = 'indeterminate'
                                  }
                                }}
                                onCheckedChange={() => toggleTimesheetSelection(timesheet)}
                              />
                            )}
                            <button
                              onClick={() => toggleExpand(key)}
                              className="flex items-center gap-2 text-left flex-1"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <div className="flex items-center gap-3">
                                <div className="bg-primary/10 rounded-full p-2">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {timesheet.user?.name ?? 'Unknown User'}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Week of {formatWeekRange(timesheet.weekStart)}
                                  </div>
                                </div>
                              </div>
                            </button>
                            <div className="text-right">
                              <div className="font-medium">
                                {timesheet.totalHours.toFixed(1)}h total
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {timesheet.billableHours.toFixed(1)}h billable
                              </div>
                            </div>
                            {activeTab === 'Submitted' && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openRejectDialog(timesheet)}
                                  disabled={isSubmitting}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(timesheet)}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4 mr-1" />
                                  )}
                                  Approve
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Project summary row */}
                          <div className="flex gap-4 mt-3 ml-10">
                            {Object.entries(projectSummary).map(([project, hours]) => (
                              <Badge
                                key={project}
                                variant="secondary"
                                className="text-xs"
                              >
                                {project}: {hours.toFixed(1)}h
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Expanded Detail */}
                        {isExpanded && (
                          <div className="p-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Project</TableHead>
                                  <TableHead className="text-right">Hours</TableHead>
                                  <TableHead>Billable</TableHead>
                                  <TableHead>Notes</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {timesheet.entries
                                  .sort((a, b) => a.date - b.date)
                                  .map((entry) => (
                                    <TableRow key={entry._id}>
                                      <TableCell>{formatDate(entry.date)}</TableCell>
                                      <TableCell>
                                        {entry.project?.name ?? 'No Project'}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {entry.hours.toFixed(1)}h
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant="secondary"
                                          className={
                                            entry.billable
                                              ? 'bg-green-100 text-green-700'
                                              : 'bg-slate-100 text-slate-700'
                                          }
                                        >
                                          {entry.billable ? 'Billable' : 'Non-billable'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="max-w-[200px] truncate">
                                        {entry.notes ?? '-'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Actions Bar */}
      {activeTab === 'Submitted' && selectedEntryIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4">
          <span className="text-sm">
            Selected: {selectedTotals.count} timesheet(s) ({selectedTotals.hours.toFixed(1)}h)
          </span>
          <Button
            variant="outline"
            onClick={() => setSelectedEntryIds(new Set())}
          >
            Clear Selection
          </Button>
          <Button onClick={handleBulkApprove} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Check className="h-4 w-4 mr-1" />
            Approve All Selected
          </Button>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this timesheet. The team member will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedTimesheet && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="font-medium">{selectedTimesheet.user?.name}</div>
                <div className="text-sm text-muted-foreground">
                  Week of {formatWeekRange(selectedTimesheet.weekStart)} &bull;{' '}
                  {selectedTimesheet.totalHours.toFixed(1)}h total
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rejectReason">Reason for Rejection *</Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Please explain why this timesheet is being rejected..."
                rows={4}
              />
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isSubmitting || !rejectReason.trim()}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
