import { api } from '@/convex/_generated/api'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/deals')({
  component: RouteComponent,
  loader: async ({ context }) => {
    const workflowStructure = await context.convexClient.query(
      api.workflows.metadata.getWorkflowStructure,
      { workflow: { name: 'dealToDelivery', version: 'v1' } },
    )
    return {
      crumb: 'Deals',
      headerRight: {
        type: 'workflowStructure',
        data: workflowStructure,
      },
    }
  },
})

function RouteComponent() {
  return (
    <div className="h-full max-h-full overflow-y-auto">
      <Outlet />
    </div>
  )
}
