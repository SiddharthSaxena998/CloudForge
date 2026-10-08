// const Project = require('../models/Project');
// const Log = require('../models/Log');
// const User = require('../models/User');
// const path = require('path');
// const fs = require('fs');
// const safeArchive = require('../utils/archive');
// const git = require('../utils/git');

// exports.getProjects = async (req, res, next) => {
//   try {
//     const projects = await Project.find({ owner: req.user._id }).sort({ createdAt: -1 });
//     res.json(projects);
//   } catch (error) {
//     next(error);
//   }
// };

// exports.createProject = async (req, res, next) => {
//   try {
//     const { name, description, sourceType, repo, repoUrl: repoUrlBody, branch, archiveName } = req.body;
//     const finalRepoUrl = repo || repoUrlBody;
//     let sourcePath = '';
//     let framework = '';

//     if (sourceType === 'github') {
//       if (!finalRepoUrl) {
//         return res.status(400).json({ message: 'GitHub repo URL is required' });
//       }
//       sourcePath = await git.cloneRepo(finalRepoUrl, name, branch);
//     } else if (sourceType === 'upload') {
//       if (!req.file) {
//         return res.status(400).json({ message: 'Archive file is required' });
//       }
//       const uploadDir = path.join(__dirname, '..', 'uploads', name);
//       await safeArchive.extract(req.file.path, uploadDir);
//       sourcePath = uploadDir;
//       framework = safeArchive.detectFramework(uploadDir);
//     } else {
//       return res.status(400).json({ message: 'Invalid sourceType' });
//     }

//     // Auto-detect framework if not explicitly provided
//     if (!framework && sourceType === 'upload') {
//       framework = safeArchive.detectFramework(uploadDir);
//     }

//     const project = await Project.create({
//       owner: req.user._id,
//       name,
//       description,
//       sourceType,
//       repoUrl: finalRepoUrl,
//       branch,
//       sourcePath,
//       framework,
//       status: sourceType === 'github' ? 'active' : 'building',
//     });

//     res.status(201).json(project);
//   } catch (error) {
//     next(error);
//   }
// };

// exports.getProjectById = async (req, res, next) => {
//   try {
//     const project = await Project.findById(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }
//     res.json(project);
//   } catch (error) {
//     next(error);
//   }
// };

// exports.updateProject = async (req, res, next) => {
//   try {
//     const { name, description, branch, envVars } = req.body;
//     const project = await Project.findById(req.params.id);

//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }

//     if (name !== undefined) project.name = name;
//     if (description !== undefined) project.description = description;
//     if (branch !== undefined) project.branch = branch;
//     if (envVars !== undefined) project.envVars = envVars;

//     await project.save();
//     res.json(project);
//   } catch (error) {
//     next(error);
//   }
// };

// exports.deleteProject = async (req, res, next) => {
//   try {
//     const project = await Project.findByIdAndDelete(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }
//     res.json({ message: 'Project deleted successfully' });
//   } catch (error) {
//     next(error);
//   }
// };

// exports.getProjectFiles = async (req, res, next) => {
//   try {
//     const project = await Project.findById(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }

//     const filesDir = path.join(__dirname, '..', 'uploads', project.name);
//     if (!fs.existsSync(filesDir)) {
//       return res.json([]);
//     }

//     const files = [];
//     const readDir = (dir) => {
//       const entries = fs.readdirSync(dir, { withFileTypes: true });
//       for (const entry of entries) {
//         const fullPath = path.join(dir, entry.name);
//         if (entry.isDirectory()) {
//           readDir(fullPath);
//         } else {
//           const relPath = path.relative(filesDir, fullPath);
//           files.push({ path: relPath, content: null });
//         }
//       }
//     };
//     readDir(filesDir);

//     res.json(files);
//   } catch (error) {
//     next(error);
//   }
// };

// exports.getFileContent = async (req, res, next) => {
//   try {
//     const project = await Project.findById(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }

//     const filePath = path.join(__dirname, '..', 'uploads', project.name, req.query.path);
//     const resolvedPath = path.resolve(filePath);

