const express = require('express');
const router = express.Router();
const { getDashboardData } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');


router.get('/', protect, requireStaff, requirePermission('Dashboard', 'view'), getDashboardData);

module.exports = router;
