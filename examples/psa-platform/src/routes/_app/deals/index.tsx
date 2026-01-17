import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table'
import { Badge } from '@repo/ui/components/badge'
import { Plus, Briefcase } from 'lucide-react'

export const Route = createFileRoute('/_app/deals/')({
  component: DealsPage,
})

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function getStageBadgeVariant(stage: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (stage) {
    case 'Won':
      return 'default'
    case 'Lost':
    case 'Disqualified':
      return 'destructive'
    case 'Qualified':
    case 'Proposal':
    case 'Negotiation':
      return 'secondary'
    default:
      return 'outline'
  }
}

function DealsPage() {
  const deals = useQuery(api.workflows.dealToDelivery.api.deals.listDeals)

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
              <Briefcase className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                Deals Pipeline
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Manage your sales pipeline and track deal progress.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link to="/deals/new">
              <Plus className="h-4 w-4 mr-2" />
              New Deal
            </Link>
          </Button>
        </div>

        {/* Deals Table */}
        <Card>
          <CardHeader>
            <CardTitle>Active Deals</CardTitle>
            <CardDescription>
              All deals in your pipeline. Click a deal to view details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deals === undefined ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Loading deals...
              </div>
            ) : deals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No deals yet</h3>
                <p className="text-muted-foreground mt-1 mb-4">
                  Get started by creating your first deal.
                </p>
                <Button asChild>
                  <Link to="/deals/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Deal
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => (
                    <TableRow key={deal._id}>
                      <TableCell className="font-medium">{deal.name}</TableCell>
                      <TableCell>
                        <Badge variant={getStageBadgeVariant(deal.stage)}>
                          {deal.stage}
                        </Badge>
                      </TableCell>
                      <TableCell>{deal.probability}%</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(deal.value)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(deal.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
