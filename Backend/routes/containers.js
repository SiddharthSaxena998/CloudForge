const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ownershipCheck = require('../middleware/ownership-check');
const containerController = require('../controllers/containerController');

router.use(authenticate);

router.get('/', containerController.getContainers);
router.post('/:id/stop', ownershipCheck, containerController.stopContainer);

module.exports = router;