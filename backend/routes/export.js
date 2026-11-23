const express = require('express');
const router = express.Router();
const { exportModule } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');

// Data Export role gate (Ahsan's rule): ONLY Super Admin and Admin may
// export data — no other role, built-in or custom, even with full view
// permission on the module. The panel keeps the Export button visible
// for everyone and shows a notice instead; this is the real refusal.
const EXPORT_ROLES = ['Super Admin', 'Admin'];
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

router.use(protect, requireStaff, requireExportRole);

router.get('/:module', exportModule);

module.exports = router;
