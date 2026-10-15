# Phase 1 — run CloudForge with Docker Compose (Mac)

One command starts the dashboard and the API, and they come back after a reboot
(`restart: unless-stopped`, as long as Docker Desktop starts at login).

## Start
```bash
cd Backend && cp .env.example .env     # fill MONGO_URI (Atlas) and JWT_SECRET; skip if .env exists
cd ..
docker compose up -d --build
```
- Dashboard: http://localhost:8080  — API: http://localhost:5000
- Deployed apps get ports 20000-29999 (`APP_PORT_RANGE`) and a free `trycloudflare.com` link.
- Logs: `docker compose logs -f backend` — Stop: `docker compose down`

Stop `npm start` / `npm run dev` first (ports 5000 and 8080 must be free).

## How it differs from `npm start`
| | npm start (host) | docker compose |
|---|---|---|
| Backend talks to Docker | via your Docker socket | via the mounted `/var/run/docker.sock` |
| Tunnel reaches apps at | 127.0.0.1:PORT | host.docker.internal:PORT |
| Project sources | `Backend/uploads` (host path) | same folder, mounted at `/app/uploads` |

**Do not mix the two modes on the same data.** Projects store an absolute source path, so a
project created under `npm start` points at `/Users/...` and will not be found inside the
container (and the other way round). Pick one mode, or recreate the projects.

## Security note
The backend container controls your Docker through the socket — anyone who can break out of the
backend can control your Mac's Docker. Fine for local use; Phase 2 hardening (user containers
already have memory/CPU/pids limits) must be finished before opening the platform to strangers.

## Things to verify on the first run
1. `docker compose ps` shows both services Up.
2. Deploy a test app: logs end with `Public URL: https://....trycloudflare.com` and it opens.
3. If the tunnel says "bad gateway" or cannot reach the app, `host.docker.internal` is not
   reaching the published port — send the backend logs.

## Not done yet (Phase 1b)
- A public link for the dashboard itself (needs the API reachable too).
- Production build of the dashboard (it runs the Vite dev server for now).
