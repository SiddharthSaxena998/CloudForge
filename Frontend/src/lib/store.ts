import { useSyncExternalStore } from "react";
import {
  mockProjects,
  mockUsers,
  type DeploymentStatus,
  type Project,
  type Role,
  type User,
} from "./mock-data";
import { USE_MOCK_API } from "@/config";

/**
 * In-memory mock store. Stands in for the Express/MongoDB API while
 * USE_MOCK_API is true; mutations go through src/lib/api.ts.
 */

export type SourceType = "github" | "archive";

export interface ProjectRecord extends Project {
  sourceType: SourceType;
  archiveName: string;
  createdAt: string;
}
export interface EnvVar {
  key: string;
  value: string;
}
export interface ProjectFile {
  path: string;
  content: string;
}
export interface Deployment {
  id: string;
  projectId: string;
  createdAt: string;
  status: DeploymentStatus;
  source: string;
  commit: string;
  durationSec: number;
}
export interface Container {
  id: string;
  name: string;
  projectId: string;
  status: DeploymentStatus;
  cpu: number;
  memoryMb: number;
  memoryLimitMb: number;
  url: string;
}
export type NotificationKind = "success" | "failure" | "info";
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  createdAt: string;
  read: boolean;
}
export type LogLevel = "info" | "warn" | "error" | "success";
export interface LogLine {
  time: string;
  level: LogLevel;
  text: string;
}

interface State {
  projects: ProjectRecord[];
  envVars: Record<string, EnvVar[]>;
  files: Record<string, ProjectFile[]>;
  deployments: Deployment[];
  containers: Container[];
  notifications: AppNotification[];
  users: User[];
  /** Real-API mode only: logs fetched from the server per deployment. */
  logs: Record<string, LogLine[]>;
}

const hex = (seed: string, len = 7) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, len);
};

function defaultFiles(p: Project): ProjectFile[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: p.name,
          version: "1.0.0",
          scripts: { build: "npm run compile", start: "node dist/index.js" },
        },
        null,
        2,
      ),
    },
    {
      path: "Dockerfile",
      content: `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]\n`,
    },
    {
      path: "src/index.js",
      content: `const http = require("http");\n\nconst port = process.env.PORT || 3000;\n\nhttp\n  .createServer((req, res) => res.end("${p.name} is running"))\n  .listen(port, () => console.log(\`listening on \${port}\`));\n`,
    },
    { path: "README.md", content: `# ${p.name}\n\n${p.description}\n` },
  ];
}

function seedDeployments(p: ProjectRecord): Deployment[] {
  const base = new Date(p.lastDeployedAt).getTime();
  const history: DeploymentStatus[] = [p.status === "stopped" ? "running" : p.status, "running", "failed", "running"];
  return history.map((status, i) => ({
    id: `dpl_${p.id.slice(4)}${i}`,
    projectId: p.id,
    createdAt: new Date(base - i * 26 * 3600_000).toISOString(),
    status,
    source: p.sourceType === "github" ? `${p.branch}` : p.archiveName,
    commit: hex(p.id + i),
    durationSec: 48 + ((i * 37) % 90),
  }));
}

