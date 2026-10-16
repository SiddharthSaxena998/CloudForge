# Live metrics and log streaming (WebSockets)

Guide requirements: real-time CPU/memory over WebSockets + automated deployment log streaming.

## Flow
```
Docker stats ──► containerController (every STATS_INTERVAL_MS, default 3 s)
                  └─ emit "container-stats-update" ► room user-<ownerId> ──► Containers page (bars + chart)
Deploy pipeline ► emitLog() saves to MongoDB, then emit "deployment-log" ► room deployment-<id> ──► Logs page
                  └─ emit "deployment-status" (building / running / failed / stopped)
```

## Security
- A socket needs a valid JWT in the handshake (`io(url, { auth: { token } })`), otherwise it is rejected.
- `join-deployment` is allowed only for the deployment's owner (or an admin) — checked in `utils/realtime.js`.
- Metrics go only to the owner's room `user-<id>`; nobody sees another user's containers.

## Frontend
- `src/lib/socket.ts` one shared connection; `src/lib/live.ts` hooks `useLiveContainers`, `useLiveLogs`,
  `useMetricHistory`; `src/components/live-metrics.tsx` CPU/memory chart (recharts).
- No lost lines: the logs page joins the room first, then reloads history; live lines and history are merged by log id.
- If the socket is down the pages fall back to polling (containers every 8 s, logs every 3 s while building).

## Try it
1. `docker compose up -d --build` (the frontend image needs the new `socket.io-client` package).
2. Open Containers: the "Live metrics" panel shows "Streaming over WebSocket" and the chart fills in while an app runs.
3. Deploy a project and open its Logs page: lines appear while the build runs, no refresh needed.
