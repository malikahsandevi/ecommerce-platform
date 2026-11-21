const express = require('express');
const router = express.Router();
const {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getUserProfile
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');


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
    const touchesAccount =
        req.body && ('role' in req.body || 'isActive' in req.body);
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

router.route('/')
    .get(requireAnyPermission([['Users', 'view'], ['Customers', 'view']]), getUsers)
    .post(guardCreate, createUser);

router.route('/:id')
    .get(requireAnyPermission([['Users', 'view'], ['Customers', 'view']]), getUserById)
    .put(guardUpdate, updateUser)
    .delete(guardDelete, deleteUser);

// The customer's shopping profile: stored lists + order-derived stats.
router.get(
    '/:id/profile',
    requireAnyPermission([['Users', 'view'], ['Customers', 'view']]),
    getUserProfile
);

module.exports = router;
