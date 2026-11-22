const express = require('express');
const router = express.Router();
const { Setting } = require('../models');
const genericController = require('../controllers/genericController')(Setting);
const { getSettings, updateSettings, executeIntegration, getServicesCatalogue, getSettingById, updateSettingById } = require('../controllers/settingController');
const { getCredentials, updateCredentials } = require('../controllers/credentialController');
const { protect } = require('../middleware/auth');
const { requireStaff, requireSuperAdmin } = require('../middleware/admin');
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

// The service catalogue (categories → sub-services → field schemas,
// structure only, no values) the integrations panel renders from.
router.get('/services/catalogue', requirePermission('Settings', 'view'), getServicesCatalogue);

// Service credentials (Cloudinary + JWT secret) — stored in the database
// and managed here, Super Admin ONLY (stricter than the Settings matrix:
// an Admin with full Settings access still may not touch these). Must be
// declared before '/:id' so "credentials" is not read as a settings id.
router.route('/credentials')
    .get(requireSuperAdmin, getCredentials)
    .put(requireSuperAdmin, updateCredentials);

// Generic ID based routes — reads/writes use the masking handlers
// above (a settings document carries integration secrets); only the
// delete stays on the generic controller.
router.route('/:id')
    .get(requirePermission('Settings', 'view'), getSettingById)
    .put(requirePermission('Settings', 'edit'), updateSettingById)
    .delete(requirePermission('Settings', 'delete'), genericController.remove);

module.exports = router;
