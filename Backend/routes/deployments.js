const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ownershipCheck = require('../middleware/ownership-check');
const deploymentController = require('../controllers/deploymentController');

router.use(authenticate);

router.post('/projects/:id/deploy', ownershipCheck, deploymentController.triggerDeployment);
router.get('/', deploymentController.getDeployments);
router.get('/:id', deploymentController.getDeploymentById);
router.get('/:id/logs', deploymentController.getDeploymentLogs);

module.exports = router;
