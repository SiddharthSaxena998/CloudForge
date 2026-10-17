# Phase 2 — safe to share (resource limits, disk protection, abuse control)

## What is enforced now
| Area | Protection | Setting (default) |
|---|---|---|
| Running apps | memory/CPU/pids caps, no swap, no new privileges, log rotation | `CONTAINER_MEMORY_MB` 512, `CONTAINER_CPUS` 0.5, `CONTAINER_PIDS` 256 |
| Builds | memory/CPU caps, timeout, max parallel builds | `BUILD_MEMORY_MB` 2048, `BUILD_CPUS` 1, `BUILD_TIMEOUT_MIN` 10, `MAX_CONCURRENT_BUILDS` 2 |
| Per user | projects and running apps | `MAX_PROJECTS_PER_USER` 5, `MAX_RUNNING_CONTAINERS_PER_USER` 3 |
| Deploy spam | cooldown + hourly cap (HTTP 429) | `DEPLOY_COOLDOWN_SEC` 20, `MAX_DEPLOYS_PER_HOUR` 20 |
| Zip/tar bombs | unpacking is watched and killed above the limit, folder removed (HTTP 413) | `MAX_SOURCE_MB` 500 |
| Big GitHub repos | size checked after clone, removed if too big (413) | `MAX_SOURCE_MB` |
| Full disk | new projects/deploys refused below this free space (HTTP 507) | `MIN_FREE_DISK_MB` 2048 |
| Failed project creation | half-unpacked source is deleted again | always |
| Cleanup job | removes images of old stopped/failed deployments, dangling images, old build cache; reports orphan source folders | `CLEANUP_INTERVAL_MIN` 60, `IMAGE_RETENTION_DAYS` 3, `CLEANUP_ORPHANS` log |

Admins skip the per-user limits. Everything is tunable from `Backend/.env` (see `.env.example`).
The cleanup job prints one line per run: `[cleanup] old images removed: ... free disk: ... MB`.

### Orphan folders
A source folder under `Backend/uploads` that no project points to is an "orphan". By default the
job only **reports** them (`CLEANUP_ORPHANS=log`) because projects created in `npm start` mode and
in Compose mode store different absolute paths, so the other mode's projects would look like
orphans. Set `CLEANUP_ORPHANS=delete` only after you stick to one mode. Folders younger than
`ORPHAN_GRACE_HOURS` are never touched.

## docker.sock hardening (optional)
`docker compose -f docker-compose.hardened.yml up -d --build` (use it instead of `docker-compose.yml`).
The backend then has no Docker socket; it talks to a proxy that allows only containers, images
and build, and answers 403 to exec, volumes, networks, swarm, secrets, ...

What it does **not** fix: anyone who controls the backend can still ask the proxy to create a
container (including a privileged one with a host bind mount). Docker-in-your-own-Docker is not a
real sandbox. Before inviting strangers, run CloudForge on a separate machine/VM that holds
nothing important, or use rootless Docker / Sysbox / gVisor as the next step.

Other known gaps (not built yet): user apps share Docker's default network, so one app can reach
another or `host.docker.internal`; there is no per-user disk quota for built images; build
`npm install` scripts run with network access.

## Check it works
1. Deploy twice quickly -> second try: "Please wait Ns before deploying again."
2. Upload a zip that unpacks above `MAX_SOURCE_MB` (set it to 1 for the test) -> "Archive is too large when unpacked".
3. `docker compose logs backend | grep cleanup` -> shows a line ~30 s after start.
4. Hardened mode: `docker compose -f docker-compose.hardened.yml ps` shows 3 services; deploy a test app as usual.
