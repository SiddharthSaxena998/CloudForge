const fs = require('fs');
const path = require('path');

const isInside = (base, target) => target.startsWith(base + path.sep);

/**
 * Resolve `rel` inside `base` and make sure the result cannot escape through
 * "../" OR through symlinks (an uploaded archive may contain a symlink such as
 * `evil -> /etc/passwd`; a plain path.resolve() check would not notice).
 * Returns the absolute path, or null if it is unsafe.
 */
function resolveInside(base, rel) {
  if (!base || typeof rel !== 'string' || !rel || rel.includes('\0')) return null;

  let baseReal;
  try {
    baseReal = fs.realpathSync(base);
  } catch (_) {
    return null;
  }

  const target = path.resolve(baseReal, rel);
  if (!isInside(baseReal, target)) return null;

  // Check the real location of the deepest part of the path that exists.
  let probe = target;
  for (;;) {
    try {
      const real = fs.realpathSync(probe);
      return isInside(baseReal, real) ? target : null;
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
      try {
        // A dangling symlink would let a write create a file outside base.
        if (fs.lstatSync(probe).isSymbolicLink()) return null;
      } catch (_) {
        /* does not exist at all: fine, check its parent */
      }
      const parent = path.dirname(probe);
      if (parent === probe) return null;
      probe = parent;
    }
  }
}

module.exports = { resolveInside };
