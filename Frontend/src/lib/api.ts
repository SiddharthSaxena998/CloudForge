import { apiClient } from "./api-client";
import { type Deployment, type EnvVar, type ProjectRecord, type SourceType } from "./store";
import { refetch } from "./remote";
import type { Role } from "./types";

const idOf = (x: unknown): string => {
  const o = (x ?? {}) as Record<string, unknown>;
  const inner = (o["project"] ?? o["deployment"] ?? o) as Record<string, unknown>;
  return String(inner["id"] ?? inner["_id"] ?? "");
};

/**
 * Mutation endpoints: each call hits the Express API, then refetches the
 * affected data from the server.
 * Errors are thrown so screens can show a message (see apiErrorMessage).
 */
export const api = {
  async createProject(input: {
    name: string;
    description: string;
    sourceType: SourceType;
    repo: string;
    branch: string;
    archive: File | null;
  }): Promise<Pick<ProjectRecord, "id">> {
    // Backend multer (upload.single('archive')) use karta hai, isliye FormData
    const fd = new FormData();
    fd.append("name", input.name);
    fd.append("description", input.description);
    fd.append("sourceType", input.sourceType);
    if (input.sourceType === "github") {
      fd.append("repo", input.repo);
      fd.append("branch", input.branch);
    } else if (input.archive) {
      fd.append("archive", input.archive);
    }
    const { data } = await apiClient.post("/projects", fd);
    await refetch("projects", "deployments", "notifications");
    return { id: idOf(data) };
  },
  async deployProject(projectId: string): Promise<Pick<Deployment, "id">> {
    const { data } = await apiClient.post(`/projects/${projectId}/deploy`);
    await refetch("projects", "deployments", "notifications");
    return { id: idOf(data) };
  },
  async saveEnvVars(projectId: string, vars: EnvVar[]) {
    await apiClient.put(`/projects/${projectId}/env`, { vars });
    await refetch(`env:${projectId}`);
    return;
  },
  async saveFile(projectId: string, path: string, content: string) {
    // backend route: PUT /projects/:id/files/content
    await apiClient.put(`/projects/${projectId}/files/content`, { path, content });
    await refetch(`files:${projectId}`);
    return;
  },
  async stopContainer(id: string) {
    await apiClient.post(`/containers/${id}/stop`);
    await refetch("containers");
    return;
  },
  async markAllNotificationsRead() {
    await apiClient.post("/notifications/read-all");
    await refetch("notifications");
    return;
  },
  async updateUserRole(userId: string, role: Role) {
    await apiClient.patch(`/admin/users/${userId}`, { role });
    await refetch("users");
    return;
  },
};

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}