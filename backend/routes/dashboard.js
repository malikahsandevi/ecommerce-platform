const express = require('express');
const router = express.Router();
const { getDashboardData, getRevenueRange } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');

// DEFAULT-DENY (Claude Section 9 follow-up): the group guard makes
// authentication this router's default — a route added here tomorrow
// is born signed-in-staff-only; per-route checks stay as layer two.
router.use(protect, requireStaff);

router.get('/', protect, requireStaff, requirePermission('Dashboard', 'view'), getDashboardData);
router.get('/revenue-range', protect, requireStaff, requirePermission('Dashboard', 'view'), getRevenueRange);

module.exports = router;
