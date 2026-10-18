// const git = require('simple-git');
// const path = require('path');

// exports.cloneRepo = (repoUrl, destDir) => {
//   return new Promise((resolve, reject) => {
//     const repoName = repoUrl.split('/').pop();
//     const destPath = path.join(destDir, repoName);

//     git()
//       .clone(repoUrl, destPath)
//       .then(() => destPath)
//       .catch(reject);
//   });
// };


const git = require('simple-git');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isValidBranch } = require('./validators');

const REPOS_ROOT = path.join(__dirname, '..', 'uploads', 'repos');

exports.cloneRepo = async (repoUrl, projectName, branch) => {
  fs.mkdirSync(REPOS_ROOT, { recursive: true });

  // Unique folder every time, so it never collides with an old clone
  const folderName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const destPath = path.join(REPOS_ROOT, folderName);

  const options = ['--depth', '1'];
  if (branch) options.push('--branch', branch);

  await git().clone(repoUrl, destPath, options);
  return destPath;
};

/**
 * Brings a cloned GitHub project up to the newest commit of its branch before a redeploy.
 *  - files edited in the dashboard editor are never overwritten: with local edits the pull is skipped
 *  - the Dockerfile CloudForge generates is restored first (it may overwrite a tracked Dockerfile)
 * Returns { updated, before, commit } or { skipped, commit }.
 */
exports.pullLatest = async (dir, branch) => {
  if (!isValidBranch(branch)) throw new Error('Invalid branch name');

  const g = git({ baseDir: dir, timeout: { block: 120000 } });
  const shortHead = async () => (await g.revparse(['--short', 'HEAD'])).trim();

  const before = await shortHead();

  try {
    await g.raw(['checkout', '--', 'Dockerfile']);
  } catch (_) {
    // Dockerfile is not tracked by the repo: nothing to restore
  }

  const dirty = (await g.raw(['status', '--porcelain', '--untracked-files=no'])).trim();
  if (dirty) return { skipped: 'local edits', commit: before };

  await g.raw(['fetch', '--depth', '1', 'origin', branch]);
  await g.raw(['reset', '--hard', 'FETCH_HEAD']);

  const commit = await shortHead();
  return { updated: commit !== before, before, commit };
};
