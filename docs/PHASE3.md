# Phase 3 — public dashboard link (one address for everything)

```
Browser ──> https://xxxx.trycloudflare.com ──> cloudflared (tunnel) ──> gateway (nginx)
                                                        ├─ /            -> frontend-public:8080
                                                        ├─ /api/        -> backend:5000
                                                        └─ /socket.io/  -> backend:5000  (live logs + metrics)
```
Dashboard, API and WebSocket share one origin, so there is nothing to configure per link.
Everything is behind `--profile public`; plain `docker compose up -d --build` works as before.

## Start
```bash
cd ~/CloudForge
docker compose --profile public up -d --build
./scripts/public-url.sh        # prints https://<random>.trycloudflare.com
```
- Local test of the same setup: http://localhost:8081
- Stop only the public part: `docker compose --profile public stop gateway tunnel frontend-public`
- The link changes whenever the `tunnel` container is recreated. For a fixed address you need a
  domain on Cloudflare (named tunnel) — not done yet.

## Production dashboard (experimental, recommended before sharing widely)
`frontend-public` runs the Vite **dev** server by default. It works but is slower and is not meant
for the open internet. Build the real thing instead:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile public up -d --build
```
This builds the app for a Node server (`NITRO_PRESET=node-server`). The Lovable Vite config targets
Cloudflare Workers by default and I could not test the build here, so if it fails send the last
lines of the build log. The Dockerfile stops with a clear message if the preset was ignored.

## What a visitor can do
Anyone with the link can sign up and deploy, limited by the Phase 2 quotas (projects, running
apps, deploys/hour, disk). Rate limits use the real visitor IP (`TRUST_PROXY=1`).
There is no invite code or approval step yet (Phase 4: signup code, admin block/limits).

## Checks
1. `./scripts/public-url.sh` prints a link; open it on your phone (mobile data, not Wi-Fi).
2. Sign up / log in, deploy a test app, open its Logs page: lines stream live and the label says "Live".
3. "Blocked request. This host is not allowed" in the browser: Vite rejected the host. Make sure the
   compose file has `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ".trycloudflare.com"` for `frontend-public`.
4. Logs stuck on "Offline (polling)": WebSocket not passing; check `docker compose logs gateway`.
