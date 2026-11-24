const express = require('express');
const router = express.Router();
const { exportModule } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { EXPORT_ROLES, roleHasPermission } = require('../utils/permissions');

// Data Export role gate (Ahsan's rule): ONLY Super Admin and Admin may
// export data — no other role, built-in or custom, even with full view
// permission on the module. The panel keeps the Export button visible
// for everyone and shows a notice instead; this is the real refusal.
const requireExportRole = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized — no token provided.' });
    }
    if (!EXPORT_ROLES.includes(req.user.role)) {
        return res.status(403).json({
            message: 'Only Super Admin and Admin can export data.',
        });
    }
    return next();
};

// Second gate (the permission matrix's Export column): even a Super
// Admin / Admin may export a module only while their role's matrix row
// ticks Export for it — a Super Admin can take a module's export away
// from Admin in Settings → Users & Roles. URL segment → matrix module
// name (the Customers page exports through the `users` segment).
// Unknown segments fall through so the controller answers its 404.
const SEGMENT_MODULES = {
    products: 'Products',
    categories: 'Categories',
    brands: 'Brands',
    coupons: 'Coupons',
    orders: 'Orders',
    users: 'Customers',
    reviews: 'Reviews',
    media: 'Media',
};
const requireExportPermission = async (req, res, next) => {
    const module = SEGMENT_MODULES[String(req.params.module || '').toLowerCase()];
    if (!module) return next();
    try {
        const allowed = await roleHasPermission(req.user.role, module, 'export');
        if (!allowed) {
            return res.status(403).json({
                message: `You don't have permission to export ${module} data.`,
            });
        }
        return next();
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

router.use(protect, requireStaff, requireExportRole);

router.get('/:module', requireExportPermission, exportModule);

module.exports = router;