//     // Path traversal protection: ensure resolved path is inside project folder
//     const projectBase = path.resolve(path.join(__dirname, '..', 'uploads', project.name));
//     if (!resolvedPath.startsWith(projectBase + path.sep) && resolvedPath !== projectBase) {
//       return res.status(403).json({ message: 'Path traversal detected' });
//     }

//     if (!fs.existsSync(resolvedPath)) {
//       return res.status(404).json({ message: 'File not found' });
//     }

//     const content = fs.readFileSync(resolvedPath, 'utf-8');
//     res.json({ path: req.query.path, content });
//   } catch (error) {
//     next(error);
//   }
// };

// exports.saveFileContent = async (req, res, next) => {
//   try {
//     const project = await Project.findById(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }

//     const filePath = path.join(__dirname, '..', 'uploads', project.name, req.body.path);
//     const resolvedPath = path.resolve(filePath);

//     // Path traversal protection
//     const projectBase = path.resolve(path.join(__dirname, '..', 'uploads', project.name));
//     if (!resolvedPath.startsWith(projectBase + path.sep) && resolvedPath !== projectBase) {
//       return res.status(403).json({ message: 'Path traversal detected' });
//     }

//     // Ensure directory exists
//     const dirPath = path.dirname(resolvedPath);
//     if (!fs.existsSync(dirPath)) {
//       fs.mkdirSync(dirPath, { recursive: true });
//     }

//     fs.writeFileSync(resolvedPath, req.body.content, 'utf-8');
//     res.json({ path: req.body.path, success: true });
//   } catch (error) {
//     next(error);
//   }
// };

// exports.getEnvVars = async (req, res, next) => {
//   try {
//     const project = await Project.findById(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }

//     res.json({ vars: project.envVars });
//   } catch (error) {
//     next(error);
//   }
// };

// exports.updateEnvVars = async (req, res, next) => {
//   try {
//     const project = await Project.findById(req.params.id);
//     if (!project) {
//       return res.status(404).json({ message: 'Project not found' });
//     }

//     project.envVars = req.body.vars || [];
//     await project.save();
//     res.json({ success: true });
//   } catch (error) {
//     next(error);
//   }
// };




const Project = require('../models/Project');
const path = require('path');
const fs = require('fs');
const safeArchive = require('../utils/archive');
const git = require('../utils/git');

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;
const GITHUB_RE = /^(https?:\/\/)?github\.com\/[\w.-]+\/[\w.-]+/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next']);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 200 * 1024;

// ---------- helpers ----------
const findOwned = (req) =>
  Project.findOne({ _id: req.params.id, owner: req.user._id });

const baseDirOf = (project) =>
  project.sourcePath ? path.resolve(project.sourcePath) : null;

const resolveInside = (base, rel) => {
  if (!base || typeof rel !== 'string' || !rel) return null;
  const resolved = path.resolve(base, rel);
  return resolved.startsWith(base + path.sep) ? resolved : null;
};

