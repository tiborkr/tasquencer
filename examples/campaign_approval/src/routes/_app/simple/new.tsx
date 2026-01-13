import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import { PlusCircle, ArrowLeft, ListTodo, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/_app/simple/new')({
  component: NewCampaign,
})

function NewCampaign() {
  const navigate = useNavigate()

  const initializeMutation = useMutation({
    mutationFn: useConvexMutation(
      api.workflows.campaign_approval.api.initializeRootWorkflow,
    ),
    onSuccess: () => {
      navigate({ to: '/simple/queue' })
    },
  })

  const handleCreate = () => {
    initializeMutation.mutate({ payload: {} })
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
            <h2 className="text-base font-medium">Create Campaign Workflow</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A work item will be created for you to enter the LCampaign message.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <h4 className="text-sm font-medium mb-3">What happens next?</h4>
            <ol className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center flex-shrink-0">
                  1
                </span>
                <span>A new workflow is initialized</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center flex-shrink-0">
                  2
                </span>
                <span>A work item is added to the queue</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center flex-shrink-0">
                  3
                </span>
                <span>You can claim it and enter your LCampaign</span>
              </li>
            </ol>
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
                Create Campaign Workflow
              </>
            )}
          </Button>

          {initializeMutation.isError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">
                Failed to create LCampaign. Please try again.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
