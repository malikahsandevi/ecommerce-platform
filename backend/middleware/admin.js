// Staff-only guard. `protect` (middleware/auth.js) proves WHO the caller
// is; this proves their account is a staff account. Customer accounts must
// never reach user management, settings or the dashboard data — even with
// a token minted before their role changed.
//
// Usage: router.use(protect, requireStaff) — protect must run first so
// req.user exists.
const { getCustomRoles } = require('../utils/permissions');

const STAFF_ROLES = ['Super Admin', 'Admin', 'Manager', 'Editor', 'Support'];

const requireStaff = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized — no token provided.' });
    }
    if (STAFF_ROLES.includes(req.user.role)) {
        return next();
    }
    // Custom roles are staff roles too: they exist only because a Super
    // Admin created them in Settings → Users & Roles, and accounts holding
    // one sign in to this panel. Whether such a role may open a given
    // section is the permission matrix's call (requirePermission), never
    // this guard's — a hard-coded name list here used to reject EVERY
    // custom role outright, so even a role the matrix grants Dashboard
    // view could never load the dashboard. A lookup failure refuses,
    // never admits; a deleted or unknown role is not staff either.
    try {
        const customRoles = await getCustomRoles();
        if (customRoles.includes(req.user.role)) {
            return next();
        }
    } catch {
        /* fall through to the refusal */
    }
    return res.status(403).json({ message: 'Not authorized — staff access only.' });
};

// Super-Admin-only guard — stricter than the permission matrix on
// purpose: some surfaces (service credentials) must stay out of reach
// even for an Admin whose matrix grants full Settings access. Mirrors
// the hard rule in utils/permissions.js (Super Admin is never governed
// by the editable matrix).
const requireSuperAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized — no token provided.' });
    }
    if (req.user.role !== 'Super Admin') {
        return res.status(403).json({
            message: 'Only a Super Admin can manage service credentials.',
        });
    }
    next();
};

module.exports = { requireStaff, requireSuperAdmin, STAFF_ROLES };
