const express = require('express');
const router = express.Router();
const { getDashboardData, getRevenueRange } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');


router.get('/', protect, requireStaff, requirePermission('Dashboard', 'view'), getDashboardData);
router.get('/revenue-range', protect, requireStaff, requirePermission('Dashboard', 'view'), getRevenueRange);

module.exports = router;
