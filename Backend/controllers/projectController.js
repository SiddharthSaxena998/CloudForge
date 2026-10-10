
const Project = require('../models/Project');
const Container = require('../models/Container');
const Deployment = require('../models/Deployment');
const Log = require('../models/Log');
const path = require('path');
const fs = require('fs');
const safeArchive = require('../utils/archive');
const git = require('../utils/git');
const {
  assertContainerStopped: assertDockerContainerStopped,
  deleteContainer: deleteDockerContainer,
} = require('../utils/docker');

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
    const project = await Project.findOne({
      _id: req.params.id,
      owner: req.user._id,
    });

    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (project.status !== 'stopped') {
      return res.status(409).json({
        message: 'Only stopped projects can be deleted.',
      });
    }

    const activeDeployment = await Deployment.exists({
      project: project._id,
      status: { $in: ['running', 'building', 'pending'] },
    });

    if (activeDeployment || ['running', 'building'].includes(project.status)) {
      return res.status(409).json({
        message: 'Stop all active deployments before deleting this project.',
      });
    }

    const containers = await Container.find({ project: project._id });
    const activeContainer = containers.some((container) =>
      ['running', 'building', 'pending'].includes(container.status)
    );

    if (activeContainer) {
      return res.status(409).json({
        message: 'Stop all containers before deleting this project.',
      });
    }

    // Preflight every Docker resource before removing any, avoiding partial
    // cleanup when a DB status is stale and a later container is still running.
    for (const container of containers) {
      await assertDockerContainerStopped(container.containerId);
    }

    for (const container of containers) {
      await deleteDockerContainer(container.containerId);
    }

    const deployments = await Deployment.find({ project: project._id }).select('_id');
    const deploymentIds = deployments.map((deployment) => deployment._id);

    await Container.deleteMany({ project: project._id });
    await Log.deleteMany({ deployment: { $in: deploymentIds } });
    await Deployment.deleteMany({ _id: { $in: deploymentIds } });

    // Only remove project data stored beneath the managed uploads directory.
    const base = baseDirOf(project);
    if (base && base.startsWith(UPLOADS_ROOT + path.sep)) {
      await fs.promises.rm(base, { recursive: true, force: true });
    }

    await Project.deleteOne({ _id: project._id });

    return res.json({
      success: true,
      message: 'Project and associated resources deleted successfully',
    });
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
