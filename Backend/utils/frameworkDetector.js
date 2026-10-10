
const fs = require('fs');
const path = require('path');

exports.detectFramework = (sourcePath) => {
  try {
    const packagePath = path.join(sourcePath, 'package.json');

    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(
        fs.readFileSync(packagePath, 'utf8')
      );

      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      if (deps.next) return 'Next.js';

      if (deps['react-scripts']) return 'React';

      if (deps.vite && deps.react) return 'React';

      return 'Node.js';
    }

    if (fs.existsSync(path.join(sourcePath, 'manage.py'))) {
      return 'Django';
    }

    if (fs.existsSync(path.join(sourcePath, 'requirements.txt'))) {
      return 'Python Flask';
    }

    if (fs.existsSync(path.join(sourcePath, 'go.mod'))) {
      return 'Go';
    }

    if (fs.existsSync(path.join(sourcePath, 'index.html'))) {
      return 'static HTML';
    }

    return 'Node.js';
  } catch (error) {
    console.error('Framework detection failed:', error.message);
    return 'Node.js';
  }
};
