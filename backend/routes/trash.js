const express = require('express');
const router = express.Router();
const {
    listDeletedItems,
    restoreItem,
    permanentlyDeleteItem,
} = require('../controllers/trashController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');
const {
    requireSettingsUnlock,
    requireSettingsSavePassword,
} = require('../middleware/settingsLock');

// Settings → Deleted Items (Ahsan's order). The section lives in
// Settings, so it inherits the Settings treatment end to end:
//   · staff only, and the LIST sits behind the Settings view
//     permission + the Settings Lock entry proof, like every full
//     Settings read — a role without Settings view gets the
//     permission refusal, never the lock prompt;
//   · both actions are Settings writes, so each one verifies the
//     caller's own password for that action (Settings Lock per-save
//     check — missing/wrong → 403, nothing restored or removed);
//   · and each action ALSO needs the Delete permission of the item's
//     OWN module (restoring a product is Products work, a customer
//     record is Customers work, a staff account is Users work, an
//     integration entry is Settings work).
router.use(protect, requireStaff);

const SEGMENT_PERMISSIONS = {
    products: 'Products',
    categories: 'Categories',
    brands: 'Brands',
    coupons: 'Coupons',
    orders: 'Orders',
    customers: 'Customers',
    users: 'Users',
    reviews: 'Reviews',
    media: 'Media',
    integrations: 'Settings',
};

const requireModuleDelete = (req, res, next) => {
    const module = SEGMENT_PERMISSIONS[String(req.params.module || '').toLowerCase()];
    if (!module) {
        return res.status(404).json({ message: 'Unknown module.' });
    }
    return requirePermission(module, 'delete')(req, res, next);
};

router.get(
    '/',
    requirePermission('Settings', 'view'),
    requireSettingsUnlock,
    listDeletedItems,
);

router.post(
    '/:module/:id/restore',
    requirePermission('Settings', 'view'),
    requireModuleDelete,
    requireSettingsSavePassword,
    restoreItem,
);

router.delete(
    '/:module/:id',
    requirePermission('Settings', 'view'),
    requireModuleDelete,
    requireSettingsSavePassword,
    permanentlyDeleteItem,
);

module.exports = router;
