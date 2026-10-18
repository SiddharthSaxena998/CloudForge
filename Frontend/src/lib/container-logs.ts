import { useEffect, useState } from "react";
import { apiClient } from "./api-client";
import { getSocket } from "./socket";

/** One line of an app's output (stdout / stderr), as sent by the backend. */
export interface RuntimeLogLine {
  ts: string;
  stream: "stdout" | "stderr";
  text: string;
}

export type RuntimeLogStatus = "connecting" | "live" | "ended" | "polling" | "error";

const MAX_LINES = 2000;
const POLL_MS = 3000;

interface JoinAck {
  ok: boolean;
  message?: string;
}

/**
 * Live stdout/stderr of one container (Container.id from the containers list).
 * Uses the Socket.IO connection; if that is not available it falls back to polling the REST
 * endpoint every few seconds. Pass null to stay idle (dialog closed).
 */
export function useContainerLogs(containerId: string | null) {
  const [lines, setLines] = useState<RuntimeLogLine[]>([]);
  const [status, setStatus] = useState<RuntimeLogStatus>("connecting");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!containerId) return undefined;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const socket = getSocket();

    setLines([]);
    setStatus("connecting");
    setMessage("");

    const poll = async () => {
      try {
        const { data } = await apiClient.get<{ lines?: RuntimeLogLine[]; message?: string }>(
          `/containers/${containerId}/logs`,
          { params: { tail: 300 } },
        );
        if (cancelled) return;
        setLines((data.lines ?? []).slice(-MAX_LINES));
        setMessage(data.message ?? "");
        setStatus("polling");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not load logs.");
        }
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      void poll();
      pollTimer = setInterval(() => void poll(), POLL_MS);
    };

    if (!socket) {
      startPolling();
      return () => {
        cancelled = true;
        if (pollTimer) clearInterval(pollTimer);
      };
    }

    const onLog = (payload: { containerId: string; lines: RuntimeLogLine[] }) => {
      if (payload.containerId !== containerId) return;
      setLines((prev) => [...prev, ...payload.lines].slice(-MAX_LINES));
    };
    const onEnd = (payload: { containerId: string }) => {
      if (payload.containerId === containerId) setStatus("ended");
    };

    // (re)join on every connect: after a reconnect the server sends the last lines again
    const join = () => {
      setLines([]);
      setStatus("connecting");
      socket.emit("join-container-logs", containerId, (ack: JoinAck | undefined) => {
        if (cancelled) return;
        if (ack?.ok) {
          setStatus("live");
          setMessage("");
        } else {
          setMessage(ack?.message ?? "Live logs are not available.");
          startPolling();
        }
      });
    };

    socket.on("container-log", onLog);
    socket.on("container-log-end", onEnd);
    socket.on("connect", join);
    socket.on("connect_error", startPolling);
    if (socket.connected) join();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      socket.off("container-log", onLog);
      socket.off("container-log-end", onEnd);
      socket.off("connect", join);
      socket.off("connect_error", startPolling);
      socket.emit("leave-container-logs", containerId);
    };
  }, [containerId]);

  return { lines, status, message, clear: () => setLines([]) };
}
