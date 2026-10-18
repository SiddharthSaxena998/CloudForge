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

## App output (runtime logs)
Build logs show how the app was built; **Logs** on the Containers page shows what the running app
prints (console.log, errors, crashes) — stdout in normal colour, stderr in red.

- Socket events: client `join-container-logs` (container id, ack) / `leave-container-logs`;
  server `container-log` `{ containerId, lines: [{ ts, stream, text }] }` (batched ~7x/s) and
  `container-log-end`. Only the owner (or an admin) may join; max 3 open views per connection.
- First the last 200 lines are sent, then new lines as they happen. Stopped containers still show
  their last lines (handy to see why an app crashed).
- Fallback: `GET /api/containers/:id/logs?tail=300` (dashboard polls it every 3 s when the WebSocket
  is unavailable).
- A very chatty app is throttled (oldest lines skipped with a notice), long lines are cut at 4000
  characters, colour codes are removed.
