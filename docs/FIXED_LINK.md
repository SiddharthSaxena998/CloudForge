# Fixed public link (instead of the changing trycloudflare.com one)

The quick tunnel (`--profile public`) gets a NEW random link on every restart. Options for a stable one:

| Option | Cost | Fixed link | Notes |
|---|---|---|---|
| Tailscale Funnel | free | `https://<machine>.<tailnet>.ts.net` | no domain, no router setup; recommended |
| Cloudflare named tunnel | needs a domain (~$1-10/yr) | `https://cloudforge.yourdomain.com` | most professional; free Cloudflare account |
| DuckDNS + port-forward + Caddy | free | `https://yourname.duckdns.org` | only works if your ISP gives a public IP (not CGNAT) |

## Tailscale Funnel (free, 5 minutes)
1. Make a free account at tailscale.com, install Tailscale on the Mac, log in.
2. Admin console -> DNS: enable MagicDNS and HTTPS certificates. Access controls: allow Funnel for your device (the console shows a one-click prompt the first time).
3. Start CloudForge WITHOUT the cloudflared tunnel, only gateway + frontend-public:
   `docker compose --profile public up -d --build gateway frontend-public backend`
4. `tailscale funnel --bg 8080`  (gateway listens on 8080)
5. `tailscale funnel status` prints your fixed https link. It survives restarts.

Frontend dev server allow-list: if the page shows "host not allowed", add your ts.net suffix next to
`.trycloudflare.com` in `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` (docker-compose.yml, frontend-public) -> `.ts.net`.

## Cloudflare named tunnel (if you buy/own a domain)
1. Add the domain to Cloudflare (free plan), then Zero Trust -> Networks -> Tunnels -> Create tunnel, copy the token.
2. Public hostname: `cloudforge.yourdomain.com` -> `http://gateway:80`.
3. In `docker-compose.yml` replace the tunnel command by `tunnel --no-autoupdate run --token ${CF_TUNNEL_TOKEN}` and put the token in `.env` (never commit it).
4. Add `.yourdomain.com` to the frontend allowed hosts.

## Remember
- Deployed apps still get their own temporary quick-tunnel links (utils/tunnel.js); only the dashboard link is fixed here.
- Keep SIGNUP_CODE set while the link is public.
