const express = require('express');
const router = express.Router();
const {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    resetUserTwoFactor,
    getUserProfile
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const {
    requireSettingsSavePassword,
    requireSavePasswordForUserCreate,
    requireSavePasswordForUserUpdate,
    requireSavePasswordForUserDelete,
} = require('../middleware/settingsLock');


// User management is staff-only: signed in AND holding a staff role.
router.use(protect, requireStaff);

// This one collection backs TWO panel modules — Customers (storefront
// accounts) and Users (panel accounts) — so the write guards look at
// WHAT is being written: creating or changing a STAFF account, changing
// a role, or toggling active status is Users-module work; ordinary
// customer records may also be handled with Customers permissions.
const { User } = require('../models');

const guardCreate = (req, res, next) => {
    const role = req.body?.role;
    const createsStaff = role && role !== 'Customer';
    const guard = createsStaff
        ? requirePermission('Users', 'create')
        : requireAnyPermission([['Users', 'create'], ['Customers', 'create']]);
    return guard(req, res, next);
};

const guardUpdate = (req, res, next) => {
    // Setting a new password is account-level work too — but only a
    // NON-EMPTY one: the Customers form always submits its password
    // field, blank when the password should stay as it is.
    const setsPassword =
        typeof req.body?.password === 'string' && req.body.password.trim().length > 0;
    const touchesAccount =
        req.body && ('role' in req.body || 'isActive' in req.body || setsPassword);
    const guard = touchesAccount
        ? requirePermission('Users', 'edit')
        : requireAnyPermission([['Users', 'edit'], ['Customers', 'edit']]);
    return guard(req, res, next);
};

const guardDelete = async (req, res, next) => {
    try {
        const target = await User.findById(req.params.id).select('role');
        if (target && target.role !== 'Customer') {
            return requirePermission('Users', 'delete')(req, res, next);
        }
        // Customer records (or a missing id, which the controller 404s)
        // may also be deleted with Customers delete permission.
        return requireAnyPermission([['Users', 'delete'], ['Customers', 'delete']])(req, res, next);
    } catch {
        return requirePermission('Users', 'delete')(req, res, next);
    }
};

// Settings Lock (Ahsan's order): writes that administer a STAFF
// account are Settings → Users & Roles saves, so each one also
// verifies the caller's own password for that save (the gates in
// middleware/settingsLock draw the same staff/customer split as the
// guards above). Ordinary customer-record writes through these same
// endpoints are NOT gated and keep working as before.
router.route('/')
    .get(requireAnyPermission([['Users', 'view'], ['Customers', 'view']]), getUsers)
    .post(guardCreate, requireSavePasswordForUserCreate, createUser);

router.route('/:id')
    .get(requireAnyPermission([['Users', 'view'], ['Customers', 'view']]), getUserById)
    .put(guardUpdate, requireSavePasswordForUserUpdate, updateUser)
    .delete(guardDelete, requireSavePasswordForUserDelete, deleteUser);

// Reset a staff account's 2FA (Settings → Users & Roles). Super Admin
// only — the same inline role gate the role-management routes use —
// and, because it administers a staff account, it is a Settings save:
// the caller's own password is verified for this save by the Settings
// Lock gate, exactly like the create/update/delete writes above. The
// reset account enrols again at its next sign-in.
const guardResetTwoFactor = (req, res, next) => {
    if (req.user.role !== 'Super Admin') {
        return res.status(403).json({
            message: 'Only a Super Admin can reset two-factor authentication.',
        });
    }
    return next();
};

router.post(
    '/:id/reset-2fa',
    guardResetTwoFactor,
    requireSettingsSavePassword,
    resetUserTwoFactor
);

// The customer's shopping profile: stored lists + order-derived stats.
router.get(
    '/:id/profile',
    requireAnyPermission([['Users', 'view'], ['Customers', 'view']]),
    getUserProfile
);

module.exports = router;
