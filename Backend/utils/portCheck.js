/** Waits until something accepts TCP connections on host:port (used after a deploy). */
const net = require('net');

const canConnect = (host, port, timeoutMs = 1000) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });

/**
 * Resolves { up: true } as soon as the port answers, { up: false, alive } at the deadline.
 * isAlive() (optional) lets us stop early when the container died.
 */
async function waitForPort(host, port, { timeoutMs = 25000, intervalMs = 1000, isAlive } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await canConnect(host, port)) return { up: true, alive: true };
    if (isAlive && !(await isAlive().catch(() => true))) return { up: false, alive: false };
    if (Date.now() >= deadline) return { up: false, alive: true };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = { canConnect, waitForPort };
