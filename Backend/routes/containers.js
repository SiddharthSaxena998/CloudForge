const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const containerController = require('../controllers/containerController');

router.use(authenticate);

router.get('/', containerController.getContainers);
router.post('/:id/stop', containerController.stopContainer);
router.delete('/:id', containerController.deleteContainer);

module.exports = router;
