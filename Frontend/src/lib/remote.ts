
import { useCallback, useEffect, useState } from "react";
import { apiClient, apiErrorMessage } from "./api-client";
import {
  dataStore,
  type EnvVar,
  type LogLine,
  type ProjectFile,
} from "./store";
import type { DeploymentStatus } from "./types";

/** MongoDB documents use _id; frontend records use id. */
function withId<T>(item: unknown): T {
  const o = (item ?? {}) as Record<string, unknown>;

  return {
    ...o,
    id: (o["id"] ?? o["_id"]) as string,
  } as T;
}

/** Accept arrays or wrappers such as { projects: [...] } / { data: [...] }. */
function list<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) {
    return data.map((item) => withId<T>(item));
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const d = data as Record<string, unknown>;
  const arr = d[key] ?? d["data"];

  if (!Array.isArray(arr)) {
    return [];
  }

  return arr.map((item) => withId<T>(item));
}

function rawList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const d = data as Record<string, unknown>;
  const arr = d[key] ?? d["data"];

  return Array.isArray(arr) ? (arr as T[]) : [];
}

export type Resource =
  | "projects"
  | "deployments"
  | "containers"
  | "notifications"
  | "users"
  | `env:${string}`
  | `files:${string}`
  | `logs:${string}`;

type ApiContainer = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toNumber(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

/** Ensure the API status matches the frontend DeploymentStatus type. */

function normalizeStatus(value: unknown): DeploymentStatus {
  const allowed: DeploymentStatus[] = [
    "building",
    "running",
    "failed",
    "stopped",
  ];

  if (
    typeof value === "string" &&
    allowed.includes(value as DeploymentStatus)
  ) {
    return value as DeploymentStatus;
  }

  return "stopped";
}


/** Convert backend container fields to the frontend Container shape. */
function mapContainer(value: ApiContainer) {
  const project = asRecord(value["project"]);

  const hostPort = toNumber(value["hostPort"]);
  const apiUrl =
    typeof value["url"] === "string" ? value["url"] : "";

  const memoryLimitValue =
    value["memoryLimitMb"] ?? value["memoryLimitMB"];

  const memoryLimitMb =
    memoryLimitValue == null
      ? null
      : toNumber(memoryLimitValue);

  return {
    ...value,
    id: String(value["id"] ?? value["_id"] ?? ""),
    name: String(value["name"] ?? "Unnamed container"),
    projectId: String(
      value["projectId"] ??
        project["id"] ??
        project["_id"] ??
        project["projectId"] ??
        ""
    ),
    status: normalizeStatus(value["status"]),
    cpu: toNumber(
      value["cpu"] ?? value["cpuUsagePercent"]
    ),
    memoryMb: toNumber(
      value["memoryMb"] ?? value["memoryUsageMB"]
    ),
    memoryLimitMb,
    url: apiUrl || (hostPort ? `http://localhost:${hostPort}` : ""),
  };
}

export async function loadResource(r: Resource): Promise<void> {
  const [kind, id = ""] = r.split(":");

  switch (kind) {
    case "projects": {
      const { data } = await apiClient.get("/projects");

      dataStore.hydrate(() => ({
        projects: list(data, "projects"),
      }));
      return;
    }

    case "deployments": {
      const { data } = await apiClient.get("/deployments");

      dataStore.hydrate(() => ({
        deployments: list(data, "deployments"),
      }));
      return;
    }

    case "containers": {
      const { data } = await apiClient.get("/containers");
      const items = list<ApiContainer>(data, "containers");
      const containers = items.map(mapContainer);

      dataStore.hydrate(() => ({ containers }));
      return;
    }

    case "notifications": {
      const { data } = await apiClient.get("/notifications");

      dataStore.hydrate(() => ({
        notifications: list(data, "notifications"),
      }));
      return;
    }

    case "users": {
      const { data } = await apiClient.get("/admin/users");

      dataStore.hydrate(() => ({
        users: list(data, "users"),
      }));
      return;
    }

    case "env": {
      const { data } = await apiClient.get(`/projects/${id}/env`);
      const vars = rawList<EnvVar>(data, "vars");

      dataStore.hydrate((s) => ({
        envVars: { ...s.envVars, [id]: vars },
      }));
      return;
    }

    case "files": {
      const { data } = await apiClient.get(`/projects/${id}/files`);
      const files = rawList<ProjectFile>(data, "files");

      dataStore.hydrate((s) => ({
        files: { ...s.files, [id]: files },
      }));
      return;
    }

    case "logs": {
      const { data } = await apiClient.get(`/deployments/${id}/logs`);
      const logs = rawList<LogLine>(data, "logs");

      dataStore.hydrate((s) => ({
        logs: { ...s.logs, [id]: logs },
      }));
      return;
    }
  }
}

/** Refetch resources after a write in real-API mode. */
export async function refetch(...resources: Resource[]): Promise<void> {
  await Promise.all(resources.map(loadResource));
}

export function useRemote(resources: Resource[]) {
  const key = resources.join("|");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!key) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await Promise.all(
        (key.split("|") as Resource[]).map(loadResource)
      );
    } catch (e: unknown) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void run();
  }, [run]);

  return { loading, error, retry: run };
}
