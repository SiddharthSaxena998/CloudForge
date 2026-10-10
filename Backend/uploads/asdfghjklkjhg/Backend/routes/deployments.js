const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ownershipCheck = require('../middleware/ownership-check');
const deploymentController = require('../controllers/deploymentController');

router.use(authenticate);

router.post('/projects/:id/deploy', ownershipCheck, deploymentController.triggerDeployment);
router.get('/deployments', deploymentController.getDeployments);
router.get('/deployments/:id', deploymentController.getDeploymentById);
router.get('/deployments/:id/logs', deploymentController.getDeploymentLogs);

module.exports = router;