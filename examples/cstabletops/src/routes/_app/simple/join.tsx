import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import { ArrowLeft, DoorOpen, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_app/simple/join')({
  component: JoinSessionPage,
})

type JoinRole = 'player' | 'observer' | 'noteTaker'

function JoinSessionPage() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [role, setRole] = useState<JoinRole>('player')
  const [playerRoleKey, setPlayerRoleKey] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const normalizedJoinCode = joinCode.trim().toUpperCase()

  const joinInfoQuery = useQuery({
    ...convexQuery(api.workflows.cstabletops.api.getJoinInfo, {
      joinCode: normalizedJoinCode,
    }),
    enabled: normalizedJoinCode.length > 0,
  })

  const joinInfo = joinInfoQuery.data ?? null

  const availablePlayerRoles = joinInfo?.playerRoles ?? []

  const defaultPlayerRoleKey = useMemo(() => {
    return availablePlayerRoles[0]?.key ?? ''
  }, [availablePlayerRoles])

  // Keep player role selection valid
  useEffect(() => {
    if (role !== 'player') return
    if (!joinInfo) return
    if (playerRoleKey && availablePlayerRoles.some((r) => r.key === playerRoleKey)) {
      return
    }
    setPlayerRoleKey(defaultPlayerRoleKey)
  }, [role, joinInfo, playerRoleKey, availablePlayerRoles, defaultPlayerRoleKey])

  const joinMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.cstabletops.api.joinSession),
    onSuccess: () => navigate({ to: '/simple/queue' }),
    onError: (err) => {
      const msg = err.message || ''
      if (msg.includes('SESSION_COMPLETED')) {
        setError('This session has already ended.')
      } else if (msg.startsWith('PLAYER_ROLE_TAKEN:')) {
        const roleTitle = msg.split(':')[1]
        setError(`${roleTitle} role is already assigned. Please choose another role.`)
      } else if (msg.includes('ALREADY_JOINED_SESSION')) {
        setError('You have already joined this session.')
      } else {
        setError(msg || 'Failed to join session')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!normalizedJoinCode) {
      setError('Join code is required')
      return
    }

    if (role === 'player' && !playerRoleKey) {
      setError('Choose a player role')
      return
    }

    joinMutation.mutate({
      joinCode: normalizedJoinCode,
      role,
      ...(role === 'player' ? { playerRoleKey } : {}),
    })
  }

  const isPending = joinMutation.isPending || joinInfoQuery.isFetching

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <DoorOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Join Session</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/simple">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Sessions
          </Link>
        </Button>
      </div>

      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Enter join code</CardTitle>
            <CardDescription>
              Join a tabletop session as a player, observer, or note-taker.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="joinCode">Join code</Label>
                <Input
                  id="joinCode"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="e.g., A1B2C3D4"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {joinInfo ? (
                  joinInfo.status === 'completed' ? (
                    <p className="text-sm text-destructive">
                      This session has already ended.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Joining: <span className="font-medium">{joinInfo.title}</span>{' '}
                      · {joinInfo.exerciseTitle}
                    </p>
                  )
                ) : normalizedJoinCode.length > 0 && joinInfoQuery.isFetched ? (
                  <p className="text-sm text-destructive">
                    Invalid join code. Please check and try again.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as JoinRole)}>
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="player">Player</SelectItem>
                    <SelectItem value="noteTaker">Note-taker</SelectItem>
                    <SelectItem value="observer">Observer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === 'player' ? (
                <div className="space-y-2">
                  <Label htmlFor="playerRole">Player role</Label>
                  <Select
                    value={playerRoleKey}
                    onValueChange={(v) => setPlayerRoleKey(v)}
                    disabled={!joinInfo}
                  >
                    <SelectTrigger id="playerRole" className="w-full">
                      <SelectValue
                        placeholder={joinInfo ? 'Select role' : 'Enter join code first'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePlayerRoles.map((r) => (
                        <SelectItem key={r.key} value={r.key}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={isPending || !joinInfo || joinInfo.status === 'completed'}
                className="w-full"
                size="lg"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Join
                  </>
                )}
              </Button>

              {error ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
