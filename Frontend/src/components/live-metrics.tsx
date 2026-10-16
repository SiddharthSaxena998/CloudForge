import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMetricHistory, useSocketConnected } from "@/lib/live";
import type { Container } from "@/lib/store";

/**
 * Live CPU / memory history of one container. Points arrive every few seconds over
 * the WebSocket; the chart keeps roughly the last three minutes.
 */

function MiniChart({
  title,
  unit,
  data,
  dataKey,
  max,
}: {
  title: string;
  unit: string;
  data: { label: string; cpu: number; mem: number }[];
  dataKey: "cpu" | "mem";
  max?: number | undefined;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="h-36 text-primary">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={32} stroke="currentColor" strokeOpacity={0.4} />
            <YAxis
              tick={{ fontSize: 10 }}
              domain={[0, max ?? ("auto" as const)]}
              allowDecimals={false}
              stroke="currentColor"
              strokeOpacity={0.4}
            />
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(1)} ${unit}`, title] as [string, string]}
              contentStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LiveMetrics({ containers }: { containers: Container[] }) {
  const running = containers.filter((c) => c.status === "running");
  const [selectedId, setSelectedId] = useState<string>("");
  const live = useSocketConnected();

  // Keep a valid selection: default to the first running container
  useEffect(() => {
    if (running.length === 0) {
      if (selectedId) setSelectedId("");
    } else if (!running.some((c) => c.id === selectedId)) {
      const first = running[0];
      if (first) setSelectedId(first.id);
    }
  }, [running, selectedId]);

  const selected = running.find((c) => c.id === selectedId);
  const history = useMetricHistory(selected?.id);

  const data = history.map((p) => ({
    label: new Date(p.t).toLocaleTimeString([], { hour12: false }),
    cpu: p.cpu,
    mem: p.mem,
  }));

  const memMax =
    selected?.memoryLimitMb && selected.memoryLimitMb > 0 ? selected.memoryLimitMb : undefined;

  return (
    <div className="mb-4 rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Live metrics</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-success" : "bg-neutral-status"}`} />
          {live ? "Streaming over WebSocket" : "Offline — refreshing every few seconds"}
        </span>

        {running.length > 0 && (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Container to chart"
            className="ml-auto rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
          >
            {running.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!selected ? (
        <p className="text-sm text-muted-foreground">No running containers. Deploy a project to see live CPU and memory here.</p>
      ) : data.length < 2 ? (
        <p className="text-sm text-muted-foreground">Waiting for live data from {selected.name}…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <MiniChart title="CPU usage" unit="%" data={data} dataKey="cpu" max={100} />
          <MiniChart title="Memory usage" unit="MB" data={data} dataKey="mem" max={memMax} />
        </div>
      )}
    </div>
  );
}
