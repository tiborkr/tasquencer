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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import { Checkbox } from '@repo/ui/components/checkbox'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

export const Route = createFileRoute('/_app/timesheet')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Timesheet',
  }),
})

// Get Monday of the week for a given date
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Format date as "Mon 6"
function formatDayHeader(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
}

// Format date range as "Jan 6-12, 2025"
function formatWeekRange(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

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

// Status badge color
const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Submitted: 'bg-blue-100 text-blue-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Locked: 'bg-purple-100 text-purple-700',
}

function RouteComponent() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [addEntryOpen, setAddEntryOpen] = useState(false)

  // Get current user
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)

  // Get timesheet data
  const timesheetData = useQuery(
    api.workflows.dealToDelivery.api.getTimesheet,
    currentUser ? { userId: currentUser._id, weekStart: weekStart.getTime() } : 'skip'
  )

  // Get user's projects for time entry form
  const myProjects = useQuery(api.workflows.dealToDelivery.api.getMyProjects)

  // Add Entry form state
  const [formProjectId, setFormProjectId] = useState<Id<'projects'> | ''>('')
  const [formDate, setFormDate] = useState('')
  const [formHours, setFormHours] = useState('')
  const [formBillable, setFormBillable] = useState(true)
  const [formNotes, setFormNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Create time entry mutation
  const createTimeEntryMutation = useMutation(api.workflows.dealToDelivery.api.createTimeEntry)
  const submitTimeEntryMutation = useMutation(api.workflows.dealToDelivery.api.submitTimeEntryMutation)

  // Generate week days array
  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart)
      day.setDate(day.getDate() + i)
      days.push(day)
    }
    return days
  }, [weekStart])

  // Group entries by date
  type TimeEntry = NonNullable<typeof timesheetData>['entries'][number]
  const entriesByDate = useMemo(() => {
    const grouped: Record<string, TimeEntry[]> = {}
    weekDays.forEach(day => {
      grouped[day.toISOString().split('T')[0]] = []
    })

    timesheetData?.entries.forEach(entry => {
      const dateKey = new Date(entry.date).toISOString().split('T')[0]
      if (grouped[dateKey]) {
        grouped[dateKey].push(entry)
      }
    })

    return grouped
  }, [timesheetData?.entries, weekDays])

  // Calculate daily totals
  const dailyTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    weekDays.forEach(day => {
      const dateKey = day.toISOString().split('T')[0]
      totals[dateKey] = entriesByDate[dateKey]?.reduce((sum, e) => sum + e.hours, 0) ?? 0
    })
    return totals
  }, [entriesByDate, weekDays])

  // Navigate weeks
  const goToPreviousWeek = () => {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
  }

  const goToNextWeek = () => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    setWeekStart(next)
  }

  // Reset form
  const resetForm = () => {
    setFormProjectId('')
    setFormDate('')
    setFormHours('')
    setFormBillable(true)
    setFormNotes('')
    setFormError(null)
  }

  // Open add entry dialog for a specific date
  const openAddEntry = (date?: Date) => {
    resetForm()
    if (date) {
      setFormDate(date.toISOString().split('T')[0])
    }
    setAddEntryOpen(true)
  }

  // Handle create time entry
  const handleCreateEntry = async () => {
    if (!formProjectId || !formDate || !formHours) {
      setFormError('Please fill in all required fields')
      return
    }

    const hours = parseFloat(formHours)
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      setFormError('Hours must be between 0.5 and 24')
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      await createTimeEntryMutation({
        projectId: formProjectId,
        date: new Date(formDate).getTime(),
        hours,
        billable: formBillable,
        notes: formNotes || undefined,
      })

      setAddEntryOpen(false)
      resetForm()
    } catch (err) {
      console.error('Failed to create time entry:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to create entry')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle submit week
  const handleSubmitWeek = async () => {
    const draftEntries = timesheetData?.entries.filter(e => e.status === 'Draft') ?? []
    if (draftEntries.length === 0) {
      return
    }

    setIsSubmitting(true)
    try {
      for (const entry of draftEntries) {
        await submitTimeEntryMutation({ timeEntryId: entry._id })
      }
    } catch (err) {
      console.error('Failed to submit timesheet:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (currentUser === undefined || timesheetData === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  const draftCount = timesheetData?.summary.byStatus.draft ?? 0
  const submittedCount = timesheetData?.summary.byStatus.submitted ?? 0
  const approvedCount = timesheetData?.summary.byStatus.approved ?? 0
  const rejectedCount = timesheetData?.summary.byStatus.rejected ?? 0

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Timesheet</h1>
          <p className="text-muted-foreground">
            Track your time by project
          </p>
        </div>
        <Button onClick={() => openAddEntry()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </div>

      {/* Week Navigator */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold">
              {formatWeekRange(weekStart)}
            </div>
            <Button variant="outline" size="sm" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {timesheetData?.summary.totalHours ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Total Hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {timesheetData?.summary.billableHours ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Billable</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-600">
              {(timesheetData?.summary.totalHours ?? 0) - (timesheetData?.summary.billableHours ?? 0)}
            </div>
            <div className="text-sm text-muted-foreground">Non-billable</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex gap-2 justify-center">
              {draftCount > 0 && <Badge variant="secondary">{draftCount} Draft</Badge>}
              {submittedCount > 0 && <Badge className="bg-blue-100 text-blue-700">{submittedCount} Submitted</Badge>}
              {approvedCount > 0 && <Badge className="bg-green-100 text-green-700">{approvedCount} Approved</Badge>}
              {rejectedCount > 0 && <Badge className="bg-red-100 text-red-700">{rejectedCount} Rejected</Badge>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Status</div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Time Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-4">
            {weekDays.map(day => {
              const dateKey = day.toISOString().split('T')[0]
              const entries = entriesByDate[dateKey] ?? []
              const dayTotal = dailyTotals[dateKey] ?? 0
              const isToday = day.toDateString() === new Date().toDateString()

              return (
                <div
                  key={dateKey}
                  className={`min-h-[200px] rounded-lg border p-3 ${
                    isToday ? 'border-primary bg-primary/5' : 'border-muted'
                  }`}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={`text-sm font-medium ${isToday ? 'text-primary' : ''}`}>
                      {formatDayHeader(day)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {dayTotal > 0 && `${dayTotal}h`}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {entries.map(entry => (
                      <div
                        key={entry._id}
                        className="p-2 rounded bg-muted/50 text-sm"
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-medium truncate">
                            {entry.hours}h
                          </span>
                          <Badge className={STATUS_COLORS[entry.status]} variant="secondary">
                            {entry.billable ? '●' : '○'}
                          </Badge>
                        </div>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {entries.length === 0 && (
                    <button
                      onClick={() => openAddEntry(day)}
                      className="w-full h-full min-h-[100px] flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 rounded transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}

                  {entries.length > 0 && (
                    <button
                      onClick={() => openAddEntry(day)}
                      className="w-full mt-2 p-2 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 rounded transition-colors text-sm"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Submit Week Button */}
      {draftCount > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmitWeek}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Week for Approval ({draftCount} entries)
          </Button>
        </div>
      )}

      {/* Add Entry Dialog */}
      <Dialog open={addEntryOpen} onOpenChange={setAddEntryOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Time Entry</DialogTitle>
            <DialogDescription>
              Log time for a project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Project Selection */}
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select
                value={formProjectId}
                onValueChange={(value) => setFormProjectId(value as Id<'projects'>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  {myProjects?.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {myProjects?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No projects found. You must be assigned to projects to log time.
                </p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            {/* Hours */}
            <div className="space-y-2">
              <Label htmlFor="hours">Hours *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="hours"
                  type="number"
                  placeholder="8"
                  className="pl-9"
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                  min="0.5"
                  max="24"
                  step="0.5"
                />
              </div>
            </div>

            {/* Billable */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="billable"
                checked={formBillable}
                onCheckedChange={(checked) => setFormBillable(!!checked)}
              />
              <Label htmlFor="billable" className="font-normal cursor-pointer">
                Billable time
              </Label>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="What did you work on?"
                rows={3}
              />
            </div>

            {/* Error */}
            {formError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEntryOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateEntry}
              disabled={!formProjectId || !formDate || !formHours || isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
