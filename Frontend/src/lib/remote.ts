import { useCallback, useEffect, useState } from "react";
import { apiClient, apiErrorMessage } from "./api-client";
import { dataStore, type EnvVar, type LogLine, type ProjectFile } from "./store";

/**
 * Read layer: pages call useRemote() with the resources they need; data is
 * fetched with GET requests and written into the shared store.
 */

/** MongoDB documents use `_id`; screens expect `id`. */
function withId<T>(item: unknown): T {
  const o = (item ?? {}) as Record<string, unknown>;
  return { ...o, id: (o['id'] ?? o['_id']) as string } as T;
}
/** Accept either a bare array or a wrapper like { projects: [...] } / { data: [...] }. */
function list<T>(data: unknown, key: string): T[] {
  const d = data as Record<string, unknown> | unknown[];
  const arr = Array.isArray(d) ? d : ((d?.[key] ?? d?.['data'] ?? []) as unknown[]);
  return arr.map((x) => withId<T>(x));
}
function rawList<T>(data: unknown, key: string): T[] {
  const d = data as Record<string, unknown> | unknown[];
  return (Array.isArray(d) ? d : ((d?.[key] ?? d?.['data'] ?? []) as unknown[])) as T[];
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

export async function loadResource(r: Resource): Promise<void> {
  const [kind, id = ""] = r.split(":") as [string, string?];
  switch (kind) {
    case "projects": {
      const { data } = await apiClient.get("/projects");
      dataStore.hydrate(() => ({ projects: list(data, "projects") }));
      return;
    }
    case "deployments": {
      const { data } = await apiClient.get("/deployments");
      dataStore.hydrate(() => ({ deployments: list(data, "deployments") }));
      return;
    }
    case "containers": {
      const { data } = await apiClient.get("/containers");
      dataStore.hydrate(() => ({ containers: list(data, "containers") }));
      return;
    }
    case "notifications": {
      const { data } = await apiClient.get("/notifications");
      dataStore.hydrate(() => ({ notifications: list(data, "notifications") }));
      return;
    }
    case "users": {
      const { data } = await apiClient.get("/admin/users");
      dataStore.hydrate(() => ({ users: list(data, "users") }));
      return;
    }
    case "env": {
      const { data } = await apiClient.get(`/projects/${id}/env`);
      const vars = rawList<EnvVar>(data, "vars");
      dataStore.hydrate((s) => ({ envVars: { ...s.envVars, [id]: vars } }));
      return;
    }
    case "files": {
      const { data } = await apiClient.get(`/projects/${id}/files`);
      const files = rawList<ProjectFile>(data, "files");
      dataStore.hydrate((s) => ({ files: { ...s.files, [id]: files } }));
      return;
    }
    case "logs": {
      const { data } = await apiClient.get(`/deployments/${id}/logs`);
      const logs = rawList<LogLine>(data, "logs");
      dataStore.hydrate((s) => ({ logs: { ...s.logs, [id]: logs } }));
      return;
    }
  }
}

/** Refetch several resources after a write (real-API mode only). */
export async function refetch(...resources: Resource[]) {
  await Promise.all(resources.map(loadResource));
}

export function useRemote(resources: Resource[]) {
  const key = resources.join("|");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all((key.split("|") as Resource[]).map(loadResource));
    } catch (e) {
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