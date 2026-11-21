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

// @desc    Create a new user
// @route   POST /api/users
// @access  Admin/Public
const createUser = async (req, res) => {
    try {
        const user = new User(req.body);
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

