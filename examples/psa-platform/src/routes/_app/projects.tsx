import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useMemo } from 'react'
import { Card, CardContent } from '@repo/ui/components/card'
import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Input } from '@repo/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import {
  FolderKanban,
  Users,
  Calendar,
  DollarSign,
} from 'lucide-react'

export const Route = createFileRoute('/_app/projects')({
  component: RouteComponent,
  loader: () => ({
    crumb: 'Projects',
  }),
})

const STATUS_COLORS: Record<string, string> = {
  Planning: 'bg-blue-100 text-blue-700',
  Active: 'bg-green-100 text-green-700',
  OnHold: 'bg-yellow-100 text-yellow-700',
  Completed: 'bg-slate-100 text-slate-700',
  Archived: 'bg-gray-100 text-gray-700',
}

const HEALTH_COLORS: Record<string, string> = {
  healthy: 'text-green-600',
  at_risk: 'text-yellow-600',
  critical: 'text-red-600',
  planning: 'text-blue-600',
}

const HEALTH_ICONS: Record<string, string> = {
  healthy: '🟢',
  at_risk: '🟡',
  critical: '🔴',
  planning: '🔵',
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function RouteComponent() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'status'>('recent')

  // Get current user
  const currentUser = useQuery(api.workflows.dealToDelivery.api.getCurrentUser)

  // Get user's projects
  const projects = useQuery(api.workflows.dealToDelivery.api.getMyProjects)

  // Type from query
  type Project = NonNullable<typeof projects>[number]

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    if (!projects) return []

    let result = [...projects]

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((p: Project) => p.status === statusFilter)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((p: Project) =>
        p.name.toLowerCase().includes(query)
      )
    }

    // Sort
    switch (sortBy) {
      case 'name':
        result.sort((a: Project, b: Project) => a.name.localeCompare(b.name))
        break
      case 'status':
        result.sort((a: Project, b: Project) => a.status.localeCompare(b.status))
        break
      case 'recent':
      default:
        result.sort((a: Project, b: Project) => b._creationTime - a._creationTime)
        break
    }

    return result
  }, [projects, statusFilter, searchQuery, sortBy])

  // Count by status
  const statusCounts = useMemo(() => {
    if (!projects) return { all: 0, Planning: 0, Active: 0, OnHold: 0, Completed: 0 }

    return {
      all: projects.length,
      Planning: projects.filter((p: Project) => p.status === 'Planning').length,
      Active: projects.filter((p: Project) => p.status === 'Active').length,
      OnHold: projects.filter((p: Project) => p.status === 'OnHold').length,
      Completed: projects.filter((p: Project) => p.status === 'Completed').length,
    }
  }, [projects])

  // Calculate health status for a project
  const getHealthStatus = (project: Project): 'healthy' | 'at_risk' | 'critical' | 'planning' => {
    if (project.status === 'Planning') return 'planning'
    // For active projects, we'd need budget data to determine health
    // For now, use a simplified heuristic
    if (project.status === 'Completed') return 'healthy'
    if (project.status === 'OnHold') return 'at_risk'
    return 'healthy' // Default for Active projects without budget data
  }

  if (currentUser === undefined || projects === undefined) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            View and manage your projects
          </p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          All ({statusCounts.all})
        </Button>
        <Button
          variant={statusFilter === 'Active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('Active')}
        >
          Active ({statusCounts.Active})
        </Button>
        <Button
          variant={statusFilter === 'Planning' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('Planning')}
        >
          Planning ({statusCounts.Planning})
        </Button>
        <Button
          variant={statusFilter === 'OnHold' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('OnHold')}
        >
          On Hold ({statusCounts.OnHold})
        </Button>
        <Button
          variant={statusFilter === 'Completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('Completed')}
        >
          Completed ({statusCounts.Completed})
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Input
          placeholder="Search projects..."
          className="max-w-xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        {filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FolderKanban className="h-12 w-12 mx-auto mb-4 opacity-50" />
              {projects.length === 0 ? (
                <>
                  <p>No projects yet.</p>
                  <p className="text-sm mt-2">
                    Projects are created when deals are won.
                  </p>
                  <Link to="/deals" className="text-primary hover:underline mt-4 inline-block">
                    View Deals Pipeline
                  </Link>
                </>
              ) : (
                <>
                  <p>No projects match your filters.</p>
                  <Button
                    variant="link"
                    onClick={() => {
                      setStatusFilter('all')
                      setSearchQuery('')
                    }}
                  >
                    Clear Filters
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredProjects.map((project: Project) => {
            const health = getHealthStatus(project)

            return (
              <Card
                key={project._id}
                className="hover:shadow-md transition-shadow cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg">{HEALTH_ICONS[health]}</span>
                        <h3 className="text-lg font-semibold">{project.name}</h3>
                        <Badge className={STATUS_COLORS[project.status]} variant="secondary">
                          {project.status}
                        </Badge>
                      </div>

                      {/* Project Info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mt-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {formatDate(project.startDate)}
                            {project.endDate && ` - ${formatDate(project.endDate)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>Manager assigned</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <span>Budget tracked</span>
                        </div>
                        <div className={`flex items-center gap-2 ${HEALTH_COLORS[health]}`}>
                          <span>
                            {health === 'healthy' && 'On Track'}
                            {health === 'at_risk' && 'At Risk'}
                            {health === 'critical' && 'Critical'}
                            {health === 'planning' && 'Planning'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
