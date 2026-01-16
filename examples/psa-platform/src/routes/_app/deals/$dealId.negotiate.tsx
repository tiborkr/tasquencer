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
  Handshake,
  FileText,
  DollarSign,
  Building2,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'

export const Route = createFileRoute('/_app/deals/$dealId/negotiate')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Get Signature',
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
  const [outcome, setOutcome] = useState<'won' | 'lost' | 'revise' | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [revisionNotes, setRevisionNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Query deal details
  const deal = useQuery(api.workflows.dealToDelivery.api.getDealById, {
    dealId: dealId as Id<'deals'>,
  })

  // Mutations
  const updateDealStage = useMutation(api.workflows.dealToDelivery.api.updateDealStage)

  const handleWon = async () => {
    setIsSubmitting(true)
    try {
      await updateDealStage({
        dealId: dealId as Id<'deals'>,
        stage: 'Won',
      })
      setOutcome('won')
      setCompleted(true)
    } catch (error) {
      console.error('Failed to mark deal as won:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLost = async () => {
    if (!lostReason) return

    setIsSubmitting(true)
    try {
      await updateDealStage({
        dealId: dealId as Id<'deals'>,
        stage: 'Lost',
        reason: lostReason,
      })
      setOutcome('lost')
      setCompleted(true)
    } catch (error) {
      console.error('Failed to mark deal as lost:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRevise = async () => {
    setIsSubmitting(true)
    try {
      // Move back to Proposal stage for revision
      await updateDealStage({
        dealId: dealId as Id<'deals'>,
        stage: 'Proposal',
      })
      setOutcome('revise')
      setCompleted(true)
    } catch (error) {
      console.error('Failed to request revision:', error)
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

  if (completed) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            {outcome === 'won' && (
              <>
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h2 className="text-2xl font-bold">Deal Won!</h2>
                <p className="text-muted-foreground">
                  Congratulations! The deal has been marked as won. You can now create a project.
                </p>
              </>
            )}
            {outcome === 'lost' && (
              <>
                <XCircle className="h-16 w-16 text-red-500 mx-auto" />
                <h2 className="text-2xl font-bold">Deal Lost</h2>
                <p className="text-muted-foreground">
                  The deal has been marked as lost. Reason: {lostReason}
                </p>
              </>
            )}
            {outcome === 'revise' && (
              <>
                <RefreshCw className="h-16 w-16 text-yellow-500 mx-auto" />
                <h2 className="text-2xl font-bold">Revision Requested</h2>
                <p className="text-muted-foreground">
                  The deal has been moved back to Proposal stage for revision.
                </p>
              </>
            )}
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
          <h1 className="text-2xl font-bold">Get Signature</h1>
          <p className="text-muted-foreground">
            Record the outcome of the negotiation
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

      {/* Negotiation Outcome */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" />
            Negotiation Outcome
          </CardTitle>
          <CardDescription>
            Select the outcome of the negotiation with the client
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Won Option */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-green-600 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Deal Won
                </h3>
                <p className="text-sm text-muted-foreground">
                  The client has signed the proposal and agreed to proceed
                </p>
              </div>
              <Button
                onClick={handleWon}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Mark as Won
              </Button>
            </div>
          </div>

          {/* Lost Option */}
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-red-600 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Deal Lost
              </h3>
              <p className="text-sm text-muted-foreground">
                The client has declined the proposal
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lostReason">Reason for loss *</Label>
              <Input
                id="lostReason"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="e.g., Budget constraints, Chose competitor, Timeline doesn't match"
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleLost}
                disabled={!lostReason || isSubmitting}
                variant="destructive"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Mark as Lost
              </Button>
            </div>
          </div>

          {/* Revision Option */}
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="font-semibold text-yellow-600 flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Request Revision
              </h3>
              <p className="text-sm text-muted-foreground">
                The client has requested changes to the proposal
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="revisionNotes">Revision notes (optional)</Label>
              <Textarea
                id="revisionNotes"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="What changes did the client request?"
                rows={2}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleRevise}
                disabled={isSubmitting}
                variant="outline"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Request Revision
              </Button>
            </div>
          </div>

          {/* Cancel */}
          <div className="flex justify-start pt-4">
            <Link to="/deals">
              <Button variant="ghost">Cancel</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
