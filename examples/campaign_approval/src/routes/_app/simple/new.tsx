import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import { PlusCircle, ArrowLeft, ListTodo, Loader2 } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/_app/simple/new')({
  component: NewCampaign,
})

function NewCampaign() {
  const navigate = useNavigate()

  // Simple form state
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [estimatedBudget, setEstimatedBudget] = useState('10000')

  const initializeMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.initializeRootWorkflow,
    ),
    onSuccess: () => {
      navigate({ to: '/simple/queue' })
    },
  })

  const handleCreate = () => {
    const now = Date.now()
    initializeMutation.mutate({
      payload: {
        name: name || 'New Campaign',
        objective: objective || 'Campaign objective',
        targetAudience: targetAudience || 'Target audience',
        keyMessages: ['Key message 1'],
        channels: ['email', 'social'] as (
          | 'email'
          | 'paid_ads'
          | 'social'
          | 'events'
          | 'content'
        )[],
        proposedStartDate: now + 7 * 24 * 60 * 60 * 1000, // 7 days from now
        proposedEndDate: now + 30 * 24 * 60 * 60 * 1000, // 30 days from now
        estimatedBudget: parseInt(estimatedBudget) || 10000,
        requesterId: 'placeholder-user-id', // Will be replaced by auth
      },
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlusCircle className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">New Campaign</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All Campaigns
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/simple/queue">
              <ListTodo className="mr-2 h-4 w-4" />
              Work Queue
            </Link>
          </Button>
        </div>
      </div>

      {/* Create Card */}
      <div className="max-w-lg mx-auto">
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-medium">Create Campaign Request</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Fill in the campaign details to start the approval workflow.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Q1 Product Launch"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="objective">Objective</Label>
              <Textarea
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="What are you trying to achieve?"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience">Target Audience</Label>
              <Input
                id="audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g., Enterprise customers in tech"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Estimated Budget ($)</Label>
              <Input
                id="budget"
                type="number"
                value={estimatedBudget}
                onChange={(e) => setEstimatedBudget(e.target.value)}
                placeholder="10000"
              />
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={initializeMutation.isPending}
            className="w-full"
            size="lg"
          >
            {initializeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Campaign
              </>
            )}
          </Button>

          {initializeMutation.isError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                Failed to create campaign. Please try again.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
