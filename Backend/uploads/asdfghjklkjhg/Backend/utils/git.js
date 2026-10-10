const git = require('simple-git');
const path = require('path');

exports.cloneRepo = (repoUrl, destDir) => {
  return new Promise((resolve, reject) => {
    const repoName = repoUrl.split('/').pop();
    const destPath = path.join(destDir, repoName);

    git()
      .clone(repoUrl, destPath)
      .then(() => destPath)
      .catch(reject);
  });
};