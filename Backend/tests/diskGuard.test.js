const fs = require('fs');
const os = require('os');
const path = require('path');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-disk-'));
  process.env.MAX_SOURCE_MB = '1';
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.MAX_SOURCE_MB;
  delete process.env.MIN_FREE_DISK_MB;
});

const guard = () => require('../utils/diskGuard');

describe('dirSizeBytes', () => {
  it('adds up files in nested folders', () => {
    fs.mkdirSync(path.join(dir, 'a'));
    fs.writeFileSync(path.join(dir, 'one'), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, 'a', 'two'), Buffer.alloc(200));
    expect(guard().dirSizeBytes(dir)).toBe(300);
  });
});

describe('assertSourceSize', () => {
  it('deletes the folder and throws 413 when it is too big', async () => {
    fs.writeFileSync(path.join(dir, 'big'), Buffer.alloc(2 * 1024 * 1024));
    await expect(guard().assertSourceSize(dir)).rejects.toMatchObject({ statusCode: 413, expose: true });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('keeps a small folder', async () => {
    fs.writeFileSync(path.join(dir, 'small'), 'x');
    await guard().assertSourceSize(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });
});

describe('assertDiskSpace', () => {
  it('throws 507 when free space is below the minimum', async () => {
    process.env.MIN_FREE_DISK_MB = '999999999';
    await expect(guard().assertDiskSpace(dir)).rejects.toMatchObject({ statusCode: 507 });
  });

  it('does nothing when the check is switched off', async () => {
    process.env.MIN_FREE_DISK_MB = '0';
    await guard().assertDiskSpace(dir);
  });
});
