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
  DollarSign,
  Loader2,
  AlertTriangle,
  Receipt,
  Send,
} from 'lucide-react'

export const Route = createFileRoute('/_app/expenses')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Expenses',
  }),
})

const EXPENSE_TYPES = ['Software', 'Travel', 'Materials', 'Subcontractor', 'Other'] as const
type ExpenseType = (typeof EXPENSE_TYPES)[number]

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700',
  Submitted: 'bg-blue-100 text-blue-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
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
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)

  // Get current user
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)

  // Get user's expenses
  const expenses = useQuery(
    api.workflows.dealToDelivery.api.listExpenses,
    currentUser ? { userId: currentUser._id } : 'skip'
  )

  // Get user's projects for expense form
  const myProjects = useQuery(api.workflows.dealToDelivery.api.getMyProjects)

  // Form state
  const [formProjectId, setFormProjectId] = useState<Id<'projects'> | ''>('')
  const [formType, setFormType] = useState<ExpenseType | ''>('')
  const [formDescription, setFormDescription] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formBillable, setFormBillable] = useState(true)
  const [formMarkupRate, setFormMarkupRate] = useState('0')
  const [formNotes, setFormNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Mutations
  const createExpenseMutation = useMutation(api.workflows.dealToDelivery.api.createExpense)
  const submitExpenseMutation = useMutation(api.workflows.dealToDelivery.api.submitExpenseMutation)

  // Calculate billed amount
  const billedAmount = useMemo(() => {
    const amount = parseFloat(formAmount) || 0
    const markup = parseFloat(formMarkupRate) / 100
    return amount * (1 + markup)
  }, [formAmount, formMarkupRate])

  // Expense type from query
  type Expense = NonNullable<typeof expenses>[number]

  // Summary stats
  const summary = useMemo(() => {
    if (!expenses) return { total: 0, draft: 0, pending: 0, approved: 0 }

    return {
      total: expenses.reduce((sum: number, e: Expense) => sum + e.amount, 0),
      draft: expenses.filter((e: Expense) => e.status === 'Draft').length,
      pending: expenses.filter((e: Expense) => e.status === 'Submitted').length,
      approved: expenses.filter((e: Expense) => e.status === 'Approved').length,
    }
  }, [expenses])

  // Reset form
  const resetForm = () => {
    setFormProjectId('')
    setFormType('')
    setFormDescription('')
    setFormAmount('')
    setFormDate('')
    setFormBillable(true)
    setFormMarkupRate('0')
    setFormNotes('')
    setFormError(null)
  }

  // Open add expense dialog
  const openAddExpense = () => {
    resetForm()
    setFormDate(new Date().toISOString().split('T')[0])
    setAddExpenseOpen(true)
  }

  // Handle create expense
  const handleCreateExpense = async (submitAfterCreate = false) => {
    if (!formProjectId || !formType || !formDescription || !formAmount || !formDate) {
      setFormError('Please fill in all required fields')
      return
    }

    const amount = parseFloat(formAmount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Amount must be greater than 0')
      return
    }

    if (formDescription.length < 5) {
      setFormError('Description must be at least 5 characters')
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      // Convert dollars to cents
      const amountInCents = Math.round(amount * 100)
      const markupRate = formBillable ? 1 + parseFloat(formMarkupRate) / 100 : undefined

      const result = await createExpenseMutation({
        projectId: formProjectId,
        type: formType,
        description: formDescription,
        amount: amountInCents,
        currency: 'USD',
        date: new Date(formDate).getTime(),
        billable: formBillable,
        markupRate,
      })

      if (submitAfterCreate && result.expenseId) {
        await submitExpenseMutation({ expenseId: result.expenseId })
      }

      setAddExpenseOpen(false)
      resetForm()
    } catch (err) {
      console.error('Failed to create expense:', err)
      setFormError(err instanceof Error ? err.message : 'Failed to create expense')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle submit expense
  const handleSubmitExpense = async (expenseId: Id<'expenses'>) => {
    try {
      await submitExpenseMutation({ expenseId })
    } catch (err) {
      console.error('Failed to submit expense:', err)
    }
  }

  if (currentUser === undefined || expenses === undefined) {
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
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">
            Track and manage project expenses
          </p>
        </div>
        <Button onClick={openAddExpense}>
          <Plus className="h-4 w-4 mr-2" />
          Log Expense
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">
              {formatCurrency(summary.total)}
            </div>
            <div className="text-sm text-muted-foreground">Total Expenses</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-600">
              {summary.draft}
            </div>
            <div className="text-sm text-muted-foreground">Draft</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary.pending}
            </div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {summary.approved}
            </div>
            <div className="text-sm text-muted-foreground">Approved</div>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No expenses yet. Log your first expense to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense: Expense) => (
                  <TableRow key={expense._id}>
                    <TableCell>{formatDate(expense.date)}</TableCell>
                    <TableCell>{expense.type}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {expense.description}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(expense.amount)}
                      {expense.billable && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (billable)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[expense.status]} variant="secondary">
                        {expense.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {expense.status === 'Draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSubmitExpense(expense._id)}
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Submit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Log Expense</DialogTitle>
            <DialogDescription>
              Record a project expense.
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

            {/* Expense Type */}
            <div className="space-y-2">
              <Label>Expense Type *</Label>
              <Select
                value={formType}
                onValueChange={(value) => setFormType(value as ExpenseType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g., Adobe Creative Cloud subscription"
              />
            </div>

            {/* Amount and Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($) *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    className="pl-9"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    min="0.01"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
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
                Billable to client
              </Label>
            </div>

            {/* Markup (if billable) */}
            {formBillable && (
              <div className="space-y-2">
                <Label>Markup %</Label>
                <Select
                  value={formMarkupRate}
                  onValueChange={setFormMarkupRate}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (pass-through)</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="15">15%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                  </SelectContent>
                </Select>
                {parseFloat(formAmount) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Billed amount: {formatCurrency(billedAmount * 100)}
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional details..."
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
            <Button variant="outline" onClick={() => setAddExpenseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCreateExpense(false)}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save as Draft
            </Button>
            <Button
              onClick={() => handleCreateExpense(true)}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
