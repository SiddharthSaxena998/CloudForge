import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, PageShell } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/api";
import type { DeploymentStatus } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/deployments")({
  head: () => ({
    meta: [
      { title: "Deployments — CloudForge" },
      { name: "description", content: "Deployment history and build status across CloudForge projects." },
      { property: "og:title", content: "Deployments — CloudForge" },
      { property: "og:description", content: "Deployment history and build status across CloudForge projects." },
    ],
  }),
  component: DeploymentsPage,
});

const filters: { value: DeploymentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "building", label: "Building" },
  { value: "failed", label: "Failed" },
  { value: "stopped", label: "Stopped" },
];

function DeploymentsPage() {
  const deployments = useStore((s) => s.deployments);
  const projects = useStore((s) => s.projects);
  const [filter, setFilter] = useState<DeploymentStatus | "all">("all");

  const rows = deployments
    .filter((d) => filter === "all" || d.status === filter)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <PageShell
      title="Deployments"
      description="Build and release history across all projects"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-sm transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No deployments"
          message="No deployments match the selected status."
        />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Timestamp</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Commit</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Logs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const project = projects.find((p) => p.id === d.projectId);
                const sourceLabel = d.source.endsWith(".zip")
                  ? "Uploaded archive"
                  : `${project?.repo ?? "repository"} (${d.source})`;
                return (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: d.projectId }}
                        className="font-medium text-primary hover:underline"
                      >
                        {project?.name ?? d.projectId}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {formatDate(d.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="max-w-64 truncate px-4 py-2.5 text-muted-foreground">
                      {sourceLabel}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {d.commit}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to="/logs/$deploymentId"
                        params={{ deploymentId: d.id }}
                        className="text-primary hover:underline"
                      >
                        View Logs
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}