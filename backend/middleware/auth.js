const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the Bearer JWT issued by POST /api/auth/login and loads the user.
// Applied to every admin-only route (settings, users, dashboard, writes).
const protect = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: 'Not authorized — no token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
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
