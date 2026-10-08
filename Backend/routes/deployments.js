const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const deploymentController = require('../controllers/deploymentController');

router.use(authenticate);

router.get('/', deploymentController.getDeployments);
router.get('/:id', deploymentController.getDeploymentById);
router.get('/:id/logs', deploymentController.getDeploymentLogs);

module.exports = router;