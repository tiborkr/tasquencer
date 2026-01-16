import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState } from 'react'
import type { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import { Loader2, AlertTriangle, ArrowLeft, Plus, Trash2, DollarSign, Clock } from 'lucide-react'

export const Route = createFileRoute('/_app/deals/$dealId/estimate')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Create Estimate',
  }),
})

interface ServiceLine {
  id: string
  name: string
  rate: string
  hours: string
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function RouteComponent() {
  const navigate = useNavigate()
  const { dealId } = Route.useParams()

  // Query deal details
  const deal = useQuery(api.workflows.dealToDelivery.api.getDealById, {
    dealId: dealId as Id<'deals'>
  })

  // Service lines state
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([
    { id: generateId(), name: '', rate: '', hours: '' }
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mutation
  const createEstimateMutation = useMutation(api.workflows.dealToDelivery.api.createEstimate)

  // Add new service line
  const addServiceLine = () => {
    setServiceLines([...serviceLines, { id: generateId(), name: '', rate: '', hours: '' }])
  }

  // Remove service line
  const removeServiceLine = (id: string) => {
    if (serviceLines.length === 1) return
    setServiceLines(serviceLines.filter(line => line.id !== id))
  }

  // Update service line
  const updateServiceLine = (id: string, field: keyof ServiceLine, value: string) => {
    setServiceLines(serviceLines.map(line =>
      line.id === id ? { ...line, [field]: value } : line
    ))
  }

  // Calculate line total
  const calculateLineTotal = (rate: string, hours: string): number => {
    const rateNum = parseFloat(rate) || 0
    const hoursNum = parseFloat(hours) || 0
    return rateNum * hoursNum
  }

  // Calculate grand total
  const grandTotal = serviceLines.reduce(
    (sum, line) => sum + calculateLineTotal(line.rate, line.hours),
    0
  )

  // Validate form
  const isValid = serviceLines.every(
    line => line.name.trim() && parseFloat(line.rate) > 0 && parseFloat(line.hours) > 0
  )

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Please fill in all service line details with valid values')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Convert rates from dollars to cents for storage
      // User enters $200/hr, we store 20000 cents/hr
      const services = serviceLines.map(line => ({
        name: line.name.trim(),
        rate: Math.round(parseFloat(line.rate) * 100), // Convert dollars to cents
        hours: parseFloat(line.hours),
      }))

      await createEstimateMutation({
        dealId: dealId as Id<'deals'>,
        services,
      })

      // Navigate back to deals pipeline on success
      navigate({ to: '/deals' })
    } catch (err) {
      console.error('Failed to create estimate:', err)
      setError(err instanceof Error ? err.message : 'Failed to create estimate')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (deal === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="max-w-3xl mx-auto animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (deal === null) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="max-w-3xl mx-auto">
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

  // Check if deal is in a stage that allows estimates
  if (!['Qualified', 'Proposal', 'Negotiation'].includes(deal.stage)) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="max-w-3xl mx-auto">
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium">Cannot create estimate</p>
            <p className="text-muted-foreground mt-2">
              This deal is in the "{deal.stage}" stage. Estimates can only be created for qualified deals.
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
      <div className="max-w-3xl mx-auto space-y-6">
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
            <CardTitle>Create Estimate: {deal.name}</CardTitle>
            <CardDescription>
              Company: {deal.companyName} • Stage: {deal.stage}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Service Lines */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Service Lines</CardTitle>
                <CardDescription>
                  Add the services to include in this estimate
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={addServiceLine}>
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Service line headers */}
            <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground px-1">
              <div className="col-span-5">Service Name</div>
              <div className="col-span-2">Rate ($/hr)</div>
              <div className="col-span-2">Hours</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            {/* Service lines */}
            {serviceLines.map((line) => (
              <div key={line.id} className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-5">
                  <Label htmlFor={`name-${line.id}`} className="sr-only">
                    Service Name
                  </Label>
                  <Input
                    id={`name-${line.id}`}
                    placeholder="e.g., Development"
                    value={line.name}
                    onChange={(e) => updateServiceLine(line.id, 'name', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor={`rate-${line.id}`} className="sr-only">
                    Rate
                  </Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={`rate-${line.id}`}
                      type="number"
                      placeholder="150"
                      className="pl-9"
                      value={line.rate}
                      onChange={(e) => updateServiceLine(line.id, 'rate', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <Label htmlFor={`hours-${line.id}`} className="sr-only">
                    Hours
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={`hours-${line.id}`}
                      type="number"
                      placeholder="40"
                      className="pl-9"
                      value={line.hours}
                      onChange={(e) => updateServiceLine(line.id, 'hours', e.target.value)}
                      min="0"
                      step="0.5"
                    />
                  </div>
                </div>
                <div className="col-span-2 text-right font-medium">
                  ${calculateLineTotal(line.rate, line.hours).toLocaleString()}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeServiceLine(line.id)}
                    disabled={serviceLines.length === 1}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="border-t pt-4 mt-4">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-9 text-right font-semibold text-lg">
                  Estimate Total:
                </div>
                <div className="col-span-2 text-right font-bold text-xl text-primary">
                  ${grandTotal.toLocaleString()}
                </div>
                <div className="col-span-1"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary comparison */}
        {deal.value > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Deal Value:</span>
                <span className="font-medium">${(deal.value / 100).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">Estimate Total:</span>
                <span className="font-medium">${grandTotal.toLocaleString()}</span>
              </div>
              {grandTotal > 0 && deal.value > 0 && (
                <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t">
                  <span className="text-muted-foreground">Difference:</span>
                  <span className={`font-medium ${grandTotal > deal.value / 100 ? 'text-amber-600' : 'text-green-600'}`}>
                    {grandTotal > deal.value / 100 ? '+' : ''}
                    ${(grandTotal - deal.value / 100).toLocaleString()}
                    {' '}
                    ({((grandTotal / (deal.value / 100)) * 100 - 100).toFixed(1)}%)
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Estimate
          </Button>
        </div>
      </div>
    </div>
  )
}
