import { useSyncExternalStore } from "react";
import type { DeploymentStatus, Project, User } from "./types";

/**
 * Shared client-side cache of server data. Filled by src/lib/remote.ts;
 * screens read it through useStore().
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

  // Deployed app ports
  hostPort: number | null;
  containerPort: number | null;
}
export interface Container {
  id: string;
  name: string;
  projectId: string;
  status: DeploymentStatus;
  cpu: number;
  memoryMb: number;
  memoryLimitMb: number | null;
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
  logs: Record<string, LogLine[]>;
}

function emptyState(): State {
  return { projects: [], envVars: {}, files: {}, deployments: [], containers: [], notifications: [], users: [], logs: {} };
}

let state: State = emptyState();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getState = () => state;

export function useStore<T>(selector: (s: State) => T): T {
  // Subscribe to the whole state (stable until a change), then derive.
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return selector(snapshot);
}

export const dataStore = {
  get: getState,
  hydrate(update: (s: State) => Partial<State>) {
    state = { ...state, ...update(state) };
    listeners.forEach((l) => l());
  },
  /** Clear all cached server data (sign-out). */
  reset() {
    state = emptyState();
    listeners.forEach((l) => l());
  },
};