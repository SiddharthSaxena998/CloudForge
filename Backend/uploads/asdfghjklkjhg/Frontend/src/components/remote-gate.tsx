import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button";
import { useRemote, type Resource } from "@/lib/remote";

/** Inline error banner used for failed server requests. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div role="alert" className="mb-4 flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Loads the given resources from the real API (no-op in mock mode) and shows
 * a loading state on first load and an error banner with Retry on failure.
 */
export function RemoteGate({ resources, children }: { resources: Resource[]; children: ReactNode }) {
  const { loading, error, retry } = useRemote(resources);
  if (loading && !error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner label="Loading from server" />
      </div>
    );
  }
  return (
    <>
      {error && <ErrorBanner message={error} onRetry={retry} />}
      {children}
    </>
  );
}