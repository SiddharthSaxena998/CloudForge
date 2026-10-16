import { RemoteGate } from "@/components/remote-gate";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { EmptyState, PageShell } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/api";
import { useLiveLogs, useSocketConnected } from "@/lib/live";
import { useStore, type LogLevel } from "@/lib/store";

export const Route = createFileRoute("/_shell/logs/$deploymentId")({
  head: () => ({
    meta: [
      { title: "Deployment Logs — CloudForge" },
      { name: "description", content: "Build and runtime log output for a CloudForge deployment." },
      { property: "og:title", content: "Deployment Logs — CloudForge" },
      { property: "og:description", content: "Build and runtime log output for a CloudForge deployment." },
    ],
  }),
  component: LogsPage,
});

const levelClass: Record<LogLevel, string> = {
  info: "text-terminal-foreground",
  warn: "text-log-warn",
  error: "text-log-error",
  success: "text-log-success",
};

function LogsPage() {
  const { deploymentId } = Route.useParams();
  return (
    <RemoteGate title="Deployment Logs" resources={["projects", "deployments", `logs:${deploymentId}`]}>
      <LogsView deploymentId={deploymentId} />
    </RemoteGate>
  );
}

function LogsView({ deploymentId }: { deploymentId: string }) {
  const deployment = useStore((s) => s.deployments.find((d) => d.id === deploymentId));
  const project = useStore((s) => s.projects.find((p) => p.id === deployment?.projectId));
  const logs = useStore((s) => s.logs[deploymentId] ?? []);
  const [copied, setCopied] = useState(false);
  const socketUp = useSocketConnected();
  const boxRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Live stream: new log lines and status changes arrive over the WebSocket
  useLiveLogs(deploymentId);

  // Follow the newest line, unless the user scrolled up to read something
  useEffect(() => {
    const el = boxRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  if (!deployment) {
    return (
      <PageShell title="Deployment not found">
        <EmptyState title="Deployment not found" message={`No deployment exists with ID ${deploymentId}.`} />
      </PageShell>
    );
  }

  // "Live" = socket is connected; otherwise the page falls back to polling while building
  const connected = socketUp;

  async function copy() {
    const text = logs.map((l) => `[${l.time}] ${l.level.toUpperCase().padEnd(7)} ${l.text}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <PageShell
      title="Deployment Logs"
      description={`${project?.name ?? "Unknown project"} · ${formatDate(deployment.createdAt)}`}
      action={
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="h-4 w-4" />
          {copied ? "Copied" : "Copy Logs"}
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        {project && (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> {project.name}
          </Link>
        )}
        <StatusBadge status={deployment.status} />
        <span className="font-mono text-xs text-muted-foreground">{deployment.id}</span>
        <span className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-success" : "bg-neutral-status"}`} />
          {connected ? (deployment.status === "building" ? "Live — streaming" : "Live") : "Offline (polling)"}
        </span>
      </div>
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="max-h-[70vh] overflow-auto rounded-md border border-border bg-terminal p-4 font-mono text-xs leading-6"
      >
        {logs.length === 0 && <p className="text-terminal-foreground/60">No log output for this deployment yet.</p>}
        {logs.map((l, i) => (
          <div key={l.id ?? i} className="flex gap-3 whitespace-pre">
            <span className="select-none text-terminal-foreground/50">{l.time}</span>
            <span className={levelClass[l.level]}>{l.text}</span>
          </div>
        ))}
      </div>
    </PageShell>
  );
}