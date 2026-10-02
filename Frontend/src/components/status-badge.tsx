import { cn } from "@/lib/utils";
import type { DeploymentStatus } from "@/lib/mock-data";

const styles: Record<DeploymentStatus, string> = {
  running: "bg-success text-success-foreground",
  building: "bg-warning text-warning-foreground",
  failed: "bg-destructive text-destructive-foreground",
  stopped: "bg-neutral-status text-neutral-status-foreground",
};

const labels: Record<DeploymentStatus, string> = {
  running: "Running",
  building: "Building",
  failed: "Failed",
  stopped: "Stopped",
};

export function StatusBadge({
  status,
  className,
}: {
  status: DeploymentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium leading-5",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
