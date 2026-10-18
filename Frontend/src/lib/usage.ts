import { useEffect, useState } from "react";
import { apiClient } from "./api-client";
import { useStore } from "./store";

export interface UsageItem {
  used: number;
  max: number;
}

export interface Usage {
  /** Admins have no quotas */
  unlimited: boolean;
  projects: UsageItem;
  runningApps: UsageItem;
  deploysPerHour: UsageItem;
}

/** The signed-in user's quota usage; refreshes when projects, apps or deployments change. */
export function useUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null);
  const stamp = useStore(
    (s) =>
      `${s.projects.length}|${s.containers.filter((c) => c.status === "running").length}|${s.deployments.length}`,
  );

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Usage>("/auth/usage")
      .then(({ data }) => {
        if (!cancelled) setUsage(data);
      })
      .catch(() => {
        /* the card is optional: keep showing the last numbers */
      });
    return () => {
      cancelled = true;
    };
  }, [stamp]);

  return usage;
}
