import { apiClient, mockDelay, USE_MOCK_API } from "./api-client";
import { mockStore, type Deployment, type EnvVar, type ProjectRecord, type SourceType } from "./store";
import { refetch } from "./remote";
import type { Role } from "./mock-data";

const idOf = (x: unknown): string => {
  const o = (x ?? {}) as Record<string, unknown>;
  const inner = (o['project'] ?? o['deployment'] ?? o) as Record<string, unknown>;
  return String(inner['id'] ?? inner['_id'] ?? "");
};

/**
 * Mutation endpoints. With USE_MOCK_API false each call hits the Express API
 * and then refetches the affected data; otherwise it updates the mock store.
 * Errors are thrown so screens can show a message (see apiErrorMessage).
 */
export const api = {
  async createProject(input: {
    name: string;
    description: string;
    sourceType: SourceType;
    repo: string;
    branch: string;
    archiveName: string;
  }): Promise<Pick<ProjectRecord, "id">> {
    if (!USE_MOCK_API) {
      const { data } = await apiClient.post("/projects", input);
      await refetch("projects", "deployments", "notifications");
      return { id: idOf(data) };
    }
    await mockDelay();
    return mockStore.createProject(input);
  },
  async deployProject(projectId: string): Promise<Pick<Deployment, "id">> {
    if (!USE_MOCK_API) {
      const { data } = await apiClient.post(`/projects/${projectId}/deploy`);
      await refetch("projects", "deployments", "notifications");
      return { id: idOf(data) };
    }
    await mockDelay();
    return mockStore.deployProject(projectId);
  },
  async saveEnvVars(projectId: string, vars: EnvVar[]) {
    if (!USE_MOCK_API) {
      await apiClient.put(`/projects/${projectId}/env`, { vars });
      await refetch(`env:${projectId}`);
      return;
    }
    await mockDelay(350);
    mockStore.saveEnvVars(projectId, vars);
  },
  async saveFile(projectId: string, path: string, content: string) {
    if (!USE_MOCK_API) {
      await apiClient.put(`/projects/${projectId}/files`, { path, content });
      await refetch(`files:${projectId}`);
      return;
    }
    await mockDelay(300);
    mockStore.saveFile(projectId, path, content);
  },
  async stopContainer(id: string) {
    if (!USE_MOCK_API) {
      await apiClient.post(`/containers/${id}/stop`);
      await refetch("containers");
      return;
    }
    await mockDelay(400);
    mockStore.stopContainer(id);
  },
  async markAllNotificationsRead() {
    if (!USE_MOCK_API) {
      await apiClient.post("/notifications/read-all");
      await refetch("notifications");
      return;
    }
    mockStore.markAllRead();
  },
  async updateUserRole(userId: string, role: Role) {
    if (!USE_MOCK_API) {
      await apiClient.patch(`/admin/users/${userId}`, { role });
      await refetch("users");
      return;
    }
    await mockDelay(350);
    mockStore.updateUserRole(userId, role);
  },
};

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}