
import { RemoteGate } from "@/components/remote-gate";
import { attempt } from "@/lib/attempt";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ExternalLink, Search, Trash2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_shell/containers")({
  head: () => ({
    meta: [
      { title: "Containers — CloudForge" },
      {
        name: "description",
        content:
          "Running containers with CPU and memory usage per CloudForge project.",
      },
      { property: "og:title", content: "Containers — CloudForge" },
      {
        property: "og:description",
        content:
          "Running containers with CPU and memory usage per CloudForge project.",
      },
    ],
  }),
  component: ContainersPage,
});

function Bar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const safeValue = Number(value) || 0;
  const safeMax = Number(max) > 0 ? Number(max) : 100;
  const pct = Math.min(
    100,
    Math.max(0, (safeValue / safeMax) * 100)
  );

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-sm bg-muted">
        <div
          className={
            pct > 65 ? "h-full bg-warning" : "h-full bg-primary"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums">
        {label}
      </span>
    </div>
  );
}

function ContainersPage() {
  const containers = useStore((s) => s.containers);
  const projects = useStore((s) => s.projects);

  const [query, setQuery] = useState("");
  const [stopping, setStopping] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const rows = containers
    .map((c) => ({
      ...c,
      project: projects.find((p) => p.id === c.projectId),
    }))
    .filter(
      (c) =>
        !q ||
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.project?.name ?? "").toLowerCase().includes(q) ||
        String(c.status ?? "").toLowerCase().includes(q)
    );

  return (
    <PageShell
      title="Containers"
      description="Runtime instances across all projects"
    >
      <RemoteGate resources={["containers", "projects"]}>
        <div className="relative mb-3 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, project or status"
            className="bg-card pl-8"
            aria-label="Filter containers"
          />
        </div>

        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                <TableHead>Status</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>Memory</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((c) => {
                const active =
                  c.status === "running" ||
                  c.status === "building";

                const cpu = Number(c.cpu) || 0;
                const memoryMb = Number(c.memoryMb) || 0;
                const memoryLimitMb =
                  c.memoryLimitMb == null
                    ? null
                    : Number(c.memoryLimitMb);

                const hasMemoryLimit =
                  memoryLimitMb !== null &&
                  Number.isFinite(memoryLimitMb) &&
                  memoryLimitMb > 0;

                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>

                    <TableCell>
                      <div className="font-mono text-xs">
                        {c.name}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {c.id}
                      </div>
                    </TableCell>

                    <TableCell>
                      {c.project ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: c.project.id }}
                          className="text-sm text-primary hover:underline"
                        >
                          {c.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell>
                      <Bar
                        value={cpu}
                        max={100}
                        label={`${cpu.toFixed(1)}%`}
                      />
                    </TableCell>

                    <TableCell>
                      <Bar
                        value={memoryMb}
                        max={
                          hasMemoryLimit
                            ? memoryLimitMb!
                            : Math.max(memoryMb, 100)
                        }
                        label={
                          hasMemoryLimit
                            ? `${memoryMb} / ${memoryLimitMb} MB`
                            : `${memoryMb} MB / No limit`
                        }
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          disabled={!active || !c.url}
                        >
                          <a
                            href={c.url || undefined}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open App
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!active || stopping === c.id}
                          onClick={async () => {
                            setStopping(c.id);
                            try {
                              await attempt(api.stopContainer(c.id));
                            } finally {
                              setStopping(null);
                            }
                          }}
                        >
                          {stopping === c.id ? "Stopping" : "Stop"}
                        </Button>

                        {c.status === "stopped" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleting === c.id}
                            onClick={async () => {
                              const confirmed = window.confirm(
                                `Delete stopped container "${c.name}" permanently?`
                              );

                              if (!confirmed) return;

                              setDeleting(c.id);

                              try {
                                const result = await attempt(
                                  api.deleteContainer(c.id)
                                );

                                if (result.ok) window.location.reload();
                              } finally {
                                setDeleting(null);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deleting === c.id ? "Deleting..." : "Delete"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {query
                      ? `No containers match "${query}".`
                      : "No containers yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </RemoteGate>
    </PageShell>
  );
}
