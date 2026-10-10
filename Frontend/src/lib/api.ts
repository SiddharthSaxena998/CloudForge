import { apiClient } from "./api-client";
import {
  type Deployment,
  type EnvVar,
  type ProjectRecord,
  type SourceType,
} from "./store";
import { refetch } from "./remote";
import type { Role } from "./types";

const idOf = (x: unknown): string => {
  const o = (x ?? {}) as Record<string, unknown>;

  const inner = (o["project"] ??
    o["deployment"] ??
    o) as Record<string, unknown>;

  return String(inner["id"] ?? inner["_id"] ?? "");
};

/**
 * Mutation endpoints:
 * Each call hits the Express API and then refetches
 * the affected data from the server.
 */
export const api = {
  // --------------------------------------------------
  // CREATE PROJECT
  // --------------------------------------------------

  async createProject(input: {
    name: string;
    description: string;
    sourceType: SourceType;
    repo: string;
    branch: string;
    archive: File | null;
  }): Promise<Pick<ProjectRecord, "id">> {
    const formData = new FormData();

    formData.append("name", input.name);
    formData.append("description", input.description);
    formData.append("sourceType", input.sourceType);
    formData.append("repo", input.repo);
    formData.append("branch", input.branch);

    if (input.archive) {
      formData.append("archive", input.archive);
    }

    const { data } = await apiClient.post(
      "/projects",
      formData
    );

    await refetch(
      "projects",
      "deployments",
      "notifications"
    );

    return {
      id: idOf(data),
    };
  },

  // --------------------------------------------------
  // DEPLOY PROJECT
  // --------------------------------------------------

  async deployProject(
    projectId: string
  ): Promise<Pick<Deployment, "id">> {
    const { data } = await apiClient.post(
      `/projects/${projectId}/deploy`
    );

    await refetch(
      "projects",
      "deployments",
      "notifications"
    );

    return {
      id: idOf(data),
    };
  },

  // --------------------------------------------------
  // SAVE ENVIRONMENT VARIABLES
  // --------------------------------------------------

  async saveEnvVars(
    projectId: string,
    vars: EnvVar[]
  ) {
    await apiClient.put(
      `/projects/${projectId}/env`,
      { vars }
    );

    await refetch(`env:${projectId}`);

    return;
  },

  // --------------------------------------------------
  // SAVE FILE
  // --------------------------------------------------

  async saveFile(
    projectId: string,
    path: string,
    content: string
  ) {
    await apiClient.put(
      `/projects/${projectId}/files`,
      {
        path,
        content,
      }
    );

    await refetch(`files:${projectId}`);

    return;
  },

  // --------------------------------------------------
  // STOP CONTAINER
  // --------------------------------------------------

  async stopContainer(id: string) {
    await apiClient.post(
      `/containers/${id}/stop`
    );

    await refetch("containers", "deployments", "projects");

    return;
  },

  async deleteContainer(id: string) {
    await apiClient.delete(`/containers/${id}`);

    await refetch("containers");

    return;
  },

  async deleteProject(id: string) {
    await apiClient.delete(`/projects/${id}`);

    await refetch("projects", "deployments", "containers");

    return;
  },

  // --------------------------------------------------
  // MARK ALL NOTIFICATIONS READ
  // --------------------------------------------------

  async markAllNotificationsRead() {
    await apiClient.post(
      "/notifications/read-all"
    );

    await refetch("notifications");

    return;
  },

  // --------------------------------------------------
  // UPDATE USER ROLE
  // --------------------------------------------------

  async updateUserRole(
    userId: string,
    role: Role
  ) {
    await apiClient.patch(
      `/admin/users/${userId}`,
      { role }
    );

    await refetch("users");

    return;
  },
};

// --------------------------------------------------
// DATE FORMATTER
// --------------------------------------------------

export function formatDate(iso: string) {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
