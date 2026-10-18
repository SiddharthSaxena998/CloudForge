import { useEffect, useState, useSyncExternalStore } from "react";
import { getSocket } from "./socket";
import { dataStore, type LogLevel, type LogLine } from "./store";
import type { DeploymentStatus } from "./types";
import { refetch } from "./remote";

/* ------------------------------------------------------------------ */
/* Connection state                                                    */
/* ------------------------------------------------------------------ */

/** true while the Socket.IO connection to the backend is up. */
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      setConnected(false);
      return undefined;
    }
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    setConnected(socket.connected);
    socket.on("connect", on);
    socket.on("disconnect", off);
    socket.on("connect_error", off);
    return () => {
      socket.off("connect", on);
      socket.off("disconnect", off);
      socket.off("connect_error", off);
    };
  }, []);

  return connected;
}

/* ------------------------------------------------------------------ */
/* Live container metrics                                              */
/* ------------------------------------------------------------------ */

export interface MetricPoint {
  t: number; // epoch ms
  cpu: number; // %
  mem: number; // MB
}

const HISTORY_LIMIT = 60; // ~3 minutes at one sample every 3 s
let history: Record<string, MetricPoint[]> = {};
const historyListeners = new Set<() => void>();

const getHistory = () => history;
const subscribeHistory = (l: () => void) => {
  historyListeners.add(l);
  return () => historyListeners.delete(l);
};

function pushPoint(containerId: string, point: MetricPoint) {
  const list = [...(history[containerId] ?? []), point].slice(-HISTORY_LIMIT);
  history = { ...history, [containerId]: list }; // new object so subscribers re-render
  historyListeners.forEach((l) => l());
}

/** Rolling CPU/memory samples collected from the live socket stream. */
export function useMetricHistory(containerId: string | undefined): MetricPoint[] {
  const all = useSyncExternalStore(subscribeHistory, getHistory, getHistory);
  return containerId ? (all[containerId] ?? []) : [];
}

interface StatsPayload {
  containerId: string;
  cpuUsagePercent?: number;
  memoryUsageMB?: number;
  memoryLimitMB?: number | null;
  status?: string;
  /** sent once the public link of a (re)started app is ready */
  publicUrl?: string;
}

const KNOWN_STATUS: DeploymentStatus[] = ["running", "building", "failed", "stopped"];

/**
 * Subscribes to live CPU/memory updates of the signed-in user's containers and
 * writes them into the shared store (so existing tables/bars update by themselves).
 * Falls back to polling the REST API while the socket is down.
 */
export function useLiveContainers(): void {
  useEffect(() => {
    const socket = getSocket();

    const onStats = (p: StatsPayload) => {
      const cpu = Number(p.cpuUsagePercent) || 0;
      const mem = Number(p.memoryUsageMB) || 0;

      dataStore.hydrate((s) => ({
        containers: s.containers.map((c) =>
          c.id !== p.containerId
            ? c
            : {
                ...c,
                cpu,
                memoryMb: mem,
                memoryLimitMb: p.memoryLimitMB ?? c.memoryLimitMb,
                publicUrl: typeof p.publicUrl === "string" ? p.publicUrl : c.publicUrl,
                status: KNOWN_STATUS.includes(p.status as DeploymentStatus)
                  ? (p.status as DeploymentStatus)
                  : c.status,
              },
        ),
      }));

      if (p.status === "running" || p.status === undefined) {
        pushPoint(p.containerId, { t: Date.now(), cpu, mem });
      }
    };

    const join = () => socket?.emit("join-containers");

    if (socket) {
      socket.on("container-stats-update", onStats);
      socket.on("connect", join); // runs on first connect and every reconnect
      if (socket.connected) join();
    }

    // Safety net: if the socket never connects, keep the page fresh by polling.
    const poll = window.setInterval(() => {
      if (!socket?.connected) void refetch("containers");
    }, 8000);

    return () => {
      window.clearInterval(poll);
      if (socket) {
        socket.off("container-stats-update", onStats);
        socket.off("connect", join);
      }
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/* Live deployment logs                                                */
/* ------------------------------------------------------------------ */

interface LogPayload {
  deploymentId: string;
  id: string;
  time: string;
  level: LogLevel;
  text: string;
}
interface StatusPayload {
  deploymentId: string;
  status: string;
}

/**
 * Streams build/run logs of one deployment into the store while the page is open.
 * Order of events matters: join the room first, then reload history, so no line is lost
 * between "history loaded" and "listening" (the store merges both by line id).
 */
export function useLiveLogs(deploymentId: string): void {
  useEffect(() => {
    const socket = getSocket();

    const onLog = (p: LogPayload) => {
      if (p.deploymentId !== deploymentId) return;
      const line: LogLine = { id: p.id, time: p.time, level: p.level, text: p.text };
      dataStore.hydrate((s) => {
        const current = s.logs[deploymentId] ?? [];
        if (line.id && current.some((l) => l.id === line.id)) return {};
        return { logs: { ...s.logs, [deploymentId]: [...current, line] } };
      });
    };

    const onStatus = (p: StatusPayload) => {
      if (p.deploymentId !== deploymentId) return;
      if (!KNOWN_STATUS.includes(p.status as DeploymentStatus)) return;
      dataStore.hydrate((s) => ({
        deployments: s.deployments.map((d) =>
          d.id === deploymentId ? { ...d, status: p.status as DeploymentStatus } : d,
        ),
      }));
      // finished: pick up ports / public link etc.
      if (p.status === "running" || p.status === "failed") {
        void refetch("deployments", "containers", `logs:${deploymentId}`);
      }
    };

    const join = () => {
      socket?.emit("join-deployment", deploymentId, () => {
        void refetch(`logs:${deploymentId}`); // fill the gap before the join
      });
    };

    if (socket) {
      socket.on("deployment-log", onLog);
      socket.on("deployment-status", onStatus);
      socket.on("connect", join);
      if (socket.connected) join();
    }

    // Safety net: poll logs while the socket is down and the deployment is still building.
    const poll = window.setInterval(() => {
      const status = dataStore.get().deployments.find((d) => d.id === deploymentId)?.status;
      if (!socket?.connected && status === "building") {
        void refetch(`logs:${deploymentId}`, "deployments");
      }
    }, 3000);

    return () => {
      window.clearInterval(poll);
      if (socket) {
        socket.off("deployment-log", onLog);
        socket.off("deployment-status", onStatus);
        socket.off("connect", join);
        socket.emit("leave-deployment", deploymentId);
      }
    };
  }, [deploymentId]);
}
