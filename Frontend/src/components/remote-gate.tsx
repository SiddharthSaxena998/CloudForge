import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useRemote, type Resource } from "@/lib/remote";

/** Inline error banner used for failed server requests. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingSpinner label="Loading from server" />
    </div>
  );
}

/**
 * Fetches the given resources from the server when the page opens.
 * Shows a loading state first, then an error banner with Retry on failure.
 *
 * - Without `title`: use inside a PageShell; on error the banner is shown
 *   above the children (which render their own empty states).
 * - With `title`: use outside a PageShell (detail pages); while loading or
 *   on error it renders its own PageShell with that title.
 */
export function RemoteGate({
  resources,
  title,
  children,
}: {
  resources: Resource[];
  title?: string | undefined;
  children: ReactNode;
}) {
  const { loading, error, retry } = useRemote(resources);

  if (title) {
    if (loading) return <PageShell title={title}><Loading /></PageShell>;
    if (error) return <PageShell title={title}><ErrorBanner message={error} onRetry={retry} /></PageShell>;
    return <>{children}</>;
  }
  if (loading) return <Loading />;
  return (
    <>
      {error && <ErrorBanner message={error} onRetry={retry} />}
      {children}
    </>
  );
}