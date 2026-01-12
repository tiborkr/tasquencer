import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Textarea } from '@repo/ui/components/textarea'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@repo/ui/components/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import { Separator } from '@repo/ui/components/separator'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Square,
  Eye,
  Loader2,
  AlertCircle,
  User,
  Users,
  MessageSquare,
  Clock,
  CheckCircle2,
  Send,
} from 'lucide-react'

export const Route = createFileRoute('/_app/simple/presentation/$sessionId')({
  component: LivePresentationRoute,
})

function LivePresentationRoute() {
  const { sessionId } = Route.useParams()
  return <LivePresentation sessionId={sessionId as Id<'ttxSessions'>} />
}

function LivePresentation({ sessionId }: { sessionId: Id<'ttxSessions'> }) {
  const navigate = useNavigate()

  const presentationQ = convexQuery(
    api.workflows.cstabletops.api.getLivePresentationState,
    { sessionId },
  )
  const cardsQ = convexQuery(api.workflows.cstabletops.api.getSessionCards, { sessionId })

  const { data: presentation, isLoading, error, isError } = useQuery(presentationQ)
  const { data: cards } = useQuery(cardsQ)

  const startMutation = useMutation(api.workflows.cstabletops.api.startLivePresentation)
  const navigateMutation = useMutation(api.workflows.cstabletops.api.navigatePresentationCard)
  const pauseMutation = useMutation(api.workflows.cstabletops.api.pausePresentation)
  const resumeMutation = useMutation(api.workflows.cstabletops.api.resumePresentation)
  const showResponsesMutation = useMutation(api.workflows.cstabletops.api.showPresentationResponses)
  const endMutation = useMutation(api.workflows.cstabletops.api.endLivePresentation)
  const submitResponseMutation = useMutation(api.workflows.cstabletops.api.submitLiveResponse)

  const [responseText, setResponseText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  // Handle starting the presentation
  const handleStart = useCallback(async () => {
    setIsStarting(true)
    try {
      await startMutation({ sessionId })
    } catch (e) {
      console.error('Failed to start presentation:', e)
    } finally {
      setIsStarting(false)
    }
  }, [sessionId, startMutation])

  // Handle ending the presentation
  const handleEnd = useCallback(async () => {
    setIsEnding(true)
    try {
      await endMutation({ sessionId })
      navigate({ to: '/simple/session/$sessionId', params: { sessionId } })
    } catch (e) {
      console.error('Failed to end presentation:', e)
    } finally {
      setIsEnding(false)
    }
  }, [sessionId, endMutation, navigate])

  // Handle navigation
  const handleNavigate = useCallback(
    async (cardId: Id<'ttxCards'>) => {
      try {
        await navigateMutation({ sessionId, cardId })
      } catch (e) {
        console.error('Failed to navigate:', e)
      }
    },
    [sessionId, navigateMutation],
  )

  const handlePrevious = useCallback(() => {
    if (!presentation?.isActive || !cards) return
    const currentOrder = presentation.currentCard.order
    const prevCard = cards.find((c) => c.order === currentOrder - 1)
    if (prevCard) {
      handleNavigate(prevCard._id)
    }
  }, [presentation, cards, handleNavigate])

  const handleNext = useCallback(() => {
    if (!presentation?.isActive || !cards) return
    const currentOrder = presentation.currentCard.order
    const nextCard = cards.find((c) => c.order === currentOrder + 1)
    if (nextCard) {
      handleNavigate(nextCard._id)
    }
  }, [presentation, cards, handleNavigate])

  // Handle pause/resume
  const handlePause = useCallback(async () => {
    try {
      await pauseMutation({ sessionId })
    } catch (e) {
      console.error('Failed to pause:', e)
    }
  }, [sessionId, pauseMutation])

  const handleResume = useCallback(async () => {
    try {
      await resumeMutation({ sessionId })
    } catch (e) {
      console.error('Failed to resume:', e)
    }
  }, [sessionId, resumeMutation])

  // Handle showing responses
  const handleShowResponses = useCallback(async () => {
    try {
      await showResponsesMutation({ sessionId })
    } catch (e) {
      console.error('Failed to show responses:', e)
    }
  }, [sessionId, showResponsesMutation])

  // Handle submitting response
  const handleSubmitResponse = useCallback(async () => {
    if (!presentation?.isActive || !responseText.trim()) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await submitResponseMutation({
        sessionId,
        cardId: presentation.currentCard._id,
        response: responseText.trim(),
      })
      setResponseText('')
    } catch (e: any) {
      const msg = e.message ?? ''
      if (msg.includes('ALREADY_RESPONDED')) {
        setSubmitError('You have already submitted a response for this card.')
      } else if (msg.includes('NOT_ASSIGNED_TO_THIS_CARD')) {
        setSubmitError('This card is not assigned to you.')
      } else {
        setSubmitError('Failed to submit response. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [sessionId, presentation, responseText, submitResponseMutation])

  // Reset response text when card changes
  useEffect(() => {
    setResponseText('')
    setSubmitError(null)
  }, [presentation?.isActive ? presentation.currentCard._id : null])

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading presentation…
      </div>
    )
  }

  if (isError) {
    const errorMessage = error?.message ?? ''
    const isForbidden = errorMessage.includes('FORBIDDEN')

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <h1 className="text-lg font-semibold">
            {isForbidden ? 'Access Denied' : 'Error'}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {isForbidden
            ? 'You are not a participant in this session.'
            : 'There was an error loading the presentation.'}
        </p>
        <Button asChild variant="outline">
          <Link to="/simple">Back to Sessions</Link>
        </Button>
      </div>
    )
  }

  // No active presentation - show start button for facilitators
  if (!presentation?.isActive) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/simple/session/$sessionId" params={{ sessionId }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Live Presentation</CardTitle>
            <CardDescription>
              No presentation is currently active for this session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground text-center">
              Start a live presentation to synchronize all participants on the same card view.
            </p>
            <Button onClick={handleStart} disabled={isStarting}>
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Live Presentation
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const {
    status,
    currentCard,
    responses,
    expectedResponders,
    totalCards,
    viewerRole,
    viewerPlayerRoleTitle,
    isCardAssignedToViewer,
    hasViewerResponded,
    canGoBack,
    canGoForward,
  } = presentation

  const isFacilitator = viewerRole === 'facilitator'
  const isPlayer = viewerRole === 'player'
  const isPaused = status === 'paused'
  const isShowingResponses = status === 'showing_responses'

  // Check if the current card expects a response from this player
  const needsResponse =
    isPlayer &&
    isCardAssignedToViewer &&
    currentCard.kind === 'prompt' &&
    !hasViewerResponded

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/simple/session/$sessionId" params={{ sessionId }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Exit
              </Link>
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Badge variant={isPaused ? 'secondary' : 'default'}>
                {isPaused ? (
                  <>
                    <Pause className="mr-1 h-3 w-3" />
                    Paused
                  </>
                ) : isShowingResponses ? (
                  <>
                    <Eye className="mr-1 h-3 w-3" />
                    Showing Responses
                  </>
                ) : (
                  <>
                    <Play className="mr-1 h-3 w-3" />
                    Live
                  </>
                )}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Card {currentCard.order} of {totalCards}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPlayer && viewerPlayerRoleTitle && (
              <Badge variant="outline">
                <User className="mr-1 h-3 w-3" />
                {viewerPlayerRoleTitle}
              </Badge>
            )}
            {isFacilitator && (
              <Badge variant="outline">
                <Users className="mr-1 h-3 w-3" />
                Facilitator
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Paused banner */}
          {isPaused && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex items-center gap-3 py-4">
                <Clock className="h-5 w-5 text-amber-600" />
                <span className="font-medium">Presentation is paused</span>
                {isFacilitator && (
                  <Button size="sm" onClick={handleResume} className="ml-auto">
                    <Play className="mr-2 h-4 w-4" />
                    Resume
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Current card display */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-muted/30 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <Badge variant="outline" className="mb-2">
                    {currentCard.kind}
                  </Badge>
                  <CardTitle className="text-xl">{currentCard.title}</CardTitle>
                  {currentCard.assignedPlayerRoleTitle && (
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <User className="h-3 w-3" />
                      Assigned to: {currentCard.assignedPlayerRoleTitle}
                    </CardDescription>
                  )}
                </div>
                <div className="text-3xl font-bold text-muted-foreground/30">
                  {currentCard.order}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="whitespace-pre-wrap text-base leading-relaxed">
                  {currentCard.body}
                </p>
              </div>

              {currentCard.prompt && (
                <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Prompt
                  </h4>
                  <p className="text-sm">{currentCard.prompt}</p>
                </div>
              )}

              {currentCard.questions && currentCard.questions.length > 0 && (
                <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-medium mb-2">Discussion Questions</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {currentCard.questions.map((q, i) => (
                      <li key={i} className="text-sm">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Response input for players */}
          {needsResponse && !isPaused && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Your Response
                </CardTitle>
                <CardDescription>
                  This prompt is assigned to you. Enter your response below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Type your response here..."
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  rows={4}
                  disabled={isSubmitting}
                />
                {submitError && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {submitError}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSubmitResponse}
                    disabled={!responseText.trim() || isSubmitting}
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Submit Response
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Response submitted confirmation */}
          {isPlayer && isCardAssignedToViewer && hasViewerResponded && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="flex items-center gap-3 py-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">Your response has been submitted</span>
              </CardContent>
            </Card>
          )}

          {/* Responses display (for facilitators or when showing_responses) */}
          {(isFacilitator || isShowingResponses) && responses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Responses ({responses.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {responses.map((r, i) => (
                  <div key={i} className="border-l-2 border-primary/20 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">
                        {r.playerRoleTitle ?? r.playerRoleKey ?? 'Unknown'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {r.responderName}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.response}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Response status for facilitators */}
          {isFacilitator && expectedResponders.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Response Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {expectedResponders.map((r) => (
                    <Badge
                      key={r.roleKey}
                      variant={r.hasResponded ? 'default' : 'outline'}
                      className={
                        r.hasResponded
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                          : 'border-amber-500/30 text-amber-600'
                      }
                    >
                      {r.hasResponded ? (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      ) : (
                        <Clock className="mr-1 h-3 w-3" />
                      )}
                      {r.roleTitle ?? r.roleKey}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom controls for facilitator */}
      {isFacilitator && (
        <div className="border-t bg-muted/30 px-4 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={!canGoBack}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>

              {cards && cards.length > 0 && (
                <Select
                  value={currentCard._id}
                  onValueChange={(val) => handleNavigate(val as Id<'ttxCards'>)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card._id} value={card._id}>
                        {card.order}. {card.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={!canGoForward}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {isPaused ? (
                <Button variant="outline" size="sm" onClick={handleResume}>
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handlePause}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
              )}

              {!isShowingResponses && responses.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleShowResponses}>
                  <Eye className="mr-2 h-4 w-4" />
                  Show Responses
                </Button>
              )}

              <Button
                variant="destructive"
                size="sm"
                onClick={handleEnd}
                disabled={isEnding}
              >
                {isEnding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-2 h-4 w-4" />
                )}
                End Presentation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
