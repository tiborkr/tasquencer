import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useMemo, useEffect } from 'react'
import type { Doc, Id } from '@/convex/_generated/dataModel'
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
  ClipboardCheck,
  FileText,
  UserPlus,
  Send,
  Handshake,
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
    <Card className="hover:shadow-md transition-shadow">
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

        {/* Action button based on stage */}
        {deal.stage === 'Lead' && (
          <Link to="/deals/$dealId/qualify" params={{ dealId: deal._id }}>
            <Button size="sm" className="w-full mt-2">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Qualify Lead
            </Button>
          </Link>
        )}
        {deal.stage === 'Qualified' && (
          <Link to="/deals/$dealId/estimate" params={{ dealId: deal._id }} search={{ mode: 'create' }}>
            <Button size="sm" className="w-full mt-2" variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Create Estimate
            </Button>
          </Link>
        )}
        {deal.stage === 'Proposal' && (
          <Link to="/deals/$dealId/proposal" params={{ dealId: deal._id }}>
            <Button size="sm" className="w-full mt-2" variant="outline">
              <Send className="h-4 w-4 mr-2" />
              Send Proposal
            </Button>
          </Link>
        )}
        {deal.stage === 'Negotiation' && (
          <Link to="/deals/$dealId/negotiate" params={{ dealId: deal._id }}>
            <Button size="sm" className="w-full mt-2" variant="outline">
              <Handshake className="h-4 w-4 mr-2" />
              Get Signature
            </Button>
          </Link>
        )}
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

  // Get current user to determine organization
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)
  const organizationId = currentUser?.organizationId

  // Query deals
  const myDeals = useQuery(api.workflows.dealToDelivery.api.getMyDeals)

  // Query companies and users for the organization
  const companies = useQuery(
    api.workflows.dealToDelivery.api.getCompanies,
    organizationId ? { organizationId } : 'skip'
  )
  const users = useQuery(
    api.workflows.dealToDelivery.api.getUsers,
    organizationId ? { organizationId } : 'skip'
  )

  // New Deal form state
  const [formCompanyId, setFormCompanyId] = useState<Id<'companies'> | ''>('')
  const [formContactId, setFormContactId] = useState<Id<'contacts'> | ''>('')
  const [formName, setFormName] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formOwnerId, setFormOwnerId] = useState<Id<'users'> | ''>('')
  const [formNotes, setFormNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Query contacts based on selected company
  const contacts = useQuery(
    api.workflows.dealToDelivery.api.getContacts,
    formCompanyId ? { companyId: formCompanyId } : 'skip'
  )

  // Create deal mutation (uses workflow-first pattern from api/deals.ts)
  const createDealMutation = useMutation(api.workflows.dealToDelivery.api.deals.createDeal)
  const createCompanyMutation = useMutation(api.workflows.dealToDelivery.api.createCompany)
  const createContactMutation = useMutation(api.workflows.dealToDelivery.api.createContact)

  // Nested dialogs state
  const [newCompanyDialogOpen, setNewCompanyDialogOpen] = useState(false)
  const [newContactDialogOpen, setNewContactDialogOpen] = useState(false)

  // New Company form state
  const [companyFormName, setCompanyFormName] = useState('')
  const [companyFormStreet, setCompanyFormStreet] = useState('')
  const [companyFormCity, setCompanyFormCity] = useState('')
  const [companyFormState, setCompanyFormState] = useState('')
  const [companyFormPostalCode, setCompanyFormPostalCode] = useState('')
  const [companyFormCountry, setCompanyFormCountry] = useState('USA')
  const [companyFormError, setCompanyFormError] = useState<string | null>(null)
  const [isCreatingCompany, setIsCreatingCompany] = useState(false)

  // New Contact form state
  const [contactFormName, setContactFormName] = useState('')
  const [contactFormEmail, setContactFormEmail] = useState('')
  const [contactFormPhone, setContactFormPhone] = useState('')
  const [contactFormError, setContactFormError] = useState<string | null>(null)
  const [isCreatingContact, setIsCreatingContact] = useState(false)

  // Reset contact when company changes
  useEffect(() => {
    setFormContactId('')
  }, [formCompanyId])

  // Set default owner to current user when dialog opens
  useEffect(() => {
    if (newDealDialogOpen && currentUser && !formOwnerId) {
      setFormOwnerId(currentUser._id)
    }
  }, [newDealDialogOpen, currentUser, formOwnerId])

  // Reset form when dialog closes
  const resetForm = () => {
    setFormCompanyId('')
    setFormContactId('')
    setFormName('')
    setFormValue('')
    setFormOwnerId('')
    setFormNotes('')
    setFormError(null)
  }

  // Reset company form
  const resetCompanyForm = () => {
    setCompanyFormName('')
    setCompanyFormStreet('')
    setCompanyFormCity('')
    setCompanyFormState('')
    setCompanyFormPostalCode('')
    setCompanyFormCountry('USA')
    setCompanyFormError(null)
  }

  // Reset contact form
  const resetContactForm = () => {
    setContactFormName('')
    setContactFormEmail('')
    setContactFormPhone('')
    setContactFormError(null)
  }

  // Handler for creating a new company
  const handleCreateCompany = async () => {
    if (!organizationId) {
      setCompanyFormError('No organization found')
      return
    }
    if (!companyFormName || !companyFormStreet || !companyFormCity || !companyFormState || !companyFormPostalCode) {
      setCompanyFormError('Please fill in all required fields')
      return
    }

    setIsCreatingCompany(true)
    setCompanyFormError(null)

    try {
      const newCompanyId = await createCompanyMutation({
        organizationId,
        name: companyFormName,
        billingAddress: {
          street: companyFormStreet,
          city: companyFormCity,
          state: companyFormState,
          postalCode: companyFormPostalCode,
          country: companyFormCountry,
        },
        paymentTerms: 30,
      })

      // Auto-select the new company
      setFormCompanyId(newCompanyId)
      setNewCompanyDialogOpen(false)
      resetCompanyForm()
    } catch (error) {
      console.error('Failed to create company:', error)
      setCompanyFormError(error instanceof Error ? error.message : 'Failed to create company')
    } finally {
      setIsCreatingCompany(false)
    }
  }

  // Handler for creating a new contact
  const handleCreateContact = async () => {
    if (!organizationId || !formCompanyId) {
      setContactFormError('Please select a company first')
      return
    }
    if (!contactFormName || !contactFormEmail || !contactFormPhone) {
      setContactFormError('Please fill in all required fields')
      return
    }

    setIsCreatingContact(true)
    setContactFormError(null)

    try {
      const newContactId = await createContactMutation({
        organizationId,
        companyId: formCompanyId,
        name: contactFormName,
        email: contactFormEmail,
        phone: contactFormPhone,
        isPrimary: true,
      })

      // Auto-select the new contact
      setFormContactId(newContactId)
      setNewContactDialogOpen(false)
      resetContactForm()
    } catch (error) {
      console.error('Failed to create contact:', error)
      setContactFormError(error instanceof Error ? error.message : 'Failed to create contact')
    } finally {
      setIsCreatingContact(false)
    }
  }

  const handleDialogChange = (open: boolean) => {
    setNewDealDialogOpen(open)
    if (!open) {
      resetForm()
    }
  }

  // Handler for creating a new deal
  const handleCreateDeal = async () => {
    if (!organizationId) {
      setFormError('No organization found')
      return
    }
    if (!formCompanyId || !formContactId || !formName || !formValue || !formOwnerId) {
      setFormError('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)
    setFormError(null)

    try {
      // Value is in dollars, convert to cents
      const valueInCents = Math.round(parseFloat(formValue) * 100)

      await createDealMutation({
        organizationId,
        companyId: formCompanyId,
        contactId: formContactId,
        name: formName,
        value: valueInCents,
        ownerId: formOwnerId,
      })

      setNewDealDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('Failed to create deal:', error)
      setFormError(error instanceof Error ? error.message : 'Failed to create deal')
    } finally {
      setIsSubmitting(false)
    }
  }

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

    // Filter by owner
    if (ownerFilter === 'me' && currentUser) {
      filtered = filtered.filter((deal) => deal.ownerId === currentUser._id)
    }

    // Filter active deals only (not Won or Lost)
    filtered = filtered.filter((deal) =>
      ['Lead', 'Qualified', 'Proposal', 'Negotiation'].includes(deal.stage ?? '')
    )

    return filtered
  }, [myDeals, searchQuery, ownerFilter, currentUser])

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

  if (myDeals === undefined || currentUser === undefined) {
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
              companies={companies ?? []}
              users={users ?? []}
            />
          ))}
        </div>
      )}

      {/* New Deal Dialog */}
      <Dialog open={newDealDialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Enter the deal details to add it to your pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Deal Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Deal Name *</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Website Redesign Project"
              />
            </div>

            {/* Company Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Company *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewCompanyDialogOpen(true)}
                  className="h-6 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Company
                </Button>
              </div>
              <Select
                value={formCompanyId}
                onValueChange={(value) => setFormCompanyId(value as Id<'companies'>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company) => (
                    <SelectItem key={company._id} value={company._id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companies?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No companies found. Click "+ New Company" to create one.
                </p>
              )}
            </div>

            {/* Contact Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Contact *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewContactDialogOpen(true)}
                  disabled={!formCompanyId}
                  className="h-6 text-xs"
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  New Contact
                </Button>
              </div>
              <Select
                value={formContactId}
                onValueChange={(value) => setFormContactId(value as Id<'contacts'>)}
                disabled={!formCompanyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formCompanyId ? "Select contact..." : "Select company first"} />
                </SelectTrigger>
                <SelectContent>
                  {contacts?.map((contact) => (
                    <SelectItem key={contact._id} value={contact._id}>
                      {contact.name} ({contact.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formCompanyId && contacts?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No contacts for this company. Click "+ New Contact" to create one.
                </p>
              )}
            </div>

            {/* Deal Value */}
            <div className="space-y-2">
              <Label htmlFor="value">Deal Value ($) *</Label>
              <Input
                id="value"
                type="number"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="50000"
                min="0"
                step="0.01"
              />
            </div>

            {/* Owner Selection */}
            <div className="space-y-2">
              <Label>Deal Owner *</Label>
              <Select
                value={formOwnerId}
                onValueChange={(value) => setFormOwnerId(value as Id<'users'>)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select owner..." />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name} {user._id === currentUser?._id ? '(me)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
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

            {/* Error message */}
            {formError && (
              <div className="text-sm text-destructive">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!formName || !formValue || !formCompanyId || !formContactId || !formOwnerId || isSubmitting}
              onClick={handleCreateDeal}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Company Dialog */}
      <Dialog open={newCompanyDialogOpen} onOpenChange={(open) => {
        setNewCompanyDialogOpen(open)
        if (!open) resetCompanyForm()
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
            <DialogDescription>
              Create a new company to associate with this deal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={companyFormName}
                onChange={(e) => setCompanyFormName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Street Address *</Label>
              <Input
                id="street"
                value={companyFormStreet}
                onChange={(e) => setCompanyFormStreet(e.target.value)}
                placeholder="123 Main St"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={companyFormCity}
                  onChange={(e) => setCompanyFormCity(e.target.value)}
                  placeholder="San Francisco"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={companyFormState}
                  onChange={(e) => setCompanyFormState(e.target.value)}
                  placeholder="CA"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">Postal Code *</Label>
                <Input
                  id="postalCode"
                  value={companyFormPostalCode}
                  onChange={(e) => setCompanyFormPostalCode(e.target.value)}
                  placeholder="94105"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={companyFormCountry}
                  onChange={(e) => setCompanyFormCountry(e.target.value)}
                  placeholder="USA"
                />
              </div>
            </div>

            {companyFormError && (
              <div className="text-sm text-destructive">
                {companyFormError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCompanyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCompany}
              disabled={!companyFormName || !companyFormStreet || !companyFormCity || !companyFormState || !companyFormPostalCode || isCreatingCompany}
            >
              {isCreatingCompany && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Contact Dialog */}
      <Dialog open={newContactDialogOpen} onOpenChange={(open) => {
        setNewContactDialogOpen(open)
        if (!open) resetContactForm()
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>New Contact</DialogTitle>
            <DialogDescription>
              Create a new contact for {companies?.find(c => c._id === formCompanyId)?.name ?? 'this company'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name *</Label>
              <Input
                id="contactName"
                value={contactFormName}
                onChange={(e) => setContactFormName(e.target.value)}
                placeholder="John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Email *</Label>
              <Input
                id="contactEmail"
                type="email"
                value={contactFormEmail}
                onChange={(e) => setContactFormEmail(e.target.value)}
                placeholder="john@acme.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactPhone">Phone *</Label>
              <Input
                id="contactPhone"
                type="tel"
                value={contactFormPhone}
                onChange={(e) => setContactFormPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            {contactFormError && (
              <div className="text-sm text-destructive">
                {contactFormError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewContactDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateContact}
              disabled={!contactFormName || !contactFormEmail || !contactFormPhone || isCreatingContact}
            >
              {isCreatingContact && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
