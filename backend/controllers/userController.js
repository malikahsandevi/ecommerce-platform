const User = require('../models/User');
const Order = require('../models/Order');
// Registered so Order's coupon populate can resolve its code.
require('../models/Coupon');

const FAVORITE_CATEGORY_LIMIT = 3;
const favoriteCategoryError = (res) =>
    res.status(400).json({
        message: `Favorite categories are limited to ${FAVORITE_CATEGORY_LIMIT}. Remove one before adding another.`
    });

// @desc    Get all users (customers)
// @route   GET /api/users
// @access  Admin
const getUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        await User.withCodes(users);
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
        await User.withCodes(user);
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

        if (Array.isArray(req.body?.favoriteCategories)
            && req.body.favoriteCategories.length > FAVORITE_CATEGORY_LIMIT) {
            return favoriteCategoryError(res);
        }

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
            // Shopping profile lists, when the caller supplies them.
            ...(Array.isArray(req.body.favoriteCategories)
                ? { favoriteCategories: req.body.favoriteCategories }
                : {}),
            ...(Array.isArray(req.body.favorites) ? { favorites: req.body.favorites } : {}),
            ...(Array.isArray(req.body.liked) ? { liked: req.body.liked } : {}),
            ...(Array.isArray(req.body.cart) ? { cart: req.body.cart } : {}),
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

        if (Array.isArray(updateData.favoriteCategories)
            && updateData.favoriteCategories.length > FAVORITE_CATEGORY_LIMIT) {
            return favoriteCategoryError(res);
        }

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

// @desc    Get a customer's full shopping profile
// @route   GET /api/users/:id/profile
// @access  Admin
// The STORED lists (favorites, liked, cart, favoriteCategories) come
// off the User record, populated with product/category names + images.
// Everything transactional is DERIVED from the customer's Orders on
// every request — purchased history, total spend (non-cancelled
// orders), order count, average order value, last order date and the
// distinct coupons used with their counts — so it can never go stale
// and nothing is invented for customers without orders.
const productBrief = (product) =>
    product
        ? {
              id: product._id,
              name: product.name || '',
              image: product.image || '',
              price: product.price ?? null,
          }
        : null;

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('favorites', 'name image price')
            .populate('liked', 'name image price')
            .populate('cart.product', 'name image price')
            .populate('favoriteCategories', 'name image');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Orders carry a required `user` ref — that is the match.
        const orders = await Order.find({ user: user._id })
            .sort({ createdAt: -1 })
            .populate('coupon', 'code discountType discountValue')
            .lean();

        const activeOrders = orders.filter((order) => order.status !== 'cancelled');
        const totalSpend = activeOrders.reduce((sum, order) => sum + (order.total || 0), 0);
        const totalOrders = activeOrders.length;
        const averageOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
        const lastOrderDate = activeOrders.length > 0 ? activeOrders[0].createdAt : null;

        // Per-coupon usage over the active orders. Orders are sorted
        // newest first, so the first sighting of a code is its most
        // recent use.
        const couponUsage = new Map();
        for (const order of activeOrders) {
            const coupon = order.coupon;
            if (!coupon?.code) continue;
            const entry = couponUsage.get(coupon.code) || {
                code: coupon.code,
                timesUsed: 0,
                discountType: coupon.discountType || null,
                discountValue: coupon.discountValue ?? null,
                lastUsed: order.createdAt,
            };
            entry.timesUsed += 1;
            couponUsage.set(coupon.code, entry);
        }

        const orderBrief = (order) => ({
            id: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            total: order.total,
            date: order.createdAt,
            items: (order.items || []).map((item) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                image: item.image || '',
            })),
        });

        res.json({
            favorites: (user.favorites || []).map(productBrief).filter(Boolean),
            liked: (user.liked || []).map(productBrief).filter(Boolean),
            cart: (user.cart || [])
                .map((entry) => {
                    const brief = productBrief(entry.product);
                    return brief ? { ...brief, quantity: entry.quantity || 1 } : null;
                })
                .filter(Boolean),
            favoriteCategories: (user.favoriteCategories || [])
                .map((category) =>
                    category
                        ? { id: category._id, name: category.name || '', image: category.image || '' }
                        : null,
                )
                .filter(Boolean),
            stats: {
                totalSpend,
                totalOrders,
                averageOrderValue,
                lastOrderDate,
            },
            purchased: orders.slice(0, 5).map(orderBrief),
            // Card views (additive): every non-cancelled order for the
            // Total Spend / Total Orders popups, and the bought products
            // flattened per order line for the Purchased popup.
            orders: activeOrders.map(orderBrief),
            purchasedProducts: activeOrders.flatMap((order) =>
                (order.items || []).map((item) => ({
                    name: item.name,
                    image: item.image || '',
                    quantity: item.quantity,
                    price: item.price,
                    orderNumber: order.orderNumber,
                    date: order.createdAt,
                })),
            ),
            usedCoupons: [...couponUsage.values()],
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getUserProfile
};

