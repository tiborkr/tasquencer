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
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import {
  MessageSquare,
  Plus,
  ListTodo,
  Hash,
  CheckCircle2,
  Clock,
  ChevronRight,
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

export const Route = createFileRoute('/_app/campaigns/')({
  component: CampaignsIndex,
})

function CampaignsIndex() {
  return (
    <Suspense fallback={<CampaignsPageSkeleton />}>
      <CampaignsPageInner />
    </Suspense>
  )
}

type CampaignStatus =
  | 'draft'
  | 'intake_review'
  | 'strategy'
  | 'budget_approval'
  | 'creative_development'
  | 'technical_setup'
  | 'pre_launch'
  | 'active'
  | 'completed'
  | 'cancelled'

type SortField = 'name' | 'budget' | 'created' | 'status'
type SortDirection = 'asc' | 'desc'

const STATUS_OPTIONS: { value: CampaignStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'intake_review', label: 'Intake Review' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'budget_approval', label: 'Budget Approval' },
  { value: 'creative_development', label: 'Creative Development' },
  { value: 'technical_setup', label: 'Technical Setup' },
  { value: 'pre_launch', label: 'Pre-Launch' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function CampaignsPageInner() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('created')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Fetch with API filter when status is selected
  const q = convexQuery(api.workflows.campaign_approval.api.getCampaigns, {
    ...(statusFilter !== 'all' && { status: statusFilter }),
  })
  const { data: campaignsResult } = useSuspenseQuery(q)
  const campaigns = campaignsResult.campaigns

  // Client-side filtering by name search
  const filteredCampaigns = useMemo(() => {
    let result = campaigns

    // Filter by search query (client-side)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.objective.toLowerCase().includes(query),
      )
    }

    // Sort campaigns
    result = [...result].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'budget':
          comparison = a.estimatedBudget - b.estimatedBudget
          break
        case 'created':
          comparison = a.createdAt - b.createdAt
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [campaigns, searchQuery, sortField, sortDirection])

  // Calculate stats (from unfiltered data for consistency)
  const stats = useMemo(() => {
    const completed = campaigns.filter((c) => c.status === 'completed').length
    const pending = campaigns.filter((c) => c.status === 'draft').length
    const active = campaigns.filter(
      (c) => c.status !== 'completed' && c.status !== 'draft' && c.status !== 'cancelled',
    ).length
    return { total: campaigns.length, completed, pending, active }
  }, [campaigns])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Campaigns</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple/queue">
              <ListTodo className="mr-2 h-4 w-4" />
              Work Queue
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/campaigns/new">
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
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
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
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

      {/* Filters Row */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as CampaignStatus | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(searchQuery || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('')
              setStatusFilter('all')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Campaigns Table */}
      {filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
          {campaigns.length === 0 ? (
            <>
              <p className="text-sm font-medium">No campaigns yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first campaign to get started
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/campaigns/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Campaign
                </Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No matching campaigns</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filter criteria
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('')
                  setStatusFilter('all')
                }}
              >
                Clear filters
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">#</TableHead>
                <TableHead>
                  <button
                    className="flex items-center hover:text-foreground transition-colors"
                    onClick={() => toggleSort('name')}
                  >
                    Name
                    <SortIcon field="name" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    className="flex items-center hover:text-foreground transition-colors"
                    onClick={() => toggleSort('budget')}
                  >
                    Budget
                    <SortIcon field="budget" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    className="flex items-center hover:text-foreground transition-colors"
                    onClick={() => toggleSort('created')}
                  >
                    Created
                    <SortIcon field="created" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="flex items-center hover:text-foreground transition-colors"
                    onClick={() => toggleSort('status')}
                  >
                    Status
                    <SortIcon field="status" />
                  </button>
                </TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((campaign, index) => (
                <TableRow key={campaign._id}>
                  <TableCell className="text-muted-foreground font-mono">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{campaign.name}</span>
                    <p className="text-xs text-muted-foreground truncate max-w-xs">
                      {campaign.objective}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    ${campaign.estimatedBudget.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        campaign.status === 'completed'
                          ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                          : campaign.status === 'active'
                            ? 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5'
                            : campaign.status === 'cancelled'
                              ? 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5'
                              : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                      }
                    >
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to="/campaigns/$campaignId"
                        params={{ campaignId: campaign._id }}
                      >
                        <ChevronRight className="h-4 w-4" />
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

function CampaignsPageSkeleton() {
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
        <div className="grid grid-cols-4 gap-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-20 bg-muted rounded-lg" />
        </div>
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    </div>
  )
}
