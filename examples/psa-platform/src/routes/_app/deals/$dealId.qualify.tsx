import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState } from 'react'
import type { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import { Checkbox } from '@repo/ui/components/checkbox'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'

export const Route = createFileRoute('/_app/deals/$dealId/qualify')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Qualify Lead',
  }),
})

function RouteComponent() {
  const navigate = useNavigate()
  const { dealId } = Route.useParams()

  // Query deal details
  const deal = useQuery(api.workflows.dealToDelivery.api.getDealById, {
    dealId: dealId as Id<'deals'>
  })

  // Form state
  const [budgetConfirmed, setBudgetConfirmed] = useState(false)
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false)
  const [needConfirmed, setNeedConfirmed] = useState(false)
  const [timelineConfirmed, setTimelineConfirmed] = useState(false)
  const [qualified, setQualified] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mutation
  const qualifyDealMutation = useMutation(api.workflows.dealToDelivery.api.qualifyDeal)

  // Calculate BANT score
  const bantScore = [budgetConfirmed, authorityConfirmed, needConfirmed, timelineConfirmed]
    .filter(Boolean).length

  // Warning conditions
  const showLowBantWarning = bantScore < 2 && qualified === true
  const showHighBantWarning = bantScore === 4 && qualified === false

  const handleSubmit = async () => {
    if (qualified === null) {
      setError('Please select a qualification decision')
      return
    }
    if (notes.length < 10) {
      setError('Qualification notes must be at least 10 characters')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await qualifyDealMutation({
        dealId: dealId as Id<'deals'>,
        qualified,
        qualificationNotes: notes,
        budgetConfirmed: budgetConfirmed || undefined,
        authorityConfirmed: authorityConfirmed || undefined,
        needConfirmed: needConfirmed || undefined,
        timelineConfirmed: timelineConfirmed || undefined,
      })

      // Navigate back to deals pipeline on success
      navigate({ to: '/deals' })
    } catch (err) {
      console.error('Failed to qualify deal:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit qualification')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (deal === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="max-w-2xl mx-auto animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (deal === null) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Deal not found</p>
            <p className="text-muted-foreground mt-2">
              The deal you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button className="mt-6" onClick={() => navigate({ to: '/deals' })}>
              Back to Deals
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if deal is already qualified or disqualified
  if (deal.stage !== 'Lead') {
    return (
      <div className="p-6 lg:p-8">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Deal already processed</p>
            <p className="text-muted-foreground mt-2">
              This deal is in the "{deal.stage}" stage and cannot be qualified again.
            </p>
            <Button className="mt-6" onClick={() => navigate({ to: '/deals' })}>
              Back to Deals
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Back button */}
        <Button
          variant="ghost"
          className="mb-2"
          onClick={() => navigate({ to: '/deals' })}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pipeline
        </Button>

        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle>Qualify Lead: {deal.name}</CardTitle>
            <CardDescription>
              Company: {deal.companyName} • Value: ${(deal.value / 100).toLocaleString()}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* BANT Assessment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">BANT Assessment</CardTitle>
            <CardDescription>
              Evaluate the lead using BANT criteria ({bantScore}/4 confirmed)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="budget"
                checked={budgetConfirmed}
                onCheckedChange={(checked) => setBudgetConfirmed(!!checked)}
              />
              <div className="space-y-1">
                <Label htmlFor="budget" className="font-medium cursor-pointer">
                  Budget Confirmed
                </Label>
                <p className="text-sm text-muted-foreground">
                  Does the prospect have budget allocated for this project?
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="authority"
                checked={authorityConfirmed}
                onCheckedChange={(checked) => setAuthorityConfirmed(!!checked)}
              />
              <div className="space-y-1">
                <Label htmlFor="authority" className="font-medium cursor-pointer">
                  Authority Confirmed
                </Label>
                <p className="text-sm text-muted-foreground">
                  Are we speaking with decision makers who can approve the project?
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="need"
                checked={needConfirmed}
                onCheckedChange={(checked) => setNeedConfirmed(!!checked)}
              />
              <div className="space-y-1">
                <Label htmlFor="need" className="font-medium cursor-pointer">
                  Need Confirmed
                </Label>
                <p className="text-sm text-muted-foreground">
                  Is there a clear business need we can address?
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="timeline"
                checked={timelineConfirmed}
                onCheckedChange={(checked) => setTimelineConfirmed(!!checked)}
              />
              <div className="space-y-1">
                <Label htmlFor="timeline" className="font-medium cursor-pointer">
                  Timeline Confirmed
                </Label>
                <p className="text-sm text-muted-foreground">
                  Is there a defined timeline for the project?
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Qualification Decision */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Qualification Decision *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setQualified(true)}
                className={`flex flex-col items-center p-6 rounded-lg border-2 transition-colors ${
                  qualified === true
                    ? 'border-green-500 bg-green-50'
                    : 'border-muted hover:border-green-300 hover:bg-green-50/50'
                }`}
              >
                <CheckCircle2 className={`h-8 w-8 mb-2 ${qualified === true ? 'text-green-600' : 'text-muted-foreground'}`} />
                <span className="font-medium">Qualify Lead</span>
                <span className="text-sm text-muted-foreground text-center mt-1">
                  Move to Qualified stage
                </span>
              </button>

              <button
                type="button"
                onClick={() => setQualified(false)}
                className={`flex flex-col items-center p-6 rounded-lg border-2 transition-colors ${
                  qualified === false
                    ? 'border-red-500 bg-red-50'
                    : 'border-muted hover:border-red-300 hover:bg-red-50/50'
                }`}
              >
                <XCircle className={`h-8 w-8 mb-2 ${qualified === false ? 'text-red-600' : 'text-muted-foreground'}`} />
                <span className="font-medium">Disqualify Lead</span>
                <span className="text-sm text-muted-foreground text-center mt-1">
                  Archive this deal
                </span>
              </button>
            </div>

            {/* Warnings */}
            {showLowBantWarning && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Consider whether qualification is appropriate with limited BANT criteria met ({bantScore}/4).
                </AlertDescription>
              </Alert>
            )}

            {showHighBantWarning && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  All BANT criteria are met - are you sure this should be disqualified?
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Qualification Notes *</CardTitle>
            <CardDescription>
              Minimum 10 characters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the qualification decision rationale, key findings from discovery calls, next steps if qualified..."
              rows={5}
            />
            <p className="text-sm text-muted-foreground mt-2">
              {notes.length} characters
            </p>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => navigate({ to: '/deals' })}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={qualified === null || notes.length < 10 || isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Qualification
          </Button>
        </div>
      </div>
    </div>
  )
}
