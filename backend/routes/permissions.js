const express = require('express');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const RolePermission = require('../models/RolePermission');
const {
    MODULES,
    MODULE_ACTIONS,
    ROLES,
    getMatrix,
    getEffectivePermissions,
    sanitizeMatrix,
    invalidatePermissionCache,
} = require('../utils/permissions');

const router = express.Router();

router.use(protect, requireStaff);

// GET /api/permissions/me — the signed-in user's own effective
// permissions; the admin shell gates its UI on this. It also carries
// the account's current name + avatar: the shell refreshes its stored
// session from this response, and a profile photo set after the last
// login would otherwise never reach the user chips (they kept showing
// initials). The avatar passes through the response signer like every
// other record's, so the chip gets a working signed URL.
router.get('/me', async (req, res) => {
    try {
        res.json({
            role: req.user.role,
            name: [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
            avatar: req.user.avatar,
            permissions: await getEffectivePermissions(req.user.role),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/permissions — the full matrix + the vocabulary the editor
// renders. Any staff member may read it; only Super Admin may write.
router.get('/', async (req, res) => {
    try {
        res.json({
            modules: MODULES,
            moduleActions: MODULE_ACTIONS,
            roles: ROLES,
            matrix: await getMatrix(),
            canEdit: req.user.role === 'Super Admin',
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/permissions — replace the matrix. Super Admin only: letting a
// lesser role edit the matrix would make every other rule pointless.
router.put('/', async (req, res) => {
    try {
        if (req.user.role !== 'Super Admin') {
            return res.status(403).json({
                message: 'Only a Super Admin can edit role permissions.',
            });
        }
        const matrix = sanitizeMatrix(req.body?.matrix ?? req.body);
        await RolePermission.findOneAndUpdate(
            { key: 'matrix' },
            { $set: { matrix, updatedBy: req.user._id } },
            { upsert: true, new: true },
        );
        invalidatePermissionCache();
        res.json({ matrix: await getMatrix() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
