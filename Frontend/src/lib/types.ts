export type Role = "admin" | "user";
export type DeploymentStatus = "running" | "building" | "failed" | "stopped";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  framework: string;
  status: DeploymentStatus;
  lastDeployedAt: string;
  region: string;
  repo: string;
  branch: string;
  domain: string;
}