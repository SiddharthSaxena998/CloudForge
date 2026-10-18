export type Role = "admin" | "user";
export type DeploymentStatus = "running" | "building" | "failed" | "stopped";

export type UserStatus = "active" | "blocked";

/** Admin-set exceptions to the default quotas; null = use the default. */
export interface LimitOverrides {
  maxProjects: number | null;
  maxRunningContainers: number | null;
  maxDeploysPerHour: number | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  /** Only present in the admin user list */
  status?: UserStatus;
  limitOverrides?: LimitOverrides;
  usage?: { projects: number; runningApps: number };
}

export interface Project {
  id: string;
  name: string;
  description: string;
  framework: string;
  /** Port the app listens on inside its container; null/absent = auto-detect */
  port?: number | null;
  status: DeploymentStatus;
  lastDeployedAt: string;
  region: string;
  repo: string;
  branch: string;
  domain: string;
}