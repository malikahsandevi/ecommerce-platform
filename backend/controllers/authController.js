const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const envAdminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
        const envAdminPass = process.env.ADMIN_PASSWORD || 'admin';

        // Check for admin user in DB first
        let adminUser = await User.findOne({ email }).select('+password');

        // Auto-seed admin user from .env if it doesn't exist and credentials match the .env request
        if (!adminUser && email === envAdminEmail && password === envAdminPass) {
            adminUser = new User({
                firstName: 'Super',
                lastName: 'Admin',
                username: 'admin',
                email: envAdminEmail,
                password: envAdminPass,
                role: 'Super Admin',
                isVerified: true
            });
            await adminUser.save();
        }

        if (adminUser) {
            const isMatch = await adminUser.comparePassword(password);
            if (isMatch) {
                // This endpoint signs people into the ADMIN panel. Customer
                // accounts (storefront sign-ups) must not pass here, and a
                // deactivated account must not pass either.
                if (adminUser.role === 'Customer') {
                    return res.status(403).json({
                        message: 'This account is a customer account — it cannot sign in to the admin panel.'
                    });
                }
                if (adminUser.isActive === false) {
                    return res.status(403).json({
                        message: 'This account has been deactivated. Contact the store administrator.'
                    });
                }
                return res.json({
                    _id: adminUser._id,
                    name: `${adminUser.firstName} ${adminUser.lastName}`,
                    email: adminUser.email,
                    // The account's REAL role (e.g. "Super Admin"). This used
                    // to hardcode the string 'admin', which the panel then
                    // displayed as the signed-in user's role everywhere.
                    role: adminUser.role,
                    avatar: adminUser.avatar,
                    token: generateToken(adminUser._id)
                });
            }
        }

        res.status(401).json({ message: 'Invalid email or password' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    loginAdmin
};

