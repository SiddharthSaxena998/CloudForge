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
  // builds run in a sandbox too (docker build memory / cpu caps)
  buildMemoryMB: Math.max(256, num(process.env.BUILD_MEMORY_MB, 2048)),
  buildCpus: Math.max(0.1, num(process.env.BUILD_CPUS, 1)),
  // abuse controls (per user; 0 = off)
  deployCooldownSec: num(process.env.DEPLOY_COOLDOWN_SEC, 20),
  maxDeploysPerHour: num(process.env.MAX_DEPLOYS_PER_HOUR, 20),
  // disk protection
  maxSourceMB: Math.max(1, num(process.env.MAX_SOURCE_MB, 500)),   // unpacked source of one project
  minFreeDiskMB: num(process.env.MIN_FREE_DISK_MB, 2048),          // refuse new work below this
  // background cleanup
  cleanupIntervalMin: num(process.env.CLEANUP_INTERVAL_MIN, 60),   // 0 = no cleanup job
  imageRetentionDays: Math.max(1, num(process.env.IMAGE_RETENTION_DAYS, 3)),
  orphanGraceHours: Math.max(1, num(process.env.ORPHAN_GRACE_HOURS, 24)),
  // 'log' = only report leftover source folders, 'delete' = remove them
  cleanupOrphans: process.env.CLEANUP_ORPHANS === 'delete' ? 'delete' : 'log',
  // 127.0.0.1 = only reachable from this machine (and via the tunnel). Use 0.0.0.0 to open to LAN.
  containerBindHost: process.env.CONTAINER_BIND_HOST || '127.0.0.1',
});

const isExempt = (user) => Boolean(user && user.role === 'admin');

module.exports = { limits, isExempt };