function initialState(): State {
  const projects: ProjectRecord[] = mockProjects.map((p, i) => ({
    ...p,
    sourceType: p.name === "legacy-uploader" ? "archive" : "github",
    archiveName: `${p.name}-v1.${i}.zip`,
    createdAt: new Date(Date.parse("2026-03-10T10:00:00Z") + i * 17 * 86400_000).toISOString(),
  }));
  const envVars: State["envVars"] = {};
  const files: State["files"] = {};
  for (const p of projects) {
    envVars[p.id] = [
      { key: "NODE_ENV", value: "production" },
      { key: "PORT", value: "3000" },
      { key: "MONGO_URI", value: `mongodb://db.internal:27017/${p.name.replace(/-/g, "_")}` },
    ];
    files[p.id] = defaultFiles(p);
  }
  const containers: Container[] = [
    ["api-gateway-7f9c2", "prj_8fa21", "running", 34.2, 412, 1024],
    ["api-gateway-b31d8", "prj_8fa21", "running", 28.7, 388, 1024],
    ["console-web-2a6e1", "prj_3cd77", "running", 6.1, 128, 512],
    ["metrics-collector-e04f7", "prj_5be03", "building", 71.5, 690, 2048],
    ["docs-site-9d2b0", "prj_20e19", "running", 3.4, 96, 512],
    ["docs-site-c5a13", "prj_20e19", "running", 2.9, 91, 512],
    ["billing-worker-41fa9", "prj_91ab4", "failed", 0, 0, 1024],
    ["legacy-uploader-88c07", "prj_47cc8", "stopped", 0, 0, 512],
  ].map(([name, projectId, status, cpu, memoryMb, memoryLimitMb]) => ({
    id: hex(String(name), 12),
    name: String(name),
    projectId: String(projectId),
    status: status as DeploymentStatus,
    cpu: Number(cpu),
    memoryMb: Number(memoryMb),
    memoryLimitMb: Number(memoryLimitMb),
    url: `https://${projects.find((p) => p.id === projectId)?.domain ?? "cf-apps.dev"}`,
  }));
  const notifications: AppNotification[] = [
    { id: "ntf_1", kind: "success", message: "console-web deployed successfully to eu-central-1.", createdAt: "2026-09-29T09:07:00Z", read: false },
    { id: "ntf_2", kind: "info", message: "metrics-collector build started from branch release/1.4.", createdAt: "2026-09-29T11:41:00Z", read: false },
    { id: "ntf_3", kind: "failure", message: "billing-worker deployment failed: exit code 1 during go build.", createdAt: "2026-09-27T02:12:00Z", read: false },
    { id: "ntf_4", kind: "success", message: "api-gateway deployed successfully to ap-south-1.", createdAt: "2026-09-28T14:24:00Z", read: true },
    { id: "ntf_5", kind: "info", message: "Lena Fischer joined the workspace.", createdAt: "2026-05-27T08:15:00Z", read: true },
    { id: "ntf_6", kind: "info", message: "legacy-uploader was stopped by Aarav Mehta.", createdAt: "2026-08-12T07:40:00Z", read: true },
  ];
  return {
    projects,
    envVars,
    files,
    deployments: projects.flatMap(seedDeployments),
    containers,
    notifications,
    users: mockUsers.map((u) => ({ ...u })),
    logs: {},
  };
}

function emptyState(): State {
  return { projects: [], envVars: {}, files: {}, deployments: [], containers: [], notifications: [], users: [], logs: {} };
}

// In real-API mode start empty; pages fill the store from the server.
let state: State = USE_MOCK_API ? initialState() : emptyState();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function setState(update: (s: State) => Partial<State>) {
  state = { ...state, ...update(state) };
  listeners.forEach((l) => l());
}

export function useStore<T>(selector: (s: State) => T): T {
  // Subscribe to the whole state (stable reference until a mutation), then
  // derive — so selectors may safely return new arrays/objects.
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return selector(snapshot);
}
const getState = () => state;

export function buildLogs(d: Deployment, project: ProjectRecord | undefined): LogLine[] {
  const start = new Date(d.createdAt).getTime();
  const t = (s: number) => new Date(start + s * 1000).toISOString().slice(11, 19);
  const name = project?.name ?? "app";
  const lines: [number, LogLevel, string][] = [
    [0, "info", `Deployment ${d.id} queued for ${name}`],
    [1, "info", d.source.endsWith(".zip") ? `Extracting archive ${d.source}` : `Cloning ${project?.repo ?? "repository"} (branch: ${d.source})`],
    [3, "info", `Checked out commit ${d.commit}`],
    [4, "info", "Detected Dockerfile, using docker build strategy"],
    [5, "info", "Step 1/7 : FROM node:20-alpine"],
    [7, "info", "Step 2/7 : WORKDIR /app"],
    [7, "info", "Step 3/7 : COPY package*.json ./"],
    [8, "info", "Step 4/7 : RUN npm ci --omit=dev"],
    [19, "warn", "npm WARN deprecated inflight@1.0.6: This module is not supported"],
    [24, "info", "added 214 packages, audited 215 packages in 15s"],
    [25, "warn", "2 moderate severity vulnerabilities found (run npm audit for details)"],
    [26, "info", "Step 5/7 : COPY . ."],
    [27, "info", "Step 6/7 : EXPOSE 3000"],
    [27, "info", 'Step 7/7 : CMD ["npm", "start"]'],
  ];
  if (d.status === "failed") {
    lines.push(
      [29, "error", "Error: build step exited with code 1"],
      [29, "error", "  at compile (src/index.js:14:9)"],
      [30, "error", "Build failed. Container was not started."],
    );
  } else if (d.status === "building") {
    lines.push([30, "info", "Exporting layers..."]);
  } else {
    lines.push(
      [31, "info", `Successfully built image cloudforge/${name}:${d.commit}`],
      [33, "info", `Pushing image to registry.cf-apps.dev/${name}`],
      [40, "info", `Starting container on ${project?.region ?? "us-east-1"}`],
      [43, "info", "Health check passed (GET / -> 200)"],
      [44, "success", `Build successful. Live at https://${project?.domain ?? "cf-apps.dev"}`],
    );
  }
  return lines.map(([s, level, text]) => ({ time: t(s), level, text }));
}

