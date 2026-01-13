import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@repo/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'
import { Separator } from '@repo/ui/components/separator'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/tabs'
import { ArrowLeft, ClipboardCopy, Eye, Users, Clock, User, AlertCircle, ShieldAlert, Loader2, FileText, Download, MessageSquare, StickyNote, CheckCircle2, Play, Radio } from 'lucide-react'
import { format } from 'date-fns'

export const Route = createFileRoute('/_app/simple/session/$sessionId')({
  component: SessionDashboardRoute,
})

function SessionDashboardRoute() {
  const { sessionId } = Route.useParams()
  return <SessionDashboard sessionId={sessionId as Id<'ttxSessions'>} />
}

function SessionDashboard({ sessionId }: { sessionId: Id<'ttxSessions'> }) {
  const q = convexQuery(api.workflows.cstabletops.api.getSessionDashboard, { sessionId })
  const reportQ = convexQuery(api.workflows.cstabletops.api.getSessionReport, { sessionId })
  const presentationQ = convexQuery(api.workflows.cstabletops.api.getLivePresentationState, { sessionId })
  const { data, isLoading, error } = useQuery(q)
  const { data: reportData } = useQuery(reportQ)
  const { data: presentationData } = useQuery(presentationQ)

  const [copied, setCopied] = useState(false)

  // Derive view-safe fallbacks so hooks run on every render.
  const session = data?.session ?? null
  const stats = data?.stats ?? { totalCards: 0, completedCards: 0, skippedCards: 0 }
  const countsByRole = data?.countsByRole ?? {}
  const isPlayer = data?.isPlayer ?? false
  const viewerPlayerRoleTitle = data?.viewerPlayerRoleTitle ?? null
  const isCompleted = session?.status === 'completed'
  const participants = data?.participants ?? []
  const cards = data?.cards ?? []

  const players = useMemo(
    () => participants.filter((p) => p.role === 'player'),
    [participants],
  )

  // Find active cards that are waiting on responses (bottlenecks)
  const bottlenecks = useMemo(
    () => cards.filter((c) => c.waitingOn && c.waitingOn.length > 0),
    [cards],
  )

  // For player view: count their assigned cards
  const playerAssignedCards = useMemo(
    () => (isPlayer ? cards.filter((c) => c.isAssignedToViewer) : []),
    [cards, isPlayer],
  )
  const playerCompletedCards = useMemo(
    () => playerAssignedCards.filter((c) => c.status === 'completed').length,
    [playerAssignedCards],
  )

  const handleExportReport = useCallback(() => {
    if (!reportData) return

    const lines: string[] = []
    const { session, participants, cards } = reportData

    // Header
    lines.push('# Tabletop Exercise Report')
    lines.push('')
    lines.push(`**Session:** ${session.title}`)
    lines.push(`**Exercise:** ${session.exerciseTitle}`)
    lines.push(`**Status:** ${session.status}`)
    lines.push(`**Created:** ${format(new Date(session.createdAt), 'PPP p')}`)
    if (session.completedAt) {
      lines.push(`**Completed:** ${format(new Date(session.completedAt), 'PPP p')}`)
    }
    lines.push('')

    // Participants
    lines.push('## Participants')
    lines.push('')
    const facilitators = participants.filter((p) => p.role === 'facilitator')
    const players = participants.filter((p) => p.role === 'player')
    const noteTakers = participants.filter((p) => p.role === 'noteTaker')
    const observers = participants.filter((p) => p.role === 'observer')

    if (facilitators.length > 0) {
      lines.push(`**Facilitators:** ${facilitators.map((p) => p.userName).join(', ')}`)
    }
    if (players.length > 0) {
      lines.push('**Players:**')
      for (const p of players) {
        lines.push(`- ${p.userName} (${p.playerRoleTitle ?? p.playerRoleKey})`)
      }
    }
    if (noteTakers.length > 0) {
      lines.push(`**Note-takers:** ${noteTakers.map((p) => p.userName).join(', ')}`)
    }
    if (observers.length > 0) {
      lines.push(`**Observers:** ${observers.map((p) => p.userName).join(', ')}`)
    }
    lines.push('')

    // Cards with responses and notes
    lines.push('## Exercise Content')
    lines.push('')

    for (const card of cards) {
      if (card.status === 'skipped') continue

      lines.push(`### Card ${card.order}: ${card.title}`)
      lines.push(`*Type: ${card.kind}*`)
      lines.push('')
      lines.push(card.body)
      lines.push('')

      if (card.prompt) {
        lines.push(`**Prompt:** ${card.prompt}`)
        lines.push('')
      }

      if (card.questions && card.questions.length > 0) {
        lines.push('**Discussion Questions:**')
        for (const q of card.questions) {
          lines.push(`- ${q}`)
        }
        lines.push('')
      }

      if (card.responses.length > 0) {
        lines.push('**Responses:**')
        lines.push('')
        for (const r of card.responses) {
          const roleLabel = r.playerRoleTitle ?? r.playerRoleKey ?? 'Unknown Role'
          lines.push(`**${roleLabel}** (${r.responderName}):`)
          lines.push(`> ${r.response.split('\n').join('\n> ')}`)
          lines.push('')
        }
      }

      if (card.notes.length > 0) {
        lines.push('**Discussion Notes:**')
        lines.push('')
        for (const n of card.notes) {
          lines.push(`*Notes by ${n.authorName}:*`)
          lines.push(`> ${n.notes.split('\n').join('\n> ')}`)
          lines.push('')
        }
      }

      lines.push('---')
      lines.push('')
    }

    // Generate and download
    const content = lines.join('\n')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.title.replace(/[^a-z0-9]/gi, '_')}_report.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [reportData])

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    )
  }

  // Check for authorization error (FORBIDDEN = not a participant)
  if (error) {
    const errorMessage = error.message ?? ''
    const isForbidden = errorMessage.includes('FORBIDDEN')

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <h1 className="text-lg font-semibold">
            {isForbidden ? 'Access Denied' : 'Error'}
          </h1>
        </div>

        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>
              {isForbidden ? 'Not a Participant' : 'Unable to Load Session'}
            </CardTitle>
            <CardDescription>
              {isForbidden
                ? 'You are not a participant in this session.'
                : 'There was an error loading this session.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isForbidden
                ? 'To view this session, you must first join using a valid join code from the facilitator.'
                : 'Please try again or contact the facilitator.'}
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/simple">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Sessions
                </Link>
              </Button>
              {isForbidden && (
                <Button asChild>
                  <Link to="/simple/join">Join a Session</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Session not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/simple">Back</Link>
        </Button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Session not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/simple">Back</Link>
        </Button>
      </div>
    )
  }

  const handleCopyJoinCode = async () => {
    if (!session.joinCode) return
    try {
      await navigator.clipboard.writeText(session.joinCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
            {isCompleted && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Completed
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{session.exerciseTitle}</p>
          {isPlayer && viewerPlayerRoleTitle && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">
                <User className="mr-1 h-3 w-3" />
                Your role: {viewerPlayerRoleTitle}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/simple">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Sessions
            </Link>
          </Button>
          {!isCompleted && (
            <Button asChild size="sm">
              <Link to="/simple/queue">Work Queue</Link>
            </Button>
          )}
          {isCompleted && reportData && (
            <Button size="sm" onClick={handleExportReport}>
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Live presentation banner */}
      {!isCompleted && presentationData?.isActive && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Radio className="h-5 w-5 text-primary animate-pulse" />
              <div>
                <span className="font-medium">Live presentation in progress</span>
                <span className="text-sm text-muted-foreground ml-2">
                  Card {presentationData.currentCard.order} of {presentationData.totalCards}
                </span>
              </div>
            </div>
            <Button asChild size="sm">
              <Link to="/simple/presentation/$sessionId" params={{ sessionId: session._id }}>
                <Play className="mr-2 h-4 w-4" />
                Join Presentation
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Start presentation button for facilitators */}
      {!isCompleted && !presentationData?.isActive && data.canManage && (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-muted-foreground" />
              <div>
                <span className="font-medium">Live Presentation Mode</span>
                <p className="text-sm text-muted-foreground">
                  Lead all participants through the exercise in sync
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/simple/presentation/$sessionId" params={{ sessionId: session._id }}>
                <Play className="mr-2 h-4 w-4" />
                Start Live Presentation
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {isCompleted ? (
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList>
            <TabsTrigger value="summary">
              <FileText className="mr-2 h-4 w-4" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="progress">
              <Eye className="mr-2 h-4 w-4" />
              Progress
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-6">
            <SessionSummary reportData={reportData} />
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
            <SessionProgress
              data={data}
              session={session}
              stats={stats}
              countsByRole={countsByRole}
              isPlayer={isPlayer}
              players={players}
              bottlenecks={bottlenecks}
              playerAssignedCards={playerAssignedCards}
              playerCompletedCards={playerCompletedCards}
              copied={copied}
              handleCopyJoinCode={handleCopyJoinCode}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <SessionProgress
          data={data}
          session={session}
          stats={stats}
          countsByRole={countsByRole}
          isPlayer={isPlayer}
          players={players}
          bottlenecks={bottlenecks}
          playerAssignedCards={playerAssignedCards}
          playerCompletedCards={playerCompletedCards}
          copied={copied}
          handleCopyJoinCode={handleCopyJoinCode}
        />
      )}
    </div>
  )
}

// Type for session report data
interface ReportParticipant {
  role: 'facilitator' | 'noteTaker' | 'player' | 'observer'
  playerRoleKey: string | null
  playerRoleTitle: string | null
  userName: string
}

interface ReportResponse {
  playerRoleKey: string | null
  playerRoleTitle: string | null
  responderName: string
  response: string
  createdAt: number
}

interface ReportNote {
  authorName: string
  notes: string
  createdAt: number
}

interface ReportCard {
  order: number
  kind: 'scenario' | 'inject' | 'prompt' | 'discussion'
  title: string
  body: string
  prompt: string | null
  questions: string[] | null
  status: 'pending' | 'active' | 'completed' | 'skipped'
  assignedPlayerRoleKey: string | null
  assignedPlayerRoleTitle: string | null
  responses: ReportResponse[]
  notes: ReportNote[]
}

interface ReportData {
  session: {
    _id: Id<'ttxSessions'>
    title: string
    exerciseKey: string
    exerciseTitle: string
    status: 'active' | 'completed'
    createdAt: number
    completedAt: number | null
  }
  participants: ReportParticipant[]
  cards: ReportCard[]
}

function SessionSummary({ reportData }: { reportData: ReportData | null | undefined }) {
  if (!reportData) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading summary…
      </div>
    )
  }

  const { session, participants, cards } = reportData

  const facilitators = participants.filter((p) => p.role === 'facilitator')
  const playerParticipants = participants.filter((p) => p.role === 'player')
  const noteTakers = participants.filter((p) => p.role === 'noteTaker')

  // Count responses and notes
  const totalResponses = cards.reduce((acc, c) => acc + c.responses.length, 0)
  const totalNotes = cards.reduce((acc, c) => acc + c.notes.length, 0)

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {session.completedAt
                ? formatDuration(session.completedAt - session.createdAt)
                : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Participants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{participants.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Responses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalResponses}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalNotes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Participants
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {facilitators.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Facilitators</h4>
              <div className="flex flex-wrap gap-2">
                {facilitators.map((p, i) => (
                  <Badge key={i} variant="secondary">{p.userName}</Badge>
                ))}
              </div>
            </div>
          )}
          {playerParticipants.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Players</h4>
              <div className="flex flex-wrap gap-2">
                {playerParticipants.map((p, i) => (
                  <Badge key={i} variant="outline">
                    {p.userName} ({p.playerRoleTitle ?? p.playerRoleKey})
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {noteTakers.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Note-takers</h4>
              <div className="flex flex-wrap gap-2">
                {noteTakers.map((p, i) => (
                  <Badge key={i} variant="secondary">{p.userName}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Responses and notes by card */}
      {cards.filter((c) => c.status !== 'skipped' && (c.responses.length > 0 || c.notes.length > 0)).map((card) => (
        <Card key={card.order}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Card {card.order}: {card.title}
              </CardTitle>
              <Badge variant="outline">{card.kind}</Badge>
            </div>
            {card.assignedPlayerRoleTitle && (
              <CardDescription>Assigned to: {card.assignedPlayerRoleTitle}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {card.responses.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Responses
                </h4>
                {card.responses.map((r, i) => (
                  <div key={i} className="border-l-2 border-primary/20 pl-4 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">
                        {r.playerRoleTitle ?? r.playerRoleKey ?? 'Unknown'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{r.responderName}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.response}</p>
                  </div>
                ))}
              </div>
            )}
            {card.notes.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  Discussion Notes
                </h4>
                {card.notes.map((n, i) => (
                  <div key={i} className="border-l-2 border-amber-500/30 pl-4 py-2 bg-amber-500/5 rounded-r">
                    <div className="text-xs text-muted-foreground mb-1">Notes by {n.authorName}</div>
                    <p className="text-sm whitespace-pre-wrap">{n.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

// Type for dashboard data
interface DashboardCardWaitingOn {
  roleKey: string
  roleTitle: string | null
}

interface DashboardExpectedResponder {
  roleKey: string
  roleTitle: string | null
  hasResponded: boolean
}

interface DashboardCard {
  _id: Id<'ttxCards'>
  order: number
  kind: 'scenario' | 'inject' | 'prompt' | 'discussion'
  title: string
  status: 'pending' | 'active' | 'completed' | 'skipped'
  assignedPlayerRoleKey: string | null
  assignedPlayerRoleTitle: string | null
  completedAt: number | null
  responseCount: number
  expectedResponders: DashboardExpectedResponder[]
  waitingOn: DashboardCardWaitingOn[]
  isAssignedToViewer: boolean
}

interface DashboardParticipant {
  _id: Id<'ttxParticipants'>
  userId: Id<'users'>
  role: 'facilitator' | 'noteTaker' | 'player' | 'observer'
  playerRoleKey: string | null
  playerRoleTitle: string | null
  createdAt: number
}

interface DashboardSession {
  _id: Id<'ttxSessions'>
  title: string
  exerciseKey: string
  exerciseTitle: string
  joinCode: string | null
  status: 'active' | 'completed'
  createdAt: number
  completedAt: number | null
  playerRoles: Array<{ key: string; title: string }>
}

interface DashboardData {
  viewerRole: 'facilitator' | 'noteTaker' | 'player' | 'observer'
  viewerPlayerRoleKey: string | null
  viewerPlayerRoleTitle: string | null
  isPlayer: boolean
  canManage: boolean
  session: DashboardSession
  stats: {
    totalCards: number
    completedCards: number
    skippedCards: number
  }
  countsByRole: Record<string, number>
  participants: DashboardParticipant[]
  cards: DashboardCard[]
}

interface SessionProgressProps {
  data: DashboardData
  session: DashboardSession
  stats: DashboardData['stats']
  countsByRole: DashboardData['countsByRole']
  isPlayer: boolean
  players: DashboardParticipant[]
  bottlenecks: DashboardCard[]
  playerAssignedCards: DashboardCard[]
  playerCompletedCards: number
  copied: boolean
  handleCopyJoinCode: () => void
}

function SessionProgress({
  data,
  session,
  stats,
  countsByRole,
  isPlayer,
  players,
  bottlenecks,
  playerAssignedCards,
  playerCompletedCards,
  copied,
  handleCopyJoinCode,
}: SessionProgressProps) {
  return (
    <>
      <div className={`grid grid-cols-1 gap-4 ${isPlayer ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
        {/* Join code card - only visible to non-players */}
        {!isPlayer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Join code</CardTitle>
              <CardDescription>Share with players to join</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="font-mono text-lg tracking-widest">
                {session.joinCode ?? '—'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyJoinCode}
                disabled={!session.joinCode}
              >
                <ClipboardCopy className="mr-2 h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Player-specific card showing their progress */}
        {isPlayer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Your Progress</CardTitle>
              <CardDescription>Tasks assigned to you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {playerCompletedCards}/{playerAssignedCards.length} completed
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {playerAssignedCards.length - playerCompletedCards > 0
                  ? `${playerAssignedCards.length - playerCompletedCards} task(s) remaining`
                  : 'All your tasks are complete'}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
            <CardDescription>Cards completed/skipped</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {stats.completedCards}/{stats.totalCards} completed
              </Badge>
              {stats.skippedCards > 0 ? (
                <Badge variant="outline">{stats.skippedCards} skipped</Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Status: {session.status}
            </p>
          </CardContent>
        </Card>

        {!isPlayer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Participants</CardTitle>
              <CardDescription>Who is currently joined</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  <Users className="mr-1 h-3 w-3" />
                  {data.participants.length} total
                </Badge>
                <Badge variant="outline">
                  <Eye className="mr-1 h-3 w-3" />
                  {countsByRole.observer ?? 0} observers
                </Badge>
                <Badge variant="outline">
                  {countsByRole.player ?? 0} players
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Players joined: {players.length}/{session.playerRoles.length} roles
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottleneck alert - only show to facilitators/observers when there are active bottlenecks */}
      {!isPlayer && bottlenecks.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Waiting for responses
            </CardTitle>
            <CardDescription>These cards are waiting on player responses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bottlenecks.map((card) => (
                <div key={card._id} className="flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">{card.title}</span>
                  <span className="text-muted-foreground">waiting on</span>
                  {card.waitingOn.map((w) => (
                    <Badge key={w.roleKey} variant="outline" className="border-amber-500/30">
                      {w.roleTitle ?? w.roleKey}
                    </Badge>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 px-6 py-4">
          <CardTitle className="text-base">Cards</CardTitle>
          <CardDescription className="text-xs">
            {isPlayer ? 'Exercise progress (cards assigned to you are highlighted)' : 'Status and role assignment per card'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16">#</TableHead>
                <TableHead>Card</TableHead>
                <TableHead className="hidden md:table-cell">Assigned</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cards.map((card) => (
                <TableRow
                  key={card._id}
                  className={card.isAssignedToViewer ? 'bg-primary/5' : undefined}
                >
                  <TableCell className="text-muted-foreground font-mono">
                    {card.order}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-medium flex items-center gap-2">
                        {card.title}
                        {card.isAssignedToViewer && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {card.kind}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {card.assignedPlayerRoleTitle ? (
                      <Badge
                        variant="outline"
                        className={card.waitingOn && card.waitingOn.length > 0 ? 'border-amber-500/30 text-amber-600' : ''}
                      >
                        {card.assignedPlayerRoleTitle}
                        {card.waitingOn && card.waitingOn.length > 0 && (
                          <Clock className="ml-1 h-3 w-3" />
                        )}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        card.status === 'completed'
                          ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                          : card.status === 'active'
                            ? 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5'
                            : card.status === 'skipped'
                              ? 'border-muted-foreground/30 text-muted-foreground bg-muted/20'
                              : 'border-muted-foreground/20 text-muted-foreground'
                      }
                    >
                      {card.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
