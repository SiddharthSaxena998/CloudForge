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

export const mockUsers: User[] = [
  {
    id: "usr_01",
    name: "Aarav Mehta",
    email: "aarav.mehta@cloudforge.dev",
    role: "admin",
    joinedAt: "2025-11-04",
  },
  {
    id: "usr_02",
    name: "Priya Nair",
    email: "priya.nair@cloudforge.dev",
    role: "user",
    joinedAt: "2026-01-18",
  },
  {
    id: "usr_03",
    name: "Daniel Okoye",
    email: "daniel.okoye@cloudforge.dev",
    role: "user",
    joinedAt: "2026-03-02",
  },
  {
    id: "usr_04",
    name: "Lena Fischer",
    email: "lena.fischer@cloudforge.dev",
    role: "user",
    joinedAt: "2026-05-27",
  },
];

export const mockProjects: Project[] = [
  {
    id: "prj_8fa21",
    name: "api-gateway",
    description: "Public REST gateway for the CloudForge control plane.",
    framework: "Node.js",
    status: "running",
    lastDeployedAt: "2026-09-28T14:22:00Z",
    region: "ap-south-1",
    repo: "github.com/cloudforge/api-gateway",
    branch: "main",
    domain: "api-gateway.cf-apps.dev",
  },
  {
    id: "prj_3cd77",
    name: "console-web",
    description: "Operator dashboard served as a static SPA bundle.",
    framework: "React",
    status: "running",
    lastDeployedAt: "2026-09-29T09:05:00Z",
    region: "eu-central-1",
    repo: "github.com/cloudforge/console-web",
    branch: "main",
    domain: "console.cf-apps.dev",
  },
  {
    id: "prj_5be03",
    name: "metrics-collector",
    description: "Scrapes container metrics and writes rollups to MongoDB.",
    framework: "Python",
    status: "building",
    lastDeployedAt: "2026-09-29T11:41:00Z",
    region: "us-east-1",
    repo: "github.com/cloudforge/metrics-collector",
    branch: "release/1.4",
    domain: "metrics.cf-apps.dev",
  },
  {
    id: "prj_91ab4",
    name: "billing-worker",
    description: "Nightly usage aggregation and invoice generation job.",
    framework: "Go",
    status: "failed",
    lastDeployedAt: "2026-09-27T02:10:00Z",
    region: "us-east-1",
    repo: "github.com/cloudforge/billing-worker",
    branch: "main",
    domain: "billing-worker.cf-apps.dev",
  },
  {
    id: "prj_20e19",
    name: "docs-site",
    description: "Public documentation and API reference.",
    framework: "Next.js",
    status: "running",
    lastDeployedAt: "2026-09-24T16:48:00Z",
    region: "eu-central-1",
    repo: "github.com/cloudforge/docs-site",
    branch: "main",
    domain: "docs.cf-apps.dev",
  },
  {
    id: "prj_47cc8",
    name: "legacy-uploader",
    description: "Deprecated archive upload service, retained for migration.",
    framework: "Django",
    status: "stopped",
    lastDeployedAt: "2026-08-12T07:33:00Z",
    region: "ap-south-1",
    repo: "github.com/cloudforge/legacy-uploader",
    branch: "maint",
    domain: "uploader.cf-apps.dev",
  },
];

export const mockStats = {
  totalProjects: mockProjects.length,
  runningDeployments: mockProjects.filter((p) => p.status === "running").length,
  activeContainers: 9,
  deploymentsThisWeek: 23,
};

export const mockNotificationCount = 3;
