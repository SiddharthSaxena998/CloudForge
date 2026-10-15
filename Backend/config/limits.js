/**
 * Phase 2: resource limits and quotas. Everything can be tuned from .env.
 * Admins are exempt from per-user quotas.
 */
const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const limits = () => ({
  // per user
  maxProjects: num(process.env.MAX_PROJECTS_PER_USER, 5),
  maxRunningContainers: num(process.env.MAX_RUNNING_CONTAINERS_PER_USER, 3),
  // platform wide
  maxConcurrentBuilds: Math.max(1, num(process.env.MAX_CONCURRENT_BUILDS, 2)),
  buildTimeoutMin: Math.max(1, num(process.env.BUILD_TIMEOUT_MIN, 10)),
  // per container
  containerMemoryMB: Math.max(64, num(process.env.CONTAINER_MEMORY_MB, 512)),
  containerCpus: Math.max(0.1, num(process.env.CONTAINER_CPUS, 0.5)),
  containerPids: Math.max(32, num(process.env.CONTAINER_PIDS, 256)),
  // 127.0.0.1 = only reachable from this machine (and via the tunnel). Use 0.0.0.0 to open to LAN.
  containerBindHost: process.env.CONTAINER_BIND_HOST || '127.0.0.1',
});

const isExempt = (user) => Boolean(user && user.role === 'admin');

module.exports = { limits, isExempt };
