# CloudForge — project notes (read this first)

Self-hosted mini-PaaS (Heroku/Render-like): users upload a zip/tar or give a GitHub repo, the
backend builds a Docker image, runs a container, shows logs/metrics, and gives a public link.
Final-year B.Tech major project (IPS Academy, Indore). Owners: Shivam Dangi, Siddharth Saxena.
The owner writes in Hinglish; reply in Hinglish, keep it short.

## Layout
- `Backend/` Express + Mongoose + dockerode + Socket.IO (plain JS, CommonJS). Entry: `server.js`.
  (`app.js` is an old stub — the real server is `server.js`.)
  - `controllers/` auth, project, deployment (build/run pipeline), container (stop/delete/stats)
  - `utils/` docker.js, archive.js (unzip/tar), frameworkDetector.js, git.js, tunnel.js (Cloudflare
    public links), pathSafety.js (symlink-safe paths), validators.js
  - `config/security.js` helmet, CORS allow-list, rate limits, env validation
- `Frontend/` TanStack Start + React 19 + TypeScript + Tailwind/shadcn (generated with Lovable).
  Talks to `http://localhost:5000/api` (`src/config.ts`). Data layer: `src/lib/remote.ts`.

## Run with Docker Compose (Phase 1)
`docker compose up -d --build` (see docs/PHASE1.md). Backend in Docker uses the host Docker socket,
`TUNNEL_TARGET_HOST=host.docker.internal`, ports for deployed apps from `APP_PORT_RANGE`.
Don't mix `npm start` and Compose on the same uploads (absolute source paths differ).

## Run locally (Mac)
1. Docker Desktop running ("Allow the default Docker socket" enabled). `brew install cloudflared`.
2. `cd Backend && cp .env.example .env` (fill MONGO_URI, JWT_SECRET) `&& npm install && npm start`
3. `cd Frontend && npm install --legacy-peer-deps && npm run dev`
macOS: AirPlay Receiver can hold port 5000 — turn it off or change PORT.

## Deploy pipeline (deploymentController.runDeploymentPipeline)
detect framework -> generate Dockerfile (unless user has one) -> build image -> run container on a
free port -> start Cloudflare quick tunnel -> save Container + Deployment -> notify.
Fire-and-forget (no job queue yet). Logs are stored in the Log collection.

## Status
Done: auth+RBAC, projects (upload/GitHub), env vars, in-browser file editor, Docker deploy,
container stats broadcast over Socket.IO (backend), auto public link (Cloudflare quick tunnel),
Phase 0 security hardening (see below).
Live (WebSockets): deployment logs stream line by line (`deployment-log`, `deployment-status`) and
CPU/memory stream every ~3 s (`container-stats-update`) to the dashboard (`src/lib/live.ts`,
`src/components/live-metrics.tsx`). Rooms are owner-scoped: `user-<id>`, `deployment-<id>` (checked).
NOT done:
Kubernetes, BullMQ/Redis queue, GitHub OAuth, per-user quotas, container resource limits.

## Phase 0 (security) — done in this patch
.gitignore + untrack .env/uploads, .env.example, env validation, helmet, CORS allow-list,
rate limits (auth / api / deploy), socket auth (JWT), symlink-safe file editor, anchored GitHub URL
+ branch validation, `.tar.gz` upload fix + upload size limit, stronger signup validation.
Known gap: Socket.IO 'containers' room still broadcasts every user's stats to every logged-in user
(fix with per-user rooms in Phase 4).

## Roadmap to a public multi-user platform
0 security cleanup (done) -> 1 Docker Compose on the Mac (files ready; 24x7 host later) -> 2 sandbox user containers
(--memory/--cpus/--pids-limit, no privileged, quotas, build timeout, disk cleanup, protect docker.sock)
-> 3 per-app subdomains (needs a domain) -> 4 multi-user features (approval, quotas, abuse handling)
-> 5 reliability (BullMQ queue, log TTL, backups) -> 6 scale (multi-node/K8s).
Start with an invite-only beta of 10-20 users.

## Gotchas learned
- Old CRA apps: `npm install --legacy-peer-deps`, node:16 for build, `sass` not `node-sass`.
- `path.extname('a.tar.gz')` is `.gz` — match full suffix.
- Never commit `.env`; the previous one was public and must be rotated.
- Free tunnels: link changes on each restart; Mac must stay on.
