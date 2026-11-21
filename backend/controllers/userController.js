const User = require('../models/User');

// @desc    Get all users (customers)
// @route   GET /api/users
// @access  Admin
const getUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Admin
const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const USER_ROLES = ['Super Admin', 'Admin', 'Manager', 'Editor', 'Support', 'Customer'];

// @desc    Create a new user (Settings → Users & Roles "Add User")
// @route   POST /api/users
// @access  Admin (staff-only — the router enforces protect + requireStaff)
const createUser = async (req, res) => {
    try {
        const { firstName, lastName, email, password, role, isActive } = req.body || {};

        if (!email || !String(email).trim()) {
            return res.status(400).json({ message: 'An email address is required.' });
        }
        if (!password) {
            return res.status(400).json({ message: 'A password is required.' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }
        if (role !== undefined && !USER_ROLES.includes(role)) {
            return res.status(400).json({ message: `Invalid role. Use one of: ${USER_ROLES.join(', ')}.` });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({ message: 'A user with this email already exists.' });
        }

        // `username` is required and unique in the schema, but the panel
        // form never asks for one — derive it from the email's local part
        // and suffix it until it is free.
        const base = (normalizedEmail.split('@')[0] || 'user')
            .replace(/[^a-z0-9_.-]/gi, '')
            .slice(0, 24) || 'user';
        let username = base;
        let suffix = 1;
        while (await User.exists({ username })) {
            suffix += 1;
            username = `${base}${suffix}`;
        }

        // The model's pre-save hook hashes the password.
        const user = new User({
            firstName: firstName ? String(firstName).trim() : '',
            lastName: lastName ? String(lastName).trim() : '',
            username,
            email: normalizedEmail,
            password: String(password),
            role: role || 'Customer',
            isActive: isActive === undefined ? true : Boolean(isActive),
            isVerified: true,
        });
        const createdUser = await user.save();

        // Remove password from response
        const userObj = createdUser.toObject();
        delete userObj.password;

        res.status(201).json(userObj);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Counts ACTIVE Super Admins other than the given user — the store must
// always keep at least one, or nobody can administer it.
const otherActiveSuperAdmins = async (excludeId) => {
    return User.countDocuments({
        role: 'Super Admin',
        isActive: { $ne: false },
        _id: { $ne: excludeId },
    });
};

// @desc    Update a user (profile, role, active status)
// @route   PUT /api/users/:id
// @access  Admin
const updateUser = async (req, res) => {
    try {
        // Exclude password from updates in this route for safety
        const { password, ...updateData } = req.body;

        const target = await User.findById(req.params.id);
        if (!target) {
            return res.status(404).json({ message: 'User not found' });
        }

        const roleChanges = updateData.role !== undefined && updateData.role !== target.role;
        const deactivates = updateData.isActive !== undefined
            && Boolean(updateData.isActive) === false
            && target.isActive !== false;

        // Self-lockout guard: you cannot demote or deactivate your own
        // account from the panel — another admin has to do it.
        if (String(req.user?._id) === String(target._id) && (roleChanges || deactivates)) {
            return res.status(400).json({
                message: 'You cannot change your own role or deactivate your own account.'
            });
        }

        // Last-Super-Admin guard: the final active Super Admin cannot be
        // demoted or deactivated, or the store is left with no top admin.
        if (target.role === 'Super Admin' && (roleChanges || deactivates)) {
            if ((await otherActiveSuperAdmins(target._id)) === 0) {
                return res.status(400).json({
                    message: 'This is the last active Super Admin — promote another user first.'
                });
            }
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        res.json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Admin
const deleteUser = async (req, res) => {
    try {
        const target = await User.findById(req.params.id);
        if (!target) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (String(req.user?._id) === String(target._id)) {
            return res.status(400).json({ message: 'You cannot delete your own account.' });
        }

        if (target.role === 'Super Admin' && target.isActive !== false
            && (await otherActiveSuperAdmins(target._id)) === 0) {
            return res.status(400).json({
                message: 'This is the last active Super Admin — promote another user first.'
            });
        }

        await target.deleteOne();
        res.json({ message: 'User removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser
};

