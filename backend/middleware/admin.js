// Staff-only guard. `protect` (middleware/auth.js) proves WHO the caller
// is; this proves their account is a staff account. Customer accounts must
// never reach user management, settings or the dashboard data — even with
// a token minted before their role changed.
//
// Usage: router.use(protect, requireStaff) — protect must run first so
// req.user exists.
const STAFF_ROLES = ['Super Admin', 'Admin', 'Manager', 'Editor', 'Support'];

const requireStaff = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized — no token provided.' });
    }
    if (!STAFF_ROLES.includes(req.user.role)) {
        return res.status(403).json({ message: 'Not authorized — staff access only.' });
    }
    next();
};

module.exports = { requireStaff, STAFF_ROLES };
