const net = require('net');
const { waitForPort } = require('../utils/portCheck');

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

describe('waitForPort', () => {
  it('reports up when something listens', async () => {
    const server = net.createServer((s) => s.end());
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const result = await waitForPort('127.0.0.1', server.address().port, { timeoutMs: 2000 });
    server.close();
    expect(result).toEqual({ up: true, alive: true });
  });

  it('finds an app that starts a little late', async () => {
    const port = await freePort();
    const server = net.createServer((s) => s.end());
    setTimeout(() => server.listen(port, '127.0.0.1'), 700);
    const result = await waitForPort('127.0.0.1', port, { timeoutMs: 5000, intervalMs: 200 });
    server.close();
    expect(result.up).toBe(true);
  });

  it('times out on a wrong port while the container is alive', async () => {
    const port = await freePort();
    const result = await waitForPort('127.0.0.1', port, { timeoutMs: 500, intervalMs: 150, isAlive: async () => true });
    expect(result).toEqual({ up: false, alive: true });
  });

  it('stops early when the container died', async () => {
    const port = await freePort();
    const result = await waitForPort('127.0.0.1', port, { timeoutMs: 5000, intervalMs: 150, isAlive: async () => false });
    expect(result).toEqual({ up: false, alive: false });
  });
});
