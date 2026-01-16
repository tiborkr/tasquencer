import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import { Badge } from '@repo/ui/components/badge'
import {
  ArrowLeft,
  Send,
  FileText,
  DollarSign,
  Building2,
  CheckCircle,
  Loader2,
} from 'lucide-react'

export const Route = createFileRoute('/_app/deals/$dealId/proposal')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Send Proposal',
  }),
})

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function RouteComponent() {
  const { dealId } = Route.useParams()
  const [documentUrl, setDocumentUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [proposalCreated, setProposalCreated] = useState(false)

  // Query deal details
  const deal = useQuery(api.workflows.dealToDelivery.api.getDealById, {
    dealId: dealId as Id<'deals'>,
  })

  // Mutations
  const createProposal = useMutation(api.workflows.dealToDelivery.api.createProposal)
  const updateProposalStatus = useMutation(api.workflows.dealToDelivery.api.updateProposalStatus)
  const updateDealStage = useMutation(api.workflows.dealToDelivery.api.updateDealStage)

  const handleCreateAndSendProposal = async () => {
    if (!documentUrl) return

    setIsSubmitting(true)
    try {
      // Create the proposal
      const { proposalId } = await createProposal({
        dealId: dealId as Id<'deals'>,
        documentUrl,
      })

      // Send the proposal (update status to Sent)
      await updateProposalStatus({
        proposalId,
        status: 'Sent',
      })

      // Advance deal stage to Negotiation
      await updateDealStage({
        dealId: dealId as Id<'deals'>,
        stage: 'Negotiation',
      })

      setProposalCreated(true)
    } catch (error) {
      console.error('Failed to send proposal:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (deal === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-[300px] bg-muted rounded-lg" />
        </div>
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="p-6 lg:p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-muted-foreground">Deal not found</div>
            <Link to="/deals">
              <Button variant="link">Back to Pipeline</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (proposalCreated) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">Proposal Sent!</h2>
            <p className="text-muted-foreground">
              Your proposal has been sent. The deal has been moved to the Negotiation stage.
            </p>
            <div className="pt-4">
              <Link to="/deals">
                <Button>Back to Pipeline</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/deals">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Send Proposal</h1>
          <p className="text-muted-foreground">
            Create and send a proposal for this deal
          </p>
        </div>
      </div>

      {/* Deal Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Deal Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Deal Name</div>
              <div className="font-medium">{deal.name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Company</div>
              <div className="font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {deal.companyName}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Value</div>
              <div className="font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                {formatCurrency(deal.value ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Stage</div>
              <Badge variant="secondary">{deal.stage}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Proposal Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Proposal Details
          </CardTitle>
          <CardDescription>
            Enter the proposal document URL and send it to the client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="documentUrl">Proposal Document URL *</Label>
            <Input
              id="documentUrl"
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              placeholder="https://docs.google.com/document/d/..."
              type="url"
            />
            <p className="text-sm text-muted-foreground">
              Enter the URL of your proposal document (Google Docs, PDF, etc.)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this proposal..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Link to="/deals">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button
              onClick={handleCreateAndSendProposal}
              disabled={!documentUrl || isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send Proposal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