let seq = 100;
export const mockStore = {
  get: () => state,
  /** Replace parts of the state with data from the real API. */
  hydrate(update: (s: State) => Partial<State>) {
    setState(update);
  },
  /** Clear server data (used on sign-out in real-API mode). */
  reset() {
    if (!USE_MOCK_API) setState(() => emptyState());
  },
  createProject(input: {
    name: string;
    description: string;
    sourceType: SourceType;
    repo: string;
    branch: string;
    archiveName: string;
  }): ProjectRecord {
    const now = new Date().toISOString();
    const id = `prj_${hex(input.name + now, 5)}`;
    const project: ProjectRecord = {
      id,
      name: input.name,
      description: input.description || "No description provided.",
      framework: "Node.js",
      status: "building",
      lastDeployedAt: now,
      region: "ap-south-1",
      repo: input.sourceType === "github" ? input.repo.replace(/^https?:\/\//, "") : "",
      branch: input.sourceType === "github" ? input.branch : "",
      domain: `${input.name}.cf-apps.dev`,
      sourceType: input.sourceType,
      archiveName: input.archiveName,
      createdAt: now,
    };
    const deployment: Deployment = {
      id: `dpl_${hex(id, 5)}0`,
      projectId: id,
      createdAt: now,
      status: "building",
      source: input.sourceType === "github" ? input.branch : input.archiveName,
      commit: hex(now),
      durationSec: 0,
    };
    setState((s) => ({
      projects: [project, ...s.projects],
      envVars: { ...s.envVars, [id]: [{ key: "NODE_ENV", value: "production" }] },
      files: { ...s.files, [id]: defaultFiles(project) },
      deployments: [deployment, ...s.deployments],
      notifications: [
        { id: `ntf_${seq++}`, kind: "info", message: `Project ${project.name} created. First build started.`, createdAt: now, read: false },
        ...s.notifications,
      ],
    }));
    return project;
  },
  deployProject(projectId: string): Deployment {
    const p = state.projects.find((x) => x.id === projectId);
    const now = new Date().toISOString();
    const d: Deployment = {
      id: `dpl_${hex(projectId + now, 6)}`,
      projectId,
      createdAt: now,
      status: "building",
      source: p?.sourceType === "archive" ? p.archiveName : (p?.branch ?? "main"),
      commit: hex(now),
      durationSec: 0,
    };
    setState((s) => ({
      deployments: [d, ...s.deployments],
      projects: s.projects.map((x) => (x.id === projectId ? { ...x, status: "building", lastDeployedAt: now } : x)),
    }));
    return d;
  },
  saveEnvVars(projectId: string, vars: EnvVar[]) {
    setState((s) => ({ envVars: { ...s.envVars, [projectId]: vars } }));
  },
  saveFile(projectId: string, path: string, content: string) {
    setState((s) => {
      const list = s.files[projectId] ?? [];
      const exists = list.some((f) => f.path === path);
      return {
        files: {
          ...s.files,
          [projectId]: exists
            ? list.map((f) => (f.path === path ? { ...f, content } : f))
            : [...list, { path, content }],
        },
      };
    });
  },
  stopContainer(id: string) {
    setState((s) => ({
      containers: s.containers.map((c) => (c.id === id ? { ...c, status: "stopped", cpu: 0, memoryMb: 0 } : c)),
    }));
  },
  markAllRead() {
    setState((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  },
  updateUserRole(userId: string, role: Role) {
    setState((s) => ({ users: s.users.map((u) => (u.id === userId ? { ...u, role } : u)) }));
  },
};