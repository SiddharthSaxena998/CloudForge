const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

exports.extract = (archivePath, destDir) => {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });

    const ext = path.extname(archivePath);
    const command = ext === '.gz'
      ? `tar -xzf ${archivePath} -C ${destDir}`
      : ext === '.zip'
      ? `unzip -o ${archivePath} -d ${destDir}`
      : null;

    if (!command) return reject(new Error('Unsupported archive format'));

    exec(command, (err) => {
      if (err) return reject(err);
      flattenSingleFolder(destDir);
      resolve();
    });
  });
};

const flattenSingleFolder = (destDir) => {
  const entries = fs.readdirSync(destDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());

  if (dirs.length === 1 && files.length === 0) {
    const innerDir = path.join(destDir, dirs[0].name);
    fs.renameSync(innerDir, destDir);
  }
};

exports.detectFramework = (sourcePath) => {
  try {
    const pkgJsonPath = path.join(sourcePath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['react-scripts']) return 'React';
      return 'Node.js';
    }
    if (fs.existsSync(path.join(sourcePath, 'requirements.txt'))) return 'Python Flask';
    if (fs.existsSync(path.join(sourcePath, 'manage.py'))) return 'Django';
    if (fs.existsSync(path.join(sourcePath, 'go.mod'))) return 'Go';
    if (fs.existsSync(path.join(sourcePath, 'index.html'))) return 'static HTML';
    return 'Node.js';
  } catch {
    return 'Node.js';
  }
};