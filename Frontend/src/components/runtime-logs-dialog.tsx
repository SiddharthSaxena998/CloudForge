import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useContainerLogs, type RuntimeLogStatus } from "@/lib/container-logs";

const STATUS_LABEL: Record<RuntimeLogStatus, string> = {
  connecting: "Connecting…",
  live: "Live — streaming",
  ended: "Container stopped",
  polling: "Refreshing every 3 s",
  error: "Offline",
};

/** Time of day (HH:MM:SS, local) from an ISO timestamp. */
function clock(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour12: false });
}

/** Shows what the deployed app prints (console.log / errors) so users can debug it themselves. */
export function RuntimeLogsDialog({
  containerId,
  containerName,
  onClose,
}: {
  containerId: string | null;
  containerName: string;
  onClose: () => void;
}) {
  const { lines, status, message, clear } = useContainerLogs(containerId);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  // keep the newest line in view, unless the user scrolled up to read something
  useEffect(() => {
    const box = boxRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <Dialog open={containerId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Logs — {containerName}</DialogTitle>
          <DialogDescription>
            {STATUS_LABEL[status]}
            {message ? ` · ${message}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={boxRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="h-[55vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-5"
        >
          {lines.length === 0 && (
            <p className="text-muted-foreground">
              {status === "connecting" ? "Loading…" : "No output yet. Anything your app prints shows up here."}
            </p>
          )}
          {lines.map((line, i) => (
            <div
              key={`${line.ts}-${i}`}
              className={line.stream === "stderr" ? "whitespace-pre-wrap break-all text-destructive" : "whitespace-pre-wrap break-all"}
            >
              <span className="mr-2 select-none text-muted-foreground">{clock(line.ts)}</span>
              {line.text}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={clear}>
            Clear
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
