const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

exports.extract = (archivePath, destDir) => {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(destDir, { recursive: true });

      const ext = path.extname(archivePath).toLowerCase();

      let command;
      let args;

      if (ext === '.zip') {
        command = 'unzip';
        args = ['-o', archivePath, '-d', destDir];
      } else if (ext === '.gz' || ext === '.tgz') {
        command = 'tar';
        args = ['-xzf', archivePath, '-C', destDir];
      } else {
        return reject(
          new Error('Unsupported archive format')
        );
      }

      execFile(command, args, (err, stdout, stderr) => {
        if (err) {
          console.error(
            'Archive extraction error:',
            stderr || err.message
          );
          return reject(err);
        }

        try {
          flattenSingleFolder(destDir);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};

const flattenSingleFolder = (destDir) => {
  const entries = fs.readdirSync(destDir, {
    withFileTypes: true,
  });

  const dirs = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile());

  // Only flatten if archive contains exactly
  // one top-level folder and no top-level files.
  if (dirs.length !== 1 || files.length !== 0) {
    return;
  }

  const innerDir = path.join(
    destDir,
    dirs[0].name
  );

  const innerEntries = fs.readdirSync(innerDir, {
    withFileTypes: true,
  });

  // Move contents of the inner folder into destDir.
  // Do NOT rename innerDir directly onto destDir,
  // because destDir already exists and is not empty.
  for (const entry of innerEntries) {
    const source = path.join(
      innerDir,
      entry.name
    );

    const target = path.join(
      destDir,
      entry.name
    );

    if (fs.existsSync(target)) {
      fs.rmSync(target, {
        recursive: true,
        force: true,
      });
    }

    fs.renameSync(source, target);
  }

  // Remove empty wrapper folder.
  fs.rmSync(innerDir, {
    recursive: true,
    force: true,
  });
};

exports.detectFramework = (sourcePath) => {
  try {
    const pkgJsonPath = path.join(
      sourcePath,
      'package.json'
    );

    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(
        fs.readFileSync(pkgJsonPath, 'utf-8')
      );

      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      if (deps['react-scripts']) {
        return 'React';
      }

      return 'Node.js';
    }

    if (
      fs.existsSync(
        path.join(sourcePath, 'requirements.txt')
      )
    ) {
      return 'Python Flask';
    }

    if (
      fs.existsSync(
        path.join(sourcePath, 'manage.py')
      )
    ) {
      return 'Django';
    }

    if (
      fs.existsSync(
        path.join(sourcePath, 'go.mod')
      )
    ) {
      return 'Go';
    }

    if (
      fs.existsSync(
        path.join(sourcePath, 'index.html')
      )
    ) {
      return 'static HTML';
    }

    return 'Node.js';
  } catch {
    return 'Node.js';
  }
};