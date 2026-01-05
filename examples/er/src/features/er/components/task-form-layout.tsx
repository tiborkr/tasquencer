import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TaskMetadata } from "@/types/er";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/card";
import { User, AlertCircle, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/components/alert";

interface TaskFormLayoutProps {
  patient: Doc<"erPatients">;
  task: TaskMetadata;
  icon: ReactNode;
  title: string;
  description: string;
  formTitle?: string;
  formDescription?: string;
  children: (isStarted: boolean) => ReactNode;
  onSubmit: () => Promise<void>;
  onClaim?: () => Promise<void>;
  isSubmitting: boolean;
  isClaiming?: boolean;
  canClaim?: boolean;
  errorMessage?: string | null;
  submitButtonText?: string;
  submitButtonVariant?: "default" | "destructive";
  onBack?: () => void;
}

export function TaskFormLayout({
  patient,
  task,
  icon,
  title,
  description,
  formTitle,
  formDescription,
  children,
  onSubmit,
  onClaim,
  isSubmitting,
  isClaiming = false,
  canClaim,
  errorMessage,
  submitButtonText = "Submit",
  submitButtonVariant = "default",
  onBack,
}: TaskFormLayoutProps) {
  const navigate = useNavigate();
  const isStarted = task.status === "claimed";
  const isPending = task.status === "pending";

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate({ to: "/er/queue" });
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="p-6 md:p-8 lg:p-10 max-w-3xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
            {icon}
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>
            <p className="text-base md:text-lg text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* Patient Info Card */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-0.5">
                <CardTitle className="text-lg">{patient.name}</CardTitle>
                <CardDescription className="text-sm">{patient.complaint}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Permission Error Alert */}
        {isPending && canClaim === false && (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              You do not have permission to claim this task. This task is assigned
              to a different group.
            </AlertDescription>
          </Alert>
        )}

        {/* Form Card */}
        <Card className="border-border/50 shadow-sm dark:bg-card/80">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">{formTitle || title}</CardTitle>
            {formDescription && (
              <CardDescription className="text-sm">{formDescription}</CardDescription>
            )}
          </CardHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <CardContent className="space-y-5 pb-6">
              {errorMessage && (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="ml-2">{errorMessage}</AlertDescription>
                </Alert>
              )}
              {children(isStarted)}
            </CardContent>
            <CardFooter className="flex flex-col-reverse gap-3 px-6 py-4 sm:flex-row sm:justify-between">
              <Button
                variant="ghost"
                onClick={handleBack}
                type="button"
                className="w-full sm:w-auto gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Queue
              </Button>
              <div className="flex w-full sm:w-auto gap-2">
                {isPending && onClaim && (
                  <Button
                    type="button"
                    onClick={() => void onClaim()}
                    disabled={isClaiming || canClaim !== true}
                    className="flex-1 sm:flex-none sm:min-w-[120px]"
                  >
                    {isClaiming ? "Claiming..." : "Claim Task"}
                  </Button>
                )}
                {isStarted && (
                  <Button
                    type="submit"
                    variant={submitButtonVariant}
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-none sm:min-w-[140px]"
                  >
                    {isSubmitting ? "Submitting..." : submitButtonText}
                  </Button>
                )}
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
