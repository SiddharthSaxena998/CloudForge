const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../utils/dockerfileSupport');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-dockerfile-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('findUserDockerfile', () => {
  it('returns null when there is no Dockerfile', () => {
    expect(D.findUserDockerfile(dir)).toBeNull();
  });

  it('returns the user\'s own Dockerfile', () => {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20\nEXPOSE 8080\n');
    const found = D.findUserDockerfile(dir);
    expect(found).toBeTruthy();
    expect(D.parseExposedPort(found.content)).toBe(8080);
  });

  it('ignores a Dockerfile written by CloudForge (has the marker)', () => {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), `${D.GENERATED_MARKER} for Node.js\nFROM node:22\n`);
    expect(D.findUserDockerfile(dir)).toBeNull();
  });

  it('treats a Dockerfile as the user\'s once the marker is stripped (editor save)', () => {
    const generated = `${D.GENERATED_MARKER} for Node.js\nFROM node:22\nEXPOSE 3000\n`;
    fs.writeFileSync(path.join(dir, 'Dockerfile'), D.stripMarker(generated));
    expect(D.findUserDockerfile(dir)).toBeTruthy();
  });

  it('ignores a symlinked Dockerfile', () => {
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'x');
    fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(dir, 'Dockerfile'));
    expect(D.findUserDockerfile(dir)).toBeNull();
  });
});

describe('parseExposedPort', () => {
  it('finds the first usable tcp port', () => {
    expect(D.parseExposedPort('EXPOSE 3000')).toBe(3000);
    expect(D.parseExposedPort('  expose 5000/tcp 6000')).toBe(5000);
    expect(D.parseExposedPort('EXPOSE $PORT\nEXPOSE 9000')).toBe(9000);
    expect(D.parseExposedPort('EXPOSE 53/udp 8081')).toBe(8081);
  });

  it('returns null for missing or invalid ports', () => {
    expect(D.parseExposedPort('FROM x')).toBeNull();
    expect(D.parseExposedPort('EXPOSE 70000')).toBeNull();
    expect(D.parseExposedPort('EXPOSE 0')).toBeNull();
  });
});

describe('validPort', () => {
  it('accepts whole numbers 1..65535 only', () => {
    expect(D.validPort(1)).toBe(true);
    expect(D.validPort(65535)).toBe(true);
    expect(D.validPort(0)).toBe(false);
    expect(D.validPort(65536)).toBe(false);
    expect(D.validPort(80.5)).toBe(false);
    expect(D.validPort('80')).toBe(false);
  });
});
