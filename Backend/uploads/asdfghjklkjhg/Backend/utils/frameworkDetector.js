const fs = require('fs');
const path = require('path');

exports.detectFramework = (sourcePath) => {
  try {
    const pkgJsonPath = path.join(sourcePath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['react-scripts']) {
        return 'React';
      }
      return 'Node.js';
    }
    const requirementsPath = path.join(sourcePath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      return 'Python Flask';
    }
    const managePath = path.join(sourcePath, 'manage.py');
    if (fs.existsSync(managePath)) {
      return 'Django';
    }
    const goModPath = path.join(sourcePath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      return 'Go';
    }
    const indexHtml = path.join(sourcePath, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return 'static HTML';
    }
    return 'Node.js';
  } catch (error) {
    return 'Node.js';
  }
};