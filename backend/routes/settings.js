const express = require('express');
const router = express.Router();
const { Setting } = require('../models');
const genericController = require('../controllers/genericController')(Setting);
const { getSettings, getShellBootstrap, updateSettings, verifySettingsPassword, updateSettingsAppearance, executeIntegration, getServicesCatalogue, getSettingById, updateSettingById, saveIntegrationEntry, deleteIntegrationEntry } = require('../controllers/settingController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');
const { requireSettingsUnlock, requireSettingsSavePassword } = require('../middleware/settingsLock');


// Settings hold integration credentials and drive outbound calls — every
// route here requires a signed-in staff account.
router.use(protect, requireStaff);

// ── Settings Lock (Ahsan's order) ───────────────────────────────────
// Entering Settings requires re-verifying your own password: this
// endpoint checks it and mints the short-lived unlock proof the full
// reads below demand. Declared before '/:id' so "verify-password" is
// not read as a settings id.
router.post('/verify-password', requirePermission('Settings', 'view'), verifySettingsPassword);

// Standard settings fetch and update. The READ is behind the entry
// lock (a merely-signed-in session gets 403 SETTINGS_LOCKED, no panel
// data); the WRITE is behind the per-save security check (the
// caller's own password rides with the save — see
// middleware/settingsLock).
router.route('/')
    .get(requirePermission('Settings', 'view'), requireSettingsUnlock, getSettings)
    .put(requirePermission('Settings', 'edit'), requireSettingsSavePassword, updateSettings);

// Universal Driver execution route (to trigger dynamic integrations).
// NOT a save and NOT password-gated: it executes the SAVED entry and
// persists nothing (the panel's Test flow saves the entry first —
// that save is gated like every other).
router.post('/execute', requirePermission('Settings', 'edit'), executeIntegration);

// The service catalogue (categories → sub-services → field schemas,
// structure only, no values) the integrations panel renders from. A
// Settings-panel read, so it sits behind the same entry lock.
router.get('/services/catalogue', requirePermission('Settings', 'view'), requireSettingsUnlock, getServicesCatalogue);

// Shell bootstrap: the appearance section + general's language and
// currency ONLY — the universal rendering basics the shell applies
// for EVERY staff
// session, including roles with no Settings view (the Settings page
// itself stays permission-gated, and no other settings data leaves
// through here). Staff guard comes from router.use above; no
// Settings permission is required for this slice by design, and the
// Settings Lock never applies to it — a locked session's panel must
// still paint themed. Must be declared before '/:id' so "bootstrap"
// is not read as a settings id.
router.get('/bootstrap', getShellBootstrap);

// The universal appearance write (TopBar theme toggle, palette Keep):
// appearance-only, deliberately NOT password-gated — see
// updateSettingsAppearance. Declared before '/:id' so "appearance"
// is not read as a settings id.
router.put('/appearance', requirePermission('Settings', 'edit'), updateSettingsAppearance);

// Per-entry integration writes — every service entry in the panel has
// its OWN Save and Remove, which write/delete exactly that one entry
// (matched by slug) and leave the rest of the array untouched. Both
// are Settings saves, so both carry the per-save security check. Must
// be declared before '/:id' so "integrations" is not read as a
// settings id.
router.route('/integrations/:serviceSlug')
    .put(requirePermission('Settings', 'edit'), requireSettingsSavePassword, saveIntegrationEntry)
    .delete(requirePermission('Settings', 'delete'), requireSettingsSavePassword, deleteIntegrationEntry);

// Generic ID based routes — reads/writes use the masking handlers
// above (a settings document carries integration secrets); only the
// delete stays on the generic controller. Same lock treatment as the
// section routes: read behind the entry lock, writes behind the
// per-save security check.
router.route('/:id')
    .get(requirePermission('Settings', 'view'), requireSettingsUnlock, getSettingById)
    .put(requirePermission('Settings', 'edit'), requireSettingsSavePassword, updateSettingById)
    .delete(requirePermission('Settings', 'delete'), requireSettingsSavePassword, genericController.remove);

module.exports = router;
