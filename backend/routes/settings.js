const express = require('express');
const router = express.Router();
const { Setting } = require('../models');
const genericController = require('../controllers/genericController')(Setting);
const { getSettings, updateSettings, executeIntegration } = require('../controllers/settingController');
const { protect } = require('../middleware/auth');

// Settings hold integration credentials and drive outbound calls — every
// route here requires a signed-in admin.
router.use(protect);

// Standard settings fetch and update
router.route('/')
    .get(getSettings)
    .put(updateSettings);

// Universal Driver execution route (to trigger dynamic integrations)
router.post('/execute', executeIntegration);

// Generic ID based routes
router.route('/:id')
    .get(genericController.getById)
    .put(genericController.update)
    .delete(genericController.remove);

module.exports = router;
