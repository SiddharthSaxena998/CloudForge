/**
 * Disk protection helpers: size of a folder, free space of the volume that holds uploads,
 * and guards that stop one user from filling the host disk.
 */
const fs = require('fs');
const path = require('path');
const { limits } = require('../config/limits');

const MB = 1024 * 1024;

/** Total bytes of regular files below `dir` (symlinks are counted as links, never followed). */
function dirSizeBytes(dir, stopAfterBytes = Infinity) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) stack.push(full);
        else total += fs.lstatSync(full).size;
      } catch (_) {
        /* file vanished while scanning */
      }
      if (total > stopAfterBytes) return total; // early exit, we only need "too big?"
    }
  }
  return total;
}

/** Free space (MB) of the volume that contains `dir`, or null if the platform cannot tell. */
async function freeDiskMB(dir) {
  try {
    const s = await fs.promises.statfs(dir);
    return Math.floor((Number(s.bavail) * Number(s.bsize)) / MB);
  } catch (_) {
    return null;
  }
}

function httpError(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.expose = true; // safe to show this message to the user (see middleware/error-handler.js)
  return e;
}

/** Throws a 507 when the host is nearly out of disk. Unknown free space = allow. */
async function assertDiskSpace(dir) {
  const min = limits().minFreeDiskMB;
  if (!min) return;
  const free = await freeDiskMB(dir);
  if (free !== null && free < min) {
    throw httpError(507, 'The server is low on disk space right now. Please try again later.');
  }
}

/** Throws a 413 (and deletes the folder) when a project's unpacked source is too large. */
async function assertSourceSize(dir) {
  const maxBytes = limits().maxSourceMB * MB;
  if (dirSizeBytes(dir, maxBytes) > maxBytes) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw httpError(413, `Project is too large (max ${limits().maxSourceMB} MB unpacked).`);
  }
}

module.exports = { dirSizeBytes, freeDiskMB, assertDiskSpace, assertSourceSize, httpError, MB };
