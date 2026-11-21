const express = require('express');
const router = express.Router();
const { Setting } = require('../models');
const genericController = require('../controllers/genericController')(Setting);
const { getSettings, updateSettings, executeIntegration } = require('../controllers/settingController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');


// Settings hold integration credentials and drive outbound calls — every
// route here requires a signed-in staff account.
router.use(protect, requireStaff);

// Standard settings fetch and update
router.route('/')
    .get(requirePermission('Settings', 'view'), getSettings)
    .put(requirePermission('Settings', 'edit'), updateSettings);

// Universal Driver execution route (to trigger dynamic integrations)
router.post('/execute', requirePermission('Settings', 'edit'), executeIntegration);

// Generic ID based routes
router.route('/:id')
    .get(requirePermission('Settings', 'view'), genericController.getById)
    .put(requirePermission('Settings', 'edit'), genericController.update)
    .delete(requirePermission('Settings', 'delete'), genericController.remove);

module.exports = router;
