import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useMemo } from 'react'
import type { Doc } from '@/convex/_generated/dataModel'
import { Card, CardContent } from '@repo/ui/components/card'
import { Badge } from '@repo/ui/components/badge'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog'
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import {
  Plus,
  Search,
  GripVertical,
  DollarSign,
  Building2,
  User,
  Loader2,
} from 'lucide-react'

export const Route = createFileRoute('/_app/deals/')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Pipeline',
  }),
})

// Deal stages in order
const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation'] as const
type Stage = (typeof STAGES)[number]

// Stage colors
const STAGE_COLORS: Record<Stage, string> = {
  Lead: 'bg-slate-100 border-slate-200',
  Qualified: 'bg-blue-50 border-blue-200',
  Proposal: 'bg-yellow-50 border-yellow-200',
  Negotiation: 'bg-green-50 border-green-200',
}

// Probability badges
const PROBABILITY_COLORS: Record<number, string> = {
  10: 'bg-slate-100 text-slate-700',
  25: 'bg-blue-100 text-blue-700',
  50: 'bg-yellow-100 text-yellow-700',
  75: 'bg-green-100 text-green-700',
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

type Deal = Doc<'deals'>

interface DealCardProps {
  deal: Deal
  companies: Doc<'companies'>[]
  users: Doc<'users'>[]
}

function DealCard({ deal, companies, users }: DealCardProps) {
  const company = companies.find((c) => c._id === deal.companyId)
  const owner = users.find((u) => u._id === deal.ownerId)
  const probabilityColor = PROBABILITY_COLORS[deal.probability ?? 10] ?? PROBABILITY_COLORS[10]

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GripVertical className="h-4 w-4" />
            <span className="font-semibold text-foreground truncate">
              {deal.name}
            </span>
          </div>
          <Badge className={probabilityColor} variant="secondary">
            {deal.probability ?? 10}%
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <DollarSign className="h-4 w-4" />
          {formatCurrency(deal.value ?? 0)}
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="truncate">{company?.name ?? 'Unknown Company'}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="truncate">{owner?.name ?? 'Unassigned'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface PipelineColumnProps {
  stage: Stage
  deals: Deal[]
  companies: Doc<'companies'>[]
  users: Doc<'users'>[]
}

function PipelineColumn({ stage, deals, companies, users }: PipelineColumnProps) {
  const stageDeals = deals.filter((d) => d.stage === stage)
  const totalValue = stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return (
    <div className={`flex flex-col rounded-lg border-2 ${STAGE_COLORS[stage]} min-h-[500px]`}>
      <div className="p-4 border-b bg-background/50">
        <h3 className="font-semibold text-lg">{stage}</h3>
        <div className="flex items-center justify-between text-sm text-muted-foreground mt-1">
          <span>{formatCurrency(totalValue)}</span>
          <span>{stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {stageDeals.map((deal) => (
          <DealCard
            key={deal._id}
            deal={deal}
            companies={companies}
            users={users}
          />
        ))}
      </div>
    </div>
  )
}

function RouteComponent() {
  const [searchQuery, setSearchQuery] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [newDealDialogOpen, setNewDealDialogOpen] = useState(false)

  // Queries - for now we use getMyDeals which doesn't need organizationId
  const myDeals = useQuery(api.workflows.dealToDelivery.api.getMyDeals)

  // For a full implementation, we'd need to query companies and users
  // For now, we'll use empty arrays and show basic deal info
  const companies: Doc<'companies'>[] = []
  const users: Doc<'users'>[] = []

  // New Deal form state
  const [formName, setFormName] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Handler for creating a new deal - placeholder until full implementation
  const handleCreateDeal = async () => {
    if (!formName || !formValue) return
    setIsSubmitting(true)
    try {
      // TODO: Call createDeal mutation once company/contact management is in place
      console.log('Creating deal:', { name: formName, value: formValue, notes: formNotes })
      // Simulated delay
      await new Promise(resolve => setTimeout(resolve, 500))
      setNewDealDialogOpen(false)
      setFormName('')
      setFormValue('')
      setFormNotes('')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Note: ownerFilter will be used in full implementation with users query
  void ownerFilter

  // Filter deals based on search query and owner
  const filteredDeals = useMemo(() => {
    if (!myDeals) return []

    let filtered = [...myDeals]

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((deal) =>
        deal.name?.toLowerCase().includes(query)
      )
    }

    // Filter active deals only (not Won or Lost)
    filtered = filtered.filter((deal) =>
      ['Lead', 'Qualified', 'Proposal', 'Negotiation'].includes(deal.stage ?? '')
    )

    return filtered
  }, [myDeals, searchQuery, ownerFilter])

  // Stage summaries
  const stageSummaries = useMemo(() => {
    return STAGES.map((stage) => {
      const stageDeals = filteredDeals.filter((d) => d.stage === stage)
      return {
        stage,
        totalValue: stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
        dealCount: stageDeals.length,
      }
    })
  }, [filteredDeals])

  if (myDeals === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-8">
          <div className="flex justify-between items-center">
            <div className="h-8 w-32 bg-muted rounded" />
            <div className="h-10 w-32 bg-muted rounded" />
          </div>
          <div className="h-12 bg-muted rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[500px] bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Deals Pipeline</h1>
          <p className="text-muted-foreground">
            Track your deals through the sales process
          </p>
        </div>
        <Button onClick={() => setNewDealDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Deal
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                <SelectItem value="me">My Deals</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Summary */}
      <div className="grid grid-cols-4 gap-4">
        {stageSummaries.map((summary) => (
          <Card key={summary.stage}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">
                {formatCurrency(summary.totalValue)}
              </div>
              <div className="text-sm text-muted-foreground">
                {summary.stage} ({summary.dealCount})
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline Columns */}
      {filteredDeals.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-muted-foreground mb-4">
              {searchQuery
                ? 'No deals match your filters.'
                : 'No deals yet. Create your first deal to get started.'}
            </div>
            {searchQuery ? (
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear Filters
              </Button>
            ) : (
              <Button onClick={() => setNewDealDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Deal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              deals={filteredDeals}
              companies={companies}
              users={users}
            />
          ))}
        </div>
      )}

      {/* New Deal Dialog - Placeholder for now */}
      <Dialog open={newDealDialogOpen} onOpenChange={setNewDealDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Enter the deal details to add it to your pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Deal Name *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Website Redesign Project"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">Deal Value ($) *</Label>
              <Input
                id="value"
                type="number"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="50000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional details about the deal..."
                rows={3}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              Note: Full deal creation requires company and contact selection.
              This feature will be enhanced with company/contact management.
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewDealDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!formName || !formValue || isSubmitting}
              onClick={handleCreateDeal}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
