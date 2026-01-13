import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import { Textarea } from '@repo/ui/components/textarea'
import { Checkbox } from '@repo/ui/components/checkbox'
import { PlusCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/_app/campaigns/new')({
  component: NewCampaign,
})

const CHANNEL_OPTIONS = [
  { id: 'email', label: 'Email' },
  { id: 'paid_ads', label: 'Paid Ads' },
  { id: 'social', label: 'Social Media' },
  { id: 'events', label: 'Events' },
  { id: 'content', label: 'Content Marketing' },
] as const

type Channel = (typeof CHANNEL_OPTIONS)[number]['id']

function NewCampaign() {
  const navigate = useNavigate()

  // Get current authenticated user
  const { data: currentUser } = useSuspenseQuery(
    convexQuery(api.auth.getCurrentUser, {}),
  )

  // Form state
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [keyMessages, setKeyMessages] = useState('')
  const [channels, setChannels] = useState<Channel[]>(['email', 'social'])
  const [estimatedBudget, setEstimatedBudget] = useState('10000')
  const [startDaysFromNow, setStartDaysFromNow] = useState('7')
  const [durationDays, setDurationDays] = useState('30')

  const initializeMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.initializeRootWorkflow,
    ),
    onSuccess: () => {
      navigate({ to: '/campaigns' })
    },
  })

  const handleChannelToggle = (channelId: Channel) => {
    setChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId],
    )
  }

  const handleCreate = () => {
    const now = Date.now()
    const startOffset = parseInt(startDaysFromNow) || 7
    const duration = parseInt(durationDays) || 30
    const messages = keyMessages
      .split('\n')
      .map((m) => m.trim())
      .filter((m) => m.length > 0)

    initializeMutation.mutate({
      payload: {
        name: name || 'New Campaign',
        objective: objective || 'Campaign objective',
        targetAudience: targetAudience || 'Target audience',
        keyMessages: messages.length > 0 ? messages : ['Key message 1'],
        channels: channels.length > 0 ? channels : ['email'],
        proposedStartDate: now + startOffset * 24 * 60 * 60 * 1000,
        proposedEndDate: now + (startOffset + duration) * 24 * 60 * 60 * 1000,
        estimatedBudget: parseInt(estimatedBudget) || 10000,
        // userId is the application user ID from the 'users' table
        // (_id is the Better Auth user ID, which is different)
        requesterId: currentUser?.userId ?? '',
      },
    })
  }

  const isValid =
    name.trim().length > 0 && channels.length > 0 && currentUser?.userId

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <PlusCircle className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">New Campaign</h1>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto">
        <div className="rounded-lg border bg-card p-6 space-y-6">
          <div>
            <h2 className="text-base font-medium">Create Campaign Request</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Fill in the campaign details to start the 8-phase approval
              workflow.
            </p>
          </div>

          <div className="space-y-5">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Campaign Name <span className="text-destructive">*</span>
                </Label>
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
                  placeholder="What are you trying to achieve with this campaign?"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audience">Target Audience</Label>
                <Input
                  id="audience"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., Enterprise customers in tech sector"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="messages">Key Messages (one per line)</Label>
                <Textarea
                  id="messages"
                  value={keyMessages}
                  onChange={(e) => setKeyMessages(e.target.value)}
                  placeholder="Enter key messages, one per line..."
                  rows={3}
                />
              </div>
            </div>

            {/* Channels */}
            <div className="space-y-3">
              <Label>
                Channels <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CHANNEL_OPTIONS.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={channels.includes(channel.id)}
                      onCheckedChange={() => handleChannelToggle(channel.id)}
                    />
                    <span className="text-sm">{channel.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Budget and Timeline */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Estimated Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  min="0"
                  value={estimatedBudget}
                  onChange={(e) => setEstimatedBudget(e.target.value)}
                  placeholder="10000"
                />
                <p className="text-xs text-muted-foreground">
                  {parseInt(estimatedBudget) >= 50000
                    ? 'Requires executive approval'
                    : 'Requires director approval'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="startDays">Start (days from now)</Label>
                <Input
                  id="startDays"
                  type="number"
                  min="1"
                  value={startDaysFromNow}
                  onChange={(e) => setStartDaysFromNow(e.target.value)}
                  placeholder="7"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (days)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="30"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button
              onClick={handleCreate}
              disabled={initializeMutation.isPending || !isValid}
              className="w-full"
              size="lg"
            >
              {initializeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Campaign...
                </>
              ) : (
                <>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Campaign
                </>
              )}
            </Button>
          </div>

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
