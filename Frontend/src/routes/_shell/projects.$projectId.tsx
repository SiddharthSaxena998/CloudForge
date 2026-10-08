import { RemoteGate } from "@/components/remote-gate";
import { attempt } from "@/lib/attempt";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileCode2, FileText, Folder, Plus, Trash2 } from "lucide-react";
import { EmptyState, PageShell } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, formatDate } from "@/lib/api";
import { useStore, type EnvVar, type ProjectRecord } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — CloudForge" },
      { name: "description", content: "Project overview, environment variables, source files and deployment history." },
      { property: "og:title", content: "Project — CloudForge" },
      { property: "og:description", content: "Project overview, environment variables, source files and deployment history." },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  return (
    <RemoteGate title="Project" resources={["projects", "deployments", `env:${projectId}`, `files:${projectId}`]}>
      <ProjectDetail projectId={projectId} />
    </RemoteGate>
  );
}

function ProjectDetail({ projectId }: { projectId: string }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const [deploying, setDeploying] = useState(false);

  if (!project) {
    return (
      <PageShell title="Project not found">
        <EmptyState
          title="Project not found"
          message={`No project exists with ID ${projectId}.`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to Dashboard</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={project.name}
      description={project.description}
      action={
        <Button
          size="sm"
          disabled={deploying}
          onClick={async () => {
            setDeploying(true);
            await attempt(api.deployProject(project.id));
            setDeploying(false);
          }}
        >
          {deploying && <LoadingSpinner />}
          Deploy Now
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-border bg-surface px-2 py-0.5 text-xs font-medium">
          {project.framework}
        </span>
        <StatusBadge status={project.status} />
        <span className="font-mono text-xs text-muted-foreground">{project.id}</span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="env">Environment Variables</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="history">Deployment History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <Overview project={project} />
        </TabsContent>
        <TabsContent value="env" className="mt-4">
          <EnvEditor projectId={project.id} />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <FilesPanel projectId={project.id} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <History projectId={project.id} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Overview({ project }: { project: ProjectRecord }) {
  const rows: [string, string, boolean?][] = [
    ["Source type", project.sourceType === "github" ? "GitHub repository" : "Uploaded archive"],
    project.sourceType === "github"
      ? ["Repository", project.repo, true]
      : ["Archive", project.archiveName, true],
    ["Branch", project.branch || "—", true],
    ["Framework", project.framework],
    ["Region", project.region, true],
    ["Domain", project.domain, true],
    ["Created", formatDate(project.createdAt)],
    ["Last deployed", formatDate(project.lastDeployedAt)],
  ];
  return (
    <dl className="grid overflow-hidden rounded-md border border-border bg-card sm:grid-cols-2">
      {rows.map(([label, value, mono]) => (
        <div key={label} className="border-b border-border px-4 py-3 sm:[&:nth-last-child(-n+2)]:border-b-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className={cn("mt-1 truncate text-sm", mono && "font-mono")}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EnvEditor({ projectId }: { projectId: string }) {
  const saved = useStore((s) => s.envVars[projectId] ?? []);
  const [rows, setRows] = useState<EnvVar[]>(saved);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = (i: number, patch: Partial<EnvVar>) => {
    setMessage(null);
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  async function save() {
    const clean = rows.filter((r) => r.key.trim());
    setSaving(true);
    const res = await attempt(api.saveEnvVars(projectId, clean));
    setSaving(false);
    if (!res.ok) return;
    setRows(clean);
    setMessage(`Saved ${clean.length} variable${clean.length === 1 ? "" : "s"}. Changes apply on the next deploy.`);
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface hover:bg-surface">
            <TableHead className="w-[40%]">KEY</TableHead>
            <TableHead>VALUE</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell>
                <Input
                  aria-label={`Key ${i + 1}`}
                  value={row.key}
                  onChange={(e) => update(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                  placeholder="KEY_NAME"
                  className="font-mono text-xs"
                />
              </TableCell>
              <TableCell>
                <Input
                  aria-label={`Value ${i + 1}`}
                  value={row.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder="value"
                  className="font-mono text-xs"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${row.key || "row"}`}
                  onClick={() => {
                    setMessage(null);
                    setRows((r) => r.filter((_, idx) => idx !== i));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                No environment variables defined.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((r) => [...r, { key: "", value: "" }])}
        >
          <Plus className="h-4 w-4" /> Add Variable
        </Button>
        {message && <p className="text-xs text-success">{message}</p>}
        <Button size="sm" className="ml-auto" onClick={save} disabled={saving}>
          {saving && <LoadingSpinner />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function FilesPanel({ projectId }: { projectId: string }) {
  const files = useStore((s) => s.files[projectId] ?? []);
  const [selected, setSelected] = useState(files[0]?.path ?? "");
  const current = files.find((f) => f.path === selected);
  const [draft, setDraft] = useState(current?.content ?? "");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(current?.content ?? "");
    setStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function createFile() {
    const path = newName.trim();
    if (!path || files.some((f) => f.path === path)) {
      setStatus(path ? "A file with that name already exists." : "Enter a file name.");
      return;
    }
    const res = await attempt(api.saveFile(projectId, path, ""));
    if (!res.ok) return;
    setNewName("");
    setSelected(path);
  }

  async function save() {
    setSaving(true);
    const res = await attempt(api.saveFile(projectId, selected, draft));
    setSaving(false);
    if (!res.ok) return;
    setStatus(`Saved ${selected}`);
  }

  const folders = Array.from(new Set(files.map((f) => f.path.split("/").slice(0, -1).join("/")).filter(Boolean)));
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div className="grid overflow-hidden rounded-md border border-border bg-card md:grid-cols-[240px_1fr]">
      <div className="border-b border-border bg-surface md:border-b-0 md:border-r">
        <div className="flex gap-2 border-b border-border p-3">
          <Input
            aria-label="New file name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFile()}
            placeholder="src/new-file.js"
            className="h-8 bg-card font-mono text-xs"
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={createFile}>
            <Plus className="h-4 w-4" /> New File
          </Button>
        </div>
        <ul className="p-2 text-sm">
          {folders.map((f) => (
            <li key={f} className="flex items-center gap-2 px-2 py-1 text-muted-foreground">
              <Folder className="h-4 w-4" />
              <span className="font-mono text-xs">{f}/</span>
            </li>
          ))}
          {sorted.map((f) => {
            const depth = f.path.split("/").length - 1;
            const Icon = /\.(js|ts|tsx|json|go|py)$/.test(f.path) ? FileCode2 : FileText;
            return (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => setSelected(f.path)}
                  style={{ paddingLeft: 8 + depth * 16 }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm py-1 pr-2 text-left transition-colors",
                    f.path === selected
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate font-mono text-xs">{f.path.split("/").pop()}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-mono text-xs text-muted-foreground">{selected || "No file selected"}</span>
          <div className="flex items-center gap-3">
            {status && <span className="text-xs text-muted-foreground">{status}</span>}
            <Button size="sm" onClick={save} disabled={!current || saving}>
              {saving && <LoadingSpinner />}
              Save File
            </Button>
          </div>
        </div>
        <textarea
          aria-label="File contents"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          disabled={!current}
          className="min-h-[380px] flex-1 resize-y bg-card p-4 font-mono text-xs leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}

function History({ projectId }: { projectId: string }) {
  const deployments = useStore((s) => s.deployments.filter((d) => d.projectId === projectId));
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  return (
    <div className="rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface hover:bg-surface">
            <TableHead>Timestamp</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Deployment ID</TableHead>
            <TableHead className="text-right">Logs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deployments.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="text-sm">{formatDate(d.createdAt)}</TableCell>
              <TableCell>
                <StatusBadge status={d.status} />
              </TableCell>
              <TableCell className="font-mono text-xs">
                {project?.sourceType === "github" ? `${d.source} @ ${d.commit}` : d.source}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{d.id}</TableCell>
              <TableCell className="text-right">
                <Link
                  to="/logs/$deploymentId"
                  params={{ deploymentId: d.id }}
                  className="text-sm text-primary hover:underline"
                >
                  View Logs
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}