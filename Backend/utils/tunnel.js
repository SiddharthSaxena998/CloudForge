/**
 * Free public links for deployed apps using Cloudflare Quick Tunnels.
 * No account, no domain, no manual steps: the backend spawns
 *   cloudflared tunnel --url http://127.0.0.1:<hostPort>
 * and reads the https://<random>.trycloudflare.com URL from its output.
 *
 * Requirements: `cloudflared` installed on the machine running the backend
 * (macOS: brew install cloudflared). If it is missing, deployments still
 * succeed — they just get no public link.
 *
 * Env:
 *   ENABLE_TUNNEL=false     -> turn the feature off
 *   CLOUDFLARED_BIN=/path   -> custom binary location
 *   TUNNEL_TARGET_HOST=...  -> where deployed apps listen (host.docker.internal under Compose)
 */
const { spawn } = require('child_process');

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 30000;

// key (container id) -> { proc, url }
const tunnels = new Map();

const enabled = () => String(process.env.ENABLE_TUNNEL).toLowerCase() !== 'false';
const bin = () => process.env.CLOUDFLARED_BIN || 'cloudflared';
// 127.0.0.1 when the backend runs on the host; host.docker.internal when it runs in Docker Compose
const targetHost = () => process.env.TUNNEL_TARGET_HOST || '127.0.0.1';

/**
 * Starts (or reuses) a tunnel for a local port.
 * Resolves { url } on success or { url: null, reason } — never rejects.
 */
function startTunnel(key, port) {
  key = String(key);

  if (!enabled()) return Promise.resolve({ url: null, reason: 'Tunnels disabled (ENABLE_TUNNEL=false)' });

  const existing = tunnels.get(key);
  if (existing && existing.url) return Promise.resolve({ url: existing.url });

  return new Promise((resolve) => {
    let settled = false;
    let proc;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    try {
      proc = spawn(
        bin(),
        ['tunnel', '--no-autoupdate', '--url', `http://${targetHost()}:${port}`],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (error) {
      return resolve({ url: null, reason: error.message });
    }

    const entry = { proc, url: null };
    tunnels.set(key, entry);

    const timer = setTimeout(() => {
      stopTunnel(key);
      done({ url: null, reason: 'Timed out waiting for Cloudflare tunnel URL' });
    }, START_TIMEOUT_MS);

    const onData = (chunk) => {
      if (entry.url) return;
      const match = URL_RE.exec(chunk.toString());
      if (match) {
        entry.url = match[0];
        done({ url: entry.url });
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('error', (error) => {
      tunnels.delete(key);
      done({
        url: null,
        reason:
          error.code === 'ENOENT'
            ? 'cloudflared is not installed (macOS: brew install cloudflared)'
            : error.message,
      });
    });

    proc.on('exit', (code) => {
      if (tunnels.get(key) === entry) tunnels.delete(key);
      done({ url: null, reason: `cloudflared exited (code ${code})` });
    });
  });
}

function stopTunnel(key) {
  const entry = tunnels.get(String(key));
  if (!entry) return;
  tunnels.delete(String(key));
  try { entry.proc.kill('SIGTERM'); } catch (_) {}
}

function stopAllTunnels() {
  for (const key of [...tunnels.keys()]) stopTunnel(key);
}

const getTunnelUrl = (key) => tunnels.get(String(key))?.url || null;

module.exports = { startTunnel, stopTunnel, stopAllTunnels, getTunnelUrl };
