const express = require('express');
const router = express.Router();
const { getDashboardData } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');

router.get('/', protect, requireStaff, getDashboardData);

module.exports = router;
