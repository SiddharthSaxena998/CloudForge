const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ownershipCheck = require('../middleware/ownership-check');
const upload = require('../middleware/upload');
const projectController = require('../controllers/projectController');
const deploymentController = require('../controllers/deploymentController');
const { heavyLimiter } = require('../config/security');

// All project routes require authentication
router.use(authenticate);

// Project CRUD
router.get('/', projectController.getProjects);
router.post('/', heavyLimiter, upload.single('archive'), projectController.createProject);
router.get('/:id', ownershipCheck, projectController.getProjectById);
router.put('/:id', ownershipCheck, projectController.updateProject);
router.delete('/:id', ownershipCheck, projectController.deleteProject);

// Deploy (frontend: POST /projects/:id/deploy)
router.post('/:id/deploy', heavyLimiter, ownershipCheck, deploymentController.triggerDeployment);

// File browser/editor
router.get('/:id/files', ownershipCheck, projectController.getProjectFiles);
router.get('/:id/files/content', ownershipCheck, projectController.getFileContent);
router.put('/:id/files/content', ownershipCheck, projectController.saveFileContent);
// the dashboard's editor saves with PUT /:id/files (same handler)
router.put('/:id/files', ownershipCheck, projectController.saveFileContent);

// Env vars
router.get('/:id/env', ownershipCheck, projectController.getEnvVars);
router.put('/:id/env', ownershipCheck, projectController.updateEnvVars);

module.exports = router;