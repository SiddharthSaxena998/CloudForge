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