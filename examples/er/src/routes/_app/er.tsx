import { api } from '@/convex/_generated/api'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/er')({
  component: ErLayout,
  loader: async ({ context }) => {
    const workflowStructure = await context.convexClient.query(
      api.workflows.metadata.getWorkflowStructure,
      { workflow: { name: 'erPatientJourney', version: 'v1' } },
    )
    return {
      headerRight: {
        type: 'workflowStructure',
        data: workflowStructure,
      },
    }
  },
})

function ErLayout() {
  return (
    <div className="h-full max-h-full overflow-y-auto">
      <Outlet />
    </div>
  )
}
