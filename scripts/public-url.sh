#!/usr/bin/env bash
# Prints the public link of the dashboard (Cloudflare quick tunnel started by `--profile public`).
# The link changes every time the `tunnel` container is recreated.
cd "$(dirname "$0")/.." || exit 1
for i in 1 2 3 4 5 6 7 8 9 10; do
  url=$(docker compose --profile public logs tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
  if [ -n "$url" ]; then echo "$url"; exit 0; fi
  sleep 2
done
echo "No link yet. Start it with:  docker compose --profile public up -d --build" >&2
echo "Then check:                  docker compose --profile public logs tunnel" >&2
exit 1