const sanitizeEnv = (input) => {
  const list = Array.isArray(input) ? input : Array.isArray(input?.vars) ? input.vars : null;
  if (!list) return null;
  const map = new Map();
  for (const item of list) {
    const key = String(item?.key ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (key) map.set(key, String(item?.value ?? ''));
  }
  return [...map].map(([key, value]) => ({ key, value }));
};

// ---------- projects ----------
exports.getProjects = async (req, res, next) => {
  try {
    const projects = await Project.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    next(error);
  }
};

exports.createProject = async (req, res, next) => {
  const tmpFile = req.file?.path;
  try {
    const { name, description = '', repo, repoUrl, branch = '' } = req.body;
    const sourceType = req.body.sourceType === 'upload' ? 'archive' : req.body.sourceType;
    const finalRepoUrl = repo || repoUrl || '';

    if (!NAME_RE.test(name || '')) {
      return res.status(400).json({ message: 'Use 2-39 lowercase letters, numbers or hyphens.' });
    }
    if (await Project.exists({ name })) {
      return res.status(409).json({ message: 'A project with that name already exists.' });
    }

    let sourcePath = '';
    let archiveName = '';

    if (sourceType === 'github') {
      if (!GITHUB_RE.test(finalRepoUrl)) {
        return res.status(400).json({ message: 'Enter a valid GitHub URL.' });
      }
      if (!branch.trim()) {
        return res.status(400).json({ message: 'Branch is required.' });
      }
      sourcePath = await git.cloneRepo(finalRepoUrl, name, branch.trim());
    } else if (sourceType === 'archive') {
      if (!req.file) {
        return res.status(400).json({ message: 'Archive file is required' });
      }
      const dest = path.join(UPLOADS_ROOT, name);
      await safeArchive.extract(req.file.path, dest);
      sourcePath = dest;
      archiveName = req.file.originalname;
    } else {
      return res.status(400).json({ message: 'Invalid sourceType' });
    }

    const framework = safeArchive.detectFramework(sourcePath) || '';

    const project = await Project.create({
      owner: req.user._id,
      name,
      description,
      sourceType,
      repoUrl: sourceType === 'github' ? finalRepoUrl : '',
      archiveName,
      branch: sourceType === 'github' ? branch.trim() : '',
      sourcePath,
      framework,
      status: 'stopped', // deploy hone par building -> running hoga
    });

    res.status(201).json(project);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A project with that name already exists.' });
    }
    next(error);
  } finally {
    if (tmpFile) fs.promises.rm(tmpFile, { force: true }).catch(() => {});
  }
};

exports.getProjectById = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (error) {
    next(error);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const { description, branch, envVars } = req.body; // name rename allowed nahi (domain/folder isi se bante hain)
    if (description !== undefined) project.description = description;
    if (branch !== undefined) project.branch = branch;
    if (envVars !== undefined) {
      const clean = sanitizeEnv(envVars);
      if (clean) project.envVars = clean;
    }

    await project.save();
    res.json(project);
  } catch (error) {
    next(error);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // sirf uploads folder ke andar wali directory delete karo
    const base = baseDirOf(project);
    if (base && base.startsWith(UPLOADS_ROOT + path.sep)) {
      await fs.promises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
    // TODO: is project ke deployments / containers / logs bhi delete karo

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ---------- files ----------
exports.getProjectFiles = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const base = baseDirOf(project);
    if (!base || !fs.existsSync(base)) return res.json([]);

    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (files.length >= MAX_FILES) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(full);
        } else if (entry.isFile()) {
          const { size } = fs.statSync(full);
          if (size > MAX_FILE_BYTES) continue;
          const buf = fs.readFileSync(full);
          if (buf.includes(0)) continue; // binary skip, warna editor se overwrite ho jayegi
          files.push({
            path: path.relative(base, full).split(path.sep).join('/'),
            content: buf.toString('utf-8'),
          });
        }
      }
    };
    walk(base);

    res.json(files);
  } catch (error) {
    next(error);
  }
};

exports.getFileContent = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const target = resolveInside(baseDirOf(project), req.query.path);
    if (!target) return res.status(403).json({ message: 'Invalid file path' });
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.json({ path: req.query.path, content: fs.readFileSync(target, 'utf-8') });
  } catch (error) {
    next(error);
  }
};

exports.saveFileContent = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const { path: relPath, content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ message: 'File content must be a string' });
    }
    const target = resolveInside(baseDirOf(project), relPath);
    if (!target) return res.status(403).json({ message: 'Invalid file path' });

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');

    res.json({ path: relPath, content, success: true });
  } catch (error) {
    next(error);
  }
};

// ---------- env vars ----------
exports.getEnvVars = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    res.json(project.envVars.map(({ key, value }) => ({ key, value })));
  } catch (error) {
    next(error);
  }
};

exports.updateEnvVars = async (req, res, next) => {
  try {
    const project = await findOwned(req);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const clean = sanitizeEnv(req.body);
    if (!clean) return res.status(400).json({ message: 'Expected an array of { key, value }' });

    project.envVars = clean;
    await project.save();
    res.json(clean);
  } catch (error) {
    next(error);
  }
};