import { RemoteGate } from "@/components/remote-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { EmptyState, PageShell } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { api, formatDate } from "@/lib/api";
import { attempt } from "@/lib/attempt";
import { useAuth } from "@/context/auth";

export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: "Dashboard — CloudForge" },
      {
        name: "description",
        content: "Overview of CloudForge projects, running deployments and active containers.",
      },
      { property: "og:title", content: "Dashboard — CloudForge" },
      {
        property: "og:description",
        content: "Overview of CloudForge projects, running deployments and active containers.",
      },
    ],
  }),
  component: DashboardPage,
});

function NewProjectButton({ variant }: { variant?: "outline" }) {
  return (
    <Button size="sm" variant={variant ?? "default"} asChild>
      <Link to="/projects/new">+ New Project</Link>
    </Button>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const projects = useStore((s) => s.projects);
  const containers = useStore((s) => s.containers);
  const deployments = useStore((s) => s.deployments);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);

  const isProjectRunning = (projectId: string) =>
    containers.some(
      (container) =>
        container.projectId === projectId &&
        container.status === "running"
    );

  const getProjectStatus = (project: (typeof projects)[number]) => {
    if (isProjectRunning(project.id)) return "running";

    const hasBuildingDeployment = deployments.some(
      (deployment) =>
        deployment.projectId === project.id &&
        ["building", "pending"].includes(deployment.status)
    );

    if (hasBuildingDeployment) return "building";

    return "stopped";
  };

  const weekAgo = Date.now() - 7 * 86400_000;
  const stats = [
    { label: "Total Projects", value: projects.length },
    { label: "Running Deployments", value: projects.filter((p) => isProjectRunning(p.id)).length },
    { label: "Active Containers", value: containers.filter((c) => c.status === "running").length },
    {
      label: "Deployments This Week",
      value: deployments.filter((d) => Date.parse(d.createdAt) >= weekAgo).length,
    },
  ];

  return (
    <PageShell
      title="Dashboard"
      description={user ? `Signed in as ${user.email}` : undefined}
      action={<NewProjectButton />}
    >
      <RemoteGate resources={["projects", "containers", "deployments"]}>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your Projects</h2>
          <NewProjectButton variant="outline" />
        </div>

        {projects.length === 0 && (
          <EmptyState title="No projects yet" message="Create your first project to deploy it on CloudForge." />
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate font-mono text-sm font-medium">{project.name}</h3>
                <StatusBadge status={getProjectStatus(project)} />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {project.description}
              </p>
              <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Framework</dt>
                  <dd>{project.framework}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Last deployed</dt>
                  <dd className="truncate">{formatDate(project.lastDeployedAt)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  asChild
                >
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                  >
                    View
                  </Link>
                </Button>

                {getProjectStatus(project) === "stopped" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deletingProject === project.id}
                    onClick={async () => {
                      const confirmed = window.confirm(
                        `Permanently delete project "${project.name}" and its associated resources?`
                      );

                      if (!confirmed) return;

                      setDeletingProject(project.id);

                      try {
                        await attempt(api.deleteProject(project.id));
                      } finally {
                        setDeletingProject(null);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingProject === project.id ? "Deleting..." : "Delete"}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      </RemoteGate>
    </PageShell>
  );
}
