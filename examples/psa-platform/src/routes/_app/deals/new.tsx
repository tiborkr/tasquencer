import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { Label } from '@repo/ui/components/label'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@repo/ui/components/card'
import { Briefcase, ArrowLeft } from 'lucide-react'

const schema = z.object({
  dealName: z.string().min(1, 'Deal name is required'),
  clientName: z.string().min(1, 'Client name is required'),
  estimatedValue: z.number().min(0, 'Value must be non-negative'),
})

type FormValues = z.infer<typeof schema>

export const Route = createFileRoute('/_app/deals/new')({
  component: NewDeal,
  loader: () => ({ crumb: 'New Deal' }),
})

function NewDeal() {
  const navigate = useNavigate()
  const initializeDeal = useMutation(
    api.workflows.dealToDelivery.api.deals.initializeDealToDelivery
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      dealName: '',
      clientName: '',
      estimatedValue: 0,
    },
  })

  const onSubmit = async (values: FormValues) => {
    // Convert dollars to cents for storage
    const valueInCents = Math.round(values.estimatedValue * 100)

    await initializeDeal({
      dealName: values.dealName,
      clientName: values.clientName,
      estimatedValue: valueInCents,
    })

    // Navigate to audit to see the generated trace
    navigate({ to: '/audit' })
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
            <Briefcase className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Create New Deal
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Start a new deal workflow in your sales pipeline.
            </p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold">
                Deal Information
              </CardTitle>
              <CardDescription>
                Enter the basic deal information to start the sales workflow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pb-6">
              <div className="space-y-2">
                <Label htmlFor="dealName" className="text-sm font-medium">
                  Deal Name
                </Label>
                <Input
                  id="dealName"
                  placeholder="Enterprise Software Implementation"
                  {...form.register('dealName')}
                  className="h-11"
                />
                {form.formState.errors.dealName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.dealName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientName" className="text-sm font-medium">
                  Client Name
                </Label>
                <Input
                  id="clientName"
                  placeholder="Acme Corporation"
                  {...form.register('clientName')}
                  className="h-11"
                />
                {form.formState.errors.clientName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.clientName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedValue" className="text-sm font-medium">
                  Estimated Value ($)
                </Label>
                <Input
                  id="estimatedValue"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="100000"
                  {...form.register('estimatedValue', { valueAsNumber: true })}
                  className="h-11"
                />
                {form.formState.errors.estimatedValue && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.estimatedValue.message}
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col-reverse gap-3 px-6 py-4 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate({ to: '/deals' })}
                disabled={form.formState.isSubmitting}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Deals
              </Button>
              <Button
                type="submit"
                size="lg"
                className="gap-2"
                disabled={form.formState.isSubmitting}
              >
                <Briefcase className="h-4 w-4" />
                {form.formState.isSubmitting ? 'Creating...' : 'Create Deal'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  )
}
