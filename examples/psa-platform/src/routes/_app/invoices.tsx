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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'
import {
  Plus,
  FileText,
  Loader2,
  AlertTriangle,
  Send,
  DollarSign,
  Check,
} from 'lucide-react'

export const Route = createFileRoute('/_app/invoices')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Invoices',
  }),
})

const BILLING_METHODS = ['TimeAndMaterials', 'FixedFee', 'Milestone', 'Recurring'] as const
type BillingMethod = (typeof BILLING_METHODS)[number]

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Finalized: 'bg-blue-100 text-blue-700',
  Sent: 'bg-purple-100 text-purple-700',
  Viewed: 'bg-yellow-100 text-yellow-700',
  Paid: 'bg-green-100 text-green-700',
  PartiallyPaid: 'bg-orange-100 text-orange-700',
  Overdue: 'bg-red-100 text-red-700',
  Void: 'bg-gray-100 text-gray-700',
}

const METHOD_LABELS: Record<BillingMethod, string> = {
  TimeAndMaterials: 'Time & Materials',
  FixedFee: 'Fixed Fee',
  Milestone: 'Milestone',
  Recurring: 'Recurring',
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function RouteComponent() {
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false)

  // Get current user
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)

  // Get user's projects for invoice form
  const myProjects = useQuery(api.workflows.dealToDelivery.api.getMyProjects)

  // Form state
  const [formProjectId, setFormProjectId] = useState<Id<'projects'> | ''>('')
  const [formMethod, setFormMethod] = useState<BillingMethod | ''>('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formIncludeTime, setFormIncludeTime] = useState(true)
  const [formIncludeExpenses, setFormIncludeExpenses] = useState(true)
  const [formGroupBy, setFormGroupBy] = useState<'service' | 'task' | 'date' | 'person'>('service')
  const [formDetailLevel, setFormDetailLevel] = useState<'summary' | 'detailed'>('summary')
  const [formInvoiceAmount, setFormInvoiceAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Get invoices for the selected project
  const invoices = useQuery(
    api.workflows.dealToDelivery.api.listInvoices,
    formProjectId ? { projectId: formProjectId } : 'skip'
  )

  // Get uninvoiced items for preview
  const uninvoicedItems = useQuery(
    api.workflows.dealToDelivery.api.getUninvoicedItems,
    formProjectId && formStartDate && formEndDate
      ? {
          projectId: formProjectId,
          startDate: new Date(formStartDate).getTime(),
          endDate: new Date(formEndDate).getTime(),
        }
      : 'skip'
  )

  // Invoice type from query
  type Invoice = NonNullable<typeof invoices>[number]

  // Mutations
  const createInvoiceMutation = useMutation(api.workflows.dealToDelivery.api.createInvoice)
  const finalizeInvoiceMutation = useMutation(api.workflows.dealToDelivery.api.finalizeInvoiceMutation)
  const sendInvoiceMutation = useMutation(api.workflows.dealToDelivery.api.sendInvoiceMutation)

  // Calculate preview totals
  const previewTotals = useMemo(() => {
    if (!uninvoicedItems) return { time: 0, expenses: 0, total: 0, timeCount: 0, expenseCount: 0 }

    const timeTotal = formIncludeTime ? uninvoicedItems.totals.time : 0
    const expenseTotal = formIncludeExpenses ? uninvoicedItems.totals.expenses : 0

    return {
      time: timeTotal,
      expenses: expenseTotal,
      total: timeTotal + expenseTotal,
      timeCount: uninvoicedItems.timeEntries.length,
      expenseCount: uninvoicedItems.expenses.length,
    }
  }, [uninvoicedItems, formIncludeTime, formIncludeExpenses])

  // Reset form
  const resetForm = () => {
    setFormProjectId('')
    setFormMethod('')
    setFormStartDate('')
    setFormEndDate('')
    setFormIncludeTime(true)
    setFormIncludeExpenses(true)
    setFormGroupBy('service')
    setFormDetailLevel('summary')
    setFormInvoiceAmount('')
    setFormDescription('')
    setFormNotes('')
    setFormError(null)
  }

  // Open create invoice dialog
  const openCreateInvoice = () => {
    resetForm()
    // Set default date range to current month
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setFormStartDate(firstDay.toISOString().split('T')[0])
    setFormEndDate(lastDay.toISOString().split('T')[0])
    setCreateInvoiceOpen(true)
  }

  // Handle create invoice
  const handleCreateInvoice = async (finalize = false) => {
    if (!formProjectId || !formMethod) {
      setFormError('Please select a project and billing method')
      return
    }

    if (formMethod === 'TimeAndMaterials' && (!formStartDate || !formEndDate)) {
      setFormError('Please select a date range')
      return
    }

    if ((formMethod === 'FixedFee' || formMethod === 'Recurring') && !formInvoiceAmount) {
      setFormError('Please enter an invoice amount')
      return
    }

    const amount = parseFloat(formInvoiceAmount)
    if ((formMethod === 'FixedFee' || formMethod === 'Recurring') && (isNaN(amount) || amount <= 0)) {
      setFormError('Amount must be greater than 0')
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      const result = await createInvoiceMutation({
        projectId: formProjectId,
        method: formMethod,
        ...(formMethod === 'TimeAndMaterials' && {
          dateRange: {
            start: new Date(formStartDate).getTime(),
            end: new Date(formEndDate).getTime(),
          },
          includeExpenses: formIncludeExpenses,
          groupBy: formGroupBy,
          detailLevel: formDetailLevel,
        }),
        ...((formMethod === 'FixedFee' || formMethod === 'Recurring') && {
          invoiceAmount: Math.round(amount * 100),
          description: formDescription || 'Invoice',
        }),
      })

      if (finalize && result.invoiceId) {
        await finalizeInvoiceMutation({ invoiceId: result.invoiceId })
      }

      setCreateInvoiceOpen(false)
      resetForm()
    } catch (err) {
      console.error('Failed to create invoice:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle finalize invoice
  const handleFinalizeInvoice = async (invoiceId: Id<'invoices'>) => {
    try {
      await finalizeInvoiceMutation({ invoiceId })
    } catch (err) {
      console.error('Failed to finalize invoice:', err)
    }
  }

  // Handle send invoice
  const handleSendInvoice = async (invoiceId: Id<'invoices'>) => {
    try {
      await sendInvoiceMutation({ invoiceId, method: 'email' })
    } catch (err) {
      console.error('Failed to send invoice:', err)
    }
  }

  if (currentUser === undefined) {
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
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">
            Create and manage project invoices
          </p>
        </div>
        <Button onClick={openCreateInvoice}>
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Project Selector for Invoice List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">View Invoices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Label>Select Project</Label>
            <Select
              value={formProjectId}
              onValueChange={(value) => setFormProjectId(value as Id<'projects'>)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project to view invoices..." />
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

          {formProjectId && invoices && (
            <>
              {invoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No invoices for this project yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice: Invoice) => (
                      <TableRow key={invoice._id}>
                        <TableCell className="font-mono">
                          {invoice.number || 'Draft'}
                        </TableCell>
                        <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                        <TableCell>
                          {METHOD_LABELS[invoice.method as BillingMethod] || invoice.method}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[invoice.status]} variant="secondary">
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {invoice.status === 'Draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleFinalizeInvoice(invoice._id)}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Finalize
                              </Button>
                            )}
                            {invoice.status === 'Finalized' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSendInvoice(invoice._id)}
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Send
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Create a new invoice for a project.
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
            </div>

            {/* Billing Method */}
            <div className="space-y-2">
              <Label>Billing Method *</Label>
              <Select
                value={formMethod}
                onValueChange={(value) => setFormMethod(value as BillingMethod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TimeAndMaterials">
                    Time & Materials - Bill for logged time + expenses
                  </SelectItem>
                  <SelectItem value="FixedFee">
                    Fixed Fee - Bill portion of project budget
                  </SelectItem>
                  <SelectItem value="Milestone">
                    Milestone - Bill for completed milestone
                  </SelectItem>
                  <SelectItem value="Recurring">
                    Recurring - Monthly retainer invoice
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time & Materials Options */}
            {formMethod === 'TimeAndMaterials' && (
              <>
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-4">Time & Materials Options</h4>

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

                  <div className="flex flex-col gap-2 mt-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeTime"
                        checked={formIncludeTime}
                        onCheckedChange={(checked) => setFormIncludeTime(!!checked)}
                      />
                      <Label htmlFor="includeTime" className="font-normal cursor-pointer">
                        Include approved time entries ({previewTotals.timeCount} entries)
                        <span className="ml-2 text-muted-foreground">
                          {formatCurrency(previewTotals.time)}
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeExpenses"
                        checked={formIncludeExpenses}
                        onCheckedChange={(checked) => setFormIncludeExpenses(!!checked)}
                      />
                      <Label htmlFor="includeExpenses" className="font-normal cursor-pointer">
                        Include approved expenses ({previewTotals.expenseCount} expenses)
                        <span className="ml-2 text-muted-foreground">
                          {formatCurrency(previewTotals.expenses)}
                        </span>
                      </Label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>Group line items by</Label>
                      <Select
                        value={formGroupBy}
                        onValueChange={(value) => setFormGroupBy(value as typeof formGroupBy)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="service">Service (recommended)</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="person">Person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Detail level</Label>
                      <Select
                        value={formDetailLevel}
                        onValueChange={(value) => setFormDetailLevel(value as typeof formDetailLevel)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="summary">Summary (grouped totals)</SelectItem>
                          <SelectItem value="detailed">Detailed (individual entries)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Preview Total */}
                  <div className="border-t mt-4 pt-4">
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <span>Preview Total:</span>
                      <span>{formatCurrency(previewTotals.total)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Fixed Fee / Recurring Options */}
            {(formMethod === 'FixedFee' || formMethod === 'Recurring') && (
              <div className="border-t pt-4 space-y-4">
                <h4 className="font-medium">
                  {formMethod === 'FixedFee' ? 'Fixed Fee' : 'Recurring'} Options
                </h4>

                <div className="space-y-2">
                  <Label htmlFor="amount">Invoice Amount ($) *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0.00"
                      className="pl-9"
                      value={formInvoiceAmount}
                      onChange={(e) => setFormInvoiceAmount(e.target.value)}
                      min="0.01"
                      step="0.01"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Input
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g., Project milestone payment"
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes to Client</Label>
              <Textarea
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Thank you for your business..."
                rows={2}
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

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setCreateInvoiceOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCreateInvoice(false)}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save as Draft
            </Button>
            <Button
              onClick={() => handleCreateInvoice(true)}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create & Finalize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
