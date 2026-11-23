const express = require('express');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const RolePermission = require('../models/RolePermission');
const {
    MODULES,
    MODULE_ACTIONS,
    ROLES,
    DEFAULT_MATRIX,
    getMatrix,
    getCustomRoles,
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
// `roles` is the built-in vocabulary plus every custom role; `defaults`
// is the factory matrix, which the editor's Restore Defaults button
// writes back through the ordinary PUT below (one write path).
router.get('/', async (req, res) => {
    try {
        const customRoles = await getCustomRoles();
        res.json({
            modules: MODULES,
            moduleActions: MODULE_ACTIONS,
            roles: [...ROLES, ...customRoles],
            customRoles,
            defaults: DEFAULT_MATRIX,
            matrix: await getMatrix(),
            canEdit: req.user.role === 'Super Admin',
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/permissions/roles — create a custom role. Super Admin only
// (enforced here, server-side — the panel merely hides the button for
// everyone else). The name is trimmed, length-bounded and must not
// duplicate an existing role name, case-insensitively. A new role
// starts with NO permissions; the matrix editor grants them afterwards.
router.post('/roles', async (req, res) => {
    try {
        if (req.user.role !== 'Super Admin') {
            return res.status(403).json({
                message: 'Only a Super Admin can create roles.',
            });
        }
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) {
            return res.status(400).json({ message: 'A role name is required.' });
        }
        if (name.length < 2 || name.length > 30) {
            return res.status(400).json({
                message: 'Role name must be between 2 and 30 characters.',
            });
        }
        if (!/^[A-Za-z][A-Za-z0-9\s&'-]*$/.test(name)) {
            return res.status(400).json({
                message: 'Role names must start with a letter and can use letters, numbers, spaces and hyphens.',
            });
        }
        const customRoles = await getCustomRoles();
        const taken = [...ROLES, ...customRoles].some(
            (role) => role.toLowerCase() === name.toLowerCase(),
        );
        if (taken) {
            return res.status(400).json({
                message: 'A role with this name already exists.',
            });
        }
        await RolePermission.findOneAndUpdate(
            { key: 'matrix' },
            { $addToSet: { customRoles: name } },
            { upsert: true, new: true },
        );
        invalidatePermissionCache();
        const allCustomRoles = await getCustomRoles();
        res.status(201).json({
            role: name,
            roles: [...ROLES, ...allCustomRoles],
            customRoles: allCustomRoles,
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
        const customRoles = await getCustomRoles();
        const matrix = sanitizeMatrix(req.body?.matrix ?? req.body, customRoles);
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
