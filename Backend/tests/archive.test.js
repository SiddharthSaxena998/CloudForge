const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let work;
beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-archive-'));
  process.env.MAX_SOURCE_MB = '1';
});
afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
  delete process.env.MAX_SOURCE_MB;
});

const makeSource = (withBomb) => {
  const src = path.join(work, 'src');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'package.json'), '{}');
  if (withBomb) fs.writeFileSync(path.join(src, 'zeros'), Buffer.alloc(30 * 1024 * 1024)); // compresses to ~30 KB
  return src;
};

describe('archive.extract', () => {
  it('rejects a zip bomb with 413 and removes what it unpacked', async () => {
    const src = makeSource(true);
    execSync('zip -q ../bomb.zip zeros package.json', { cwd: src });
    const dest = path.join(work, 'out-zip');
    await expect(require('../utils/archive').extract(path.join(work, 'bomb.zip'), dest)).rejects.toMatchObject({ statusCode: 413 });
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('rejects a tar.gz bomb too', async () => {
    const src = makeSource(true);
    execSync('tar -czf ../bomb.tar.gz zeros package.json', { cwd: src });
    const dest = path.join(work, 'out-tar');
    await expect(require('../utils/archive').extract(path.join(work, 'bomb.tar.gz'), dest)).rejects.toMatchObject({ statusCode: 413 });
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('unpacks a normal archive', async () => {
    const src = makeSource(false);
    execSync('zip -q ../ok.zip package.json', { cwd: src });
    const dest = path.join(work, 'okdest');
    await require('../utils/archive').extract(path.join(work, 'ok.zip'), dest);
    expect(fs.existsSync(path.join(dest, 'package.json'))).toBe(true);
  });
});
