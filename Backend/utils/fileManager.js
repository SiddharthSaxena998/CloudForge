const fs = require('fs');
const path = require('path');

exports.ensureSafePath = (baseDir, userInput) => {
  const resolved = path.resolve(path.join(baseDir, userInput));
  const base = path.resolve(baseDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
};

exports.writeDockerfile = (sourcePath, dockerfileContent) => {
  const dockerfilePath = path.join(sourcePath, 'Dockerfile');
  fs.writeFileSync(dockerfilePath, dockerfileContent, 'utf-8');
  return dockerfilePath;
};

exports.listFilesRecursive = (baseDir) => {
  const files = [];
  const readDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readDir(fullPath);
      } else {
        const relPath = path.relative(baseDir, fullPath);
        files.push(relPath);
      }
    }
  };
  readDir(baseDir);
  return files;
};

exports.readFileSafe = (baseDir, relativePath) => {
  const safePath = exports.ensureSafePath(baseDir, relativePath);
  if (!fs.existsSync(safePath)) {
    throw new Error('File not found');
  }
  return fs.readFileSync(safePath, 'utf-8');
};

exports.writeFileSafe = (baseDir, relativePath, content) => {
  const safePath = exports.ensureSafePath(baseDir, relativePath);
  fs.mkdirSync(path.dirname(safePath), { recursive: true });
  fs.writeFileSync(safePath, content, 'utf-8');
  return safePath;
};