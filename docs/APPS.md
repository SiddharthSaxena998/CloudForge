# Managing deployed apps

## Redeploy builds the newest GitHub commit
Deploying a GitHub project again now first runs `git fetch` + `reset` on the project's branch, so the
new build contains the latest commits (the deployment log shows `Updated abc123 -> def456` or
`Already up to date`). The Deployments page shows the commit that was really built.
- Files you edited in the dashboard's file editor are never overwritten: with local edits the pull is
  skipped and the log says so (build uses the code as it is). Revert your edits to pull again.
- The Dockerfile CloudForge generates replaces a Dockerfile of the repo anyway, so editing it is moot.
- If GitHub is unreachable or the branch was deleted, the log shows a warning and the old code is built.

## Start / Restart without rebuilding
Containers page:
- **Start** (stopped app): starts the same container again, no new build; a new public link appears
  a few seconds later (links change on every start).
- **Restart** (running app): restarts the process (e.g. after changing env vars you still need a
  redeploy, because env vars are baked in when the container is created).
- Start respects the quota (max running apps) and allows one running version per project: stop the
  newer one first, or redeploy.
- If the app dies right after starting, you get the last log lines as the error message.
- If the Docker container is gone (deleted, or cleaned up), the message says to redeploy.
