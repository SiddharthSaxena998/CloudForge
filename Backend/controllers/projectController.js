const Project = require('../models/Project');
const Log = require('../models/Log');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const safeArchive = require('../utils/archive');
const git = require('../utils/git');

exports.getProjects = async (req, res, next) => {
  try {
    const projects = await Project.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    next(error);
  }
};

exports.createProject = async (req, res, next) => {
  try {
    const { name, description, sourceType, repo, repoUrl: repoUrlBody, branch, archiveName } = req.body;
    const finalRepoUrl = repo || repoUrlBody;
    let sourcePath = '';
    let framework = '';

    if (sourceType === 'github') {
      if (!finalRepoUrl) {
        return res.status(400).json({ message: 'GitHub repo URL is required' });
      }
      sourcePath = await git.cloneRepo(finalRepoUrl, name, branch);
    } else if (sourceType === 'upload') {
      if (!req.file) {
        return res.status(400).json({ message: 'Archive file is required' });
      }
      const uploadDir = path.join(__dirname, '..', 'uploads', name);
      await safeArchive.extract(req.file.path, uploadDir);
      sourcePath = uploadDir;
      framework = safeArchive.detectFramework(uploadDir);
    } else {
      return res.status(400).json({ message: 'Invalid sourceType' });
    }

    // Auto-detect framework if not explicitly provided
    if (!framework && sourceType === 'upload') {
      framework = safeArchive.detectFramework(uploadDir);
    }

    const project = await Project.create({
      owner: req.user._id,
      name,
      description,
      sourceType,
      repoUrl: finalRepoUrl,
      branch,
      sourcePath,
      framework,
      status: sourceType === 'github' ? 'active' : 'building',
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
};

exports.getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    next(error);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const { name, description, branch, envVars } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (branch !== undefined) project.branch = branch;
    if (envVars !== undefined) project.envVars = envVars;

    await project.save();
    res.json(project);
  } catch (error) {
    next(error);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getProjectFiles = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const filesDir = path.join(__dirname, '..', 'uploads', project.name);
    if (!fs.existsSync(filesDir)) {
      return res.json([]);
    }

    const files = [];
    const readDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          readDir(fullPath);
        } else {
          const relPath = path.relative(filesDir, fullPath);
          files.push({ path: relPath, content: null });
        }
      }
    };
    readDir(filesDir);

    res.json(files);
  } catch (error) {
    next(error);
  }
};

exports.getFileContent = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', project.name, req.query.path);
    const resolvedPath = path.resolve(filePath);

    // Path traversal protection: ensure resolved path is inside project folder
    const projectBase = path.resolve(path.join(__dirname, '..', 'uploads', project.name));
    if (!resolvedPath.startsWith(projectBase + path.sep) && resolvedPath !== projectBase) {
      return res.status(403).json({ message: 'Path traversal detected' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    res.json({ path: req.query.path, content });
  } catch (error) {
    next(error);
  }
};

exports.saveFileContent = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const filePath = path.join(__dirname, '..', 'uploads', project.name, req.body.path);
    const resolvedPath = path.resolve(filePath);

    // Path traversal protection
    const projectBase = path.resolve(path.join(__dirname, '..', 'uploads', project.name));
    if (!resolvedPath.startsWith(projectBase + path.sep) && resolvedPath !== projectBase) {
      return res.status(403).json({ message: 'Path traversal detected' });
    }

    // Ensure directory exists
    const dirPath = path.dirname(resolvedPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, req.body.content, 'utf-8');
    res.json({ path: req.body.path, success: true });
  } catch (error) {
    next(error);
  }
};

exports.getEnvVars = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ vars: project.envVars });
  } catch (error) {
    next(error);
  }
};

exports.updateEnvVars = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    project.envVars = req.body.vars || [];
    await project.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};