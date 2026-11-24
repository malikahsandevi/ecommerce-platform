const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { NOT_DELETED } = require('../utils/softDelete');
const { getJwtSecret } = require('../utils/credentials');

// Verifies the Bearer JWT issued by POST /api/auth/login and loads the user.
// Applied to every admin-only route (settings, users, dashboard, writes).
const protect = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: 'Not authorized — no token provided.' });
    }

    try {
        // The signing secret is managed in Settings → Credentials (DB
        // store, environment fallback) — never read process.env here.
        const decoded = jwt.verify(token, await getJwtSecret());
        // Session tokens are minted WITHOUT a purpose claim. Every
        // purpose-scoped token (the 2FA login/enrolment temp tokens,
        // the Settings unlock proof) is a credential for its own step
        // only — presenting one here must never act as a session,
        // otherwise the second factor could be skipped entirely by
        // replaying the temp token as a Bearer token.
        if (decoded.purpose) {
            return res.status(401).json({ message: 'Not authorized — invalid or expired token.' });
        }
        // A soft-deleted account's session dies with the delete: the
        // record waits in Settings → Deleted Items, and until it is
        // restored its tokens resolve to no account at all.
        const user = await User.findOne({ _id: decoded.id, ...NOT_DELETED }).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'Not authorized — account no longer exists.' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Not authorized — invalid or expired token.' });
    }
};

module.exports = { protect };
