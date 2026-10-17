/**
 * Background cleanup so the host disk does not fill up over weeks of deployments.
 *
 *  1. Docker images of old (stopped/failed) deployments are deleted after IMAGE_RETENTION_DAYS.
 *  2. Dangling images and old build cache are pruned.
 *  3. Source folders / stray upload files that no project points to ("orphans") are reported,
 *     or deleted when CLEANUP_ORPHANS=delete. Only entries older than ORPHAN_GRACE_HOURS are touched,
 *     and only below Backend/uploads.
 *
 * Runs every CLEANUP_INTERVAL_MIN minutes (0 = off) and once shortly after start-up.
 */
const fs = require('fs');
const path = require('path');

const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
const { removeImage, pruneDanglingImages, pruneBuildCache } = require('./docker');
const { limits } = require('../config/limits');
const { dirSizeBytes, freeDiskMB, MB } = require('./diskGuard');

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');
const DAY = 24 * 60 * 60 * 1000;
const BATCH = 100;

const safeStat = (p) => {
  try {
    return fs.lstatSync(p);
  } catch (_) {
    return null;
  }
};

async function cleanOldImages(now = Date.now()) {
  const cutoff = new Date(now - limits().imageRetentionDays * DAY);
  const old = await Deployment.find({
    status: { $in: ['stopped', 'failed'] },
    imageRemoved: { $ne: true },
    finishedAt: { $ne: null, $lt: cutoff },
  })
    .sort({ finishedAt: 1 })
    .limit(BATCH)
    .select('_id imageTag');

  let removed = 0;
  for (const dep of old) {
    if (await removeImage(dep.imageTag)) {
      await Deployment.updateOne({ _id: dep._id }, { $set: { imageRemoved: true } });
      removed += 1;
    }
  }
  return removed;
}

/** Source folders below uploads/ that no project references. */
async function findOrphans(now = Date.now()) {
  const grace = limits().orphanGraceHours * 60 * 60 * 1000;
  const referenced = new Set(
    (await Project.find().select('sourcePath').lean())
      .map((p) => p.sourcePath && path.resolve(p.sourcePath))
      .filter(Boolean)
  );

  const candidates = [];
  const consider = (full) => {
    if (referenced.has(full)) return;
    const st = safeStat(full);
    if (!st || now - st.mtimeMs < grace) return; // too young: may belong to a request still running
    candidates.push({ full, isDir: st.isDirectory() });
  };

  let top = [];
  try {
    top = fs.readdirSync(UPLOADS_ROOT);
  } catch (_) {
    return [];
  }
  for (const name of top) {
    const full = path.join(UPLOADS_ROOT, name);
    if (name === 'repos') {
      // GitHub clones live one level deeper: uploads/repos/<timestamp-id>
      for (const sub of fs.readdirSync(full)) consider(path.join(full, sub));
    } else if (name !== '.gitkeep') {
      consider(full);
    }
  }
  return candidates;
}

async function cleanOrphans(now = Date.now()) {
  const orphans = await findOrphans(now);
  const mode = limits().cleanupOrphans;
  let bytes = 0;
  let removed = 0;
  for (const { full, isDir } of orphans) {
    const size = isDir ? dirSizeBytes(full) : (safeStat(full)?.size || 0);
    bytes += size;
    if (mode === 'delete' && full.startsWith(UPLOADS_ROOT + path.sep)) {
      await fs.promises.rm(full, { recursive: true, force: true });
      removed += 1;
    }
  }
  return { found: orphans.length, removed, bytes };
}

async function runCleanup() {
  const report = { images: 0, orphans: null, reclaimedMB: 0, freeDiskMB: null };
  try {
    report.images = await cleanOldImages();
    report.reclaimedMB += Math.round(((await pruneDanglingImages()) || 0) / MB);
    report.reclaimedMB += Math.round(((await pruneBuildCache()) || 0) / MB);
    report.orphans = await cleanOrphans();
    report.freeDiskMB = await freeDiskMB(UPLOADS_ROOT);
    const o = report.orphans;
    console.log(
      `[cleanup] old images removed: ${report.images}, docker reclaimed: ${report.reclaimedMB} MB, ` +
        `orphan source folders: ${o.found} (${Math.round(o.bytes / MB)} MB, ` +
        `${limits().cleanupOrphans === 'delete' ? `${o.removed} deleted` : 'not deleted: set CLEANUP_ORPHANS=delete'}), ` +
        `free disk: ${report.freeDiskMB ?? '?'} MB`
    );
  } catch (error) {
    console.error('[cleanup] failed:', error.message); // never crash the server because of cleanup
  }
  return report;
}

function startCleanupJob() {
  const minutes = limits().cleanupIntervalMin;
  if (!minutes) {
    console.log('[cleanup] disabled (CLEANUP_INTERVAL_MIN=0)');
    return null;
  }
  setTimeout(runCleanup, 30 * 1000).unref(); // first run shortly after start
  const timer = setInterval(runCleanup, minutes * 60 * 1000);
  timer.unref();
  console.log(`[cleanup] every ${minutes} min (images older than ${limits().imageRetentionDays} days)`);
  return timer;
}

module.exports = { runCleanup, startCleanupJob, cleanOldImages, findOrphans, cleanOrphans };
