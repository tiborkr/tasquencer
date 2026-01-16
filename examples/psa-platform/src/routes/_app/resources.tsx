import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState } from 'react'
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
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'
import {
  Plus,
  Users,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react'

export const Route = createFileRoute('/_app/resources')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Resources',
  }),
})

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDateRange(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} - ${endStr}`
}

function RouteComponent() {
  const [createBookingOpen, setCreateBookingOpen] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()))

  // Get current user
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)

  // Get organization users (team members)
  const users = useQuery(
    api.workflows.dealToDelivery.api.getUsers,
    currentUser?.organizationId ? { organizationId: currentUser.organizationId } : 'skip'
  )

  // Get user's projects for booking form
  const myProjects = useQuery(api.workflows.dealToDelivery.api.getMyProjects)

  // Week end for display
  const weekEnd = new Date(selectedWeek)
  weekEnd.setDate(weekEnd.getDate() + 7)

  // Form state
  const [formUserId, setFormUserId] = useState<Id<'users'> | ''>('')
  const [formProjectId, setFormProjectId] = useState<Id<'projects'> | ''>('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formHoursPerDay, setFormHoursPerDay] = useState('8')
  const [formType, setFormType] = useState<'Tentative' | 'Confirmed' | 'TimeOff'>('Tentative')
  const [formNotes, setFormNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // User type from query
  type User = NonNullable<typeof users>[number]

  // Mutations
  const createBookingMutation = useMutation(api.workflows.dealToDelivery.api.createBooking)

  // Navigation
  const goToPreviousWeek = () => {
    const newWeek = new Date(selectedWeek)
    newWeek.setDate(newWeek.getDate() - 7)
    setSelectedWeek(newWeek)
  }

  const goToNextWeek = () => {
    const newWeek = new Date(selectedWeek)
    newWeek.setDate(newWeek.getDate() + 7)
    setSelectedWeek(newWeek)
  }

  const goToCurrentWeek = () => {
    setSelectedWeek(getWeekStart(new Date()))
  }

  // Reset form
  const resetForm = () => {
    setFormUserId('')
    setFormProjectId('')
    setFormStartDate('')
    setFormEndDate('')
    setFormHoursPerDay('8')
    setFormType('Tentative')
    setFormNotes('')
    setFormError(null)
  }

  // Open create booking dialog
  const openCreateBooking = () => {
    resetForm()
    // Set default dates to selected week
    setFormStartDate(selectedWeek.toISOString().split('T')[0])
    const end = new Date(selectedWeek)
    end.setDate(end.getDate() + 4) // Mon-Fri
    setFormEndDate(end.toISOString().split('T')[0])
    setCreateBookingOpen(true)
  }

  // Handle create booking
  const handleCreateBooking = async () => {
    if (!formUserId || !formProjectId || !formStartDate || !formEndDate) {
      setFormError('Please fill in all required fields')
      return
    }

    const hoursPerDay = parseFloat(formHoursPerDay)
    if (isNaN(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
      setFormError('Hours per day must be between 0 and 24')
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      await createBookingMutation({
        userId: formUserId,
        projectId: formProjectId,
        startDate: new Date(formStartDate).getTime(),
        endDate: new Date(formEndDate).getTime(),
        hoursPerDay,
        type: formType,
        notes: formNotes || undefined,
      })

      setCreateBookingOpen(false)
      resetForm()
    } catch (err) {
      console.error('Failed to create booking:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to create booking')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (currentUser === undefined || users === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Resource Scheduler</h1>
          <p className="text-muted-foreground">
            View team availability and manage bookings
          </p>
        </div>
        <Button onClick={openCreateBooking}>
          <Plus className="h-4 w-4 mr-2" />
          Create Booking
        </Button>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-4">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">
                {formatDateRange(selectedWeek, weekEnd)}
              </span>
              <Button variant="ghost" size="sm" onClick={goToCurrentWeek}>
                Today
              </Button>
            </div>
            <Button variant="outline" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Availability</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team members found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user: User) => (
                  <TableRow key={user._id}>
                    <TableCell className="font-medium">
                      {user.name || user.email || 'Unnamed User'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.role || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.department || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        Available
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
          <span>Confirmed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300" />
          <span>Tentative</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-purple-100 border border-purple-300" />
          <span>Time Off</span>
        </div>
      </div>

      {/* Create Booking Dialog */}
      <Dialog open={createBookingOpen} onOpenChange={setCreateBookingOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Booking</DialogTitle>
            <DialogDescription>
              Allocate a team member to a project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Team Member */}
            <div className="space-y-2">
              <Label>Team Member *</Label>
              <Select
                value={formUserId}
                onValueChange={(value) => setFormUserId(value as Id<'users'>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((user: User) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name || user.email || 'Unnamed User'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
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
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Hours per day */}
            <div className="space-y-2">
              <Label htmlFor="hoursPerDay">Hours per Day</Label>
              <Input
                id="hoursPerDay"
                type="number"
                value={formHoursPerDay}
                onChange={(e) => setFormHoursPerDay(e.target.value)}
                min="1"
                max="24"
              />
            </div>

            {/* Booking Type */}
            <div className="space-y-2">
              <Label>Booking Type</Label>
              <Select
                value={formType}
                onValueChange={(value) => setFormType(value as typeof formType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tentative">Tentative</SelectItem>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="TimeOff">Time Off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional notes..."
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
            <Button variant="outline" onClick={() => setCreateBookingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBooking} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
