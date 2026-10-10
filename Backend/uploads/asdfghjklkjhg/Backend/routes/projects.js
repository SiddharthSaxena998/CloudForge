const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ownershipCheck = require('../middleware/ownership-check');
const upload = require('../middleware/upload');
const projectController = require('../controllers/projectController');

// All project routes require authentication
router.use(authenticate);

// Project CRUD + file operations
router.get('/', projectController.getProjects);
router.post('/', upload.single('archive'), projectController.createProject);
router.get('/:id', ownershipCheck, projectController.getProjectById);
router.put('/:id', ownershipCheck, projectController.updateProject);
router.delete('/:id', ownershipCheck, projectController.deleteProject);

// File browser/editor
router.get('/:id/files', ownershipCheck, projectController.getProjectFiles);
router.get('/:id/files/content', ownershipCheck, projectController.getFileContent);
router.put('/:id/files/content', ownershipCheck, projectController.saveFileContent);

module.exports = router;