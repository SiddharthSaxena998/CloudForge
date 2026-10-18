const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const roleCheck = require('../middleware/role-check');
const adminController = require('../controllers/adminController');

router.use(authenticate, roleCheck('admin'));

router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.updateUser);

module.exports = router;
