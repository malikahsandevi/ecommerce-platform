const User = require('../models/User');
const Order = require('../models/Order');
// Registered so Order's coupon populate can resolve its code.
require('../models/Coupon');
const { getAllRoleNames } = require('../utils/permissions');

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

// Built-in vocabulary, used as the fast path — the authoritative check
// is getAllRoleNames(), which also knows roles created from the panel.
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
        // When the caller sends a confirmation (the Add User form
        // always does), it must match the password — a mismatch
        // creates nothing. Callers that send no confirmation field at
        // all (the Customers page) keep the previous contract.
        if ('confirmPassword' in (req.body || {})
            && String(req.body.confirmPassword ?? '') !== String(password)) {
            return res.status(400).json({
                message: 'The password and its confirmation do not match.'
            });
        }
        if (role !== undefined) {
            const knownRoles = await getAllRoleNames();
            if (!knownRoles.includes(role)) {
                return res.status(400).json({ message: `Invalid role. Use one of: ${knownRoles.join(', ')}.` });
            }
        }

        // Role assignment is Super-Admin-only: a non-Super-Admin may
        // create Customer accounts only — any other role in the payload
        // is refused and nothing is persisted.
        if (req.user?.role !== 'Super Admin' && role !== undefined && role !== 'Customer') {
            return res.status(403).json({
                message: 'Only a Super Admin can create a user with this role.'
            });
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
        // A duplicate key (a race past the pre-check above) is reported
        // with the same clean message — never the raw MongoDB text.
        if (error?.code === 11000) {
            return res.status(400).json({ message: 'A user with this email already exists.' });
        }
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

// @desc    Update a user (profile, role, active status, password)
// @route   PUT /api/users/:id
// @access  Admin
const updateUser = async (req, res) => {
    try {
        const { password, currentPassword, confirmPassword, ...updateData } = req.body || {};

        // Password change: the edit forms promise "leave blank to keep
        // the current password" — an absent or blank password therefore
        // changes NOTHING (the stored hash stays byte-identical). A
        // provided password must meet the same minimum as account
        // creation (6 characters) and is applied by setting it on the
        // document and saving, so the model's pre-save hook hashes it
        // exactly like a freshly created account. It is never echoed
        // back: the response is re-read without the password field.
        const wantsPasswordChange =
            typeof password === 'string' && password.trim().length > 0;
        if (wantsPasswordChange && password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        // The Settings → Users & Roles Edit User form changes a password
        // as a TRIO (Ahsan's order): it always sends currentPassword +
        // confirmPassword alongside the new password. When a request
        // engages the trio (either companion field is present), the
        // change is accepted only if the CURRENT password of the
        // ACCOUNT BEING EDITED verifies against its stored hash and the
        // confirmation matches — verified below, before anything is
        // written, so a failure rejects the WHOLE update (no other
        // field is saved either). There is no admin bypass: editing
        // another user requires THAT user's current password. Callers
        // that send a bare `password` with neither companion field (the
        // Customers page's long-standing admin-reset contract — it
        // cannot know the customer's current password) keep the
        // previous behaviour above.
        const trioEngaged =
            wantsPasswordChange &&
            ('currentPassword' in (req.body || {}) || 'confirmPassword' in (req.body || {}));

        if (Array.isArray(updateData.favoriteCategories)
            && updateData.favoriteCategories.length > FAVORITE_CATEGORY_LIMIT) {
            return favoriteCategoryError(res);
        }

        // +password: the schema marks the hash select:false, and the
        // password-trio verification below needs it. Responses still
        // never carry it (the model's toJSON transform strips it).
        const target = await User.findById(req.params.id).select('+password');
        if (!target) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Ownership rule (Ahsan): only a Super Admin may edit another
        // account. Anyone else may edit ONLY their own — refused here,
        // server-side, whatever the payload carries (profile fields,
        // inline role/status quick edits and password changes alike).
        const isSelf = String(req.user?._id) === String(target._id);
        if (req.user?.role !== 'Super Admin' && !isSelf) {
            return res.status(403).json({
                message: 'Only a Super Admin can edit another account.'
            });
        }

        // An email change must not land on another account's address —
        // checked up front so the panel gets a clean message instead of
        // the raw duplicate-key error the save would otherwise throw.
        if (updateData.email !== undefined) {
            const normalizedEmail = String(updateData.email).trim().toLowerCase();
            if (normalizedEmail && normalizedEmail !== String(target.email || '').toLowerCase()) {
                const clash = await User.findOne({
                    email: normalizedEmail,
                    _id: { $ne: target._id },
                });
                if (clash) {
                    return res.status(400).json({
                        message: 'A user with this email already exists.'
                    });
                }
            }
        }

        if (updateData.role !== undefined) {
            const knownRoles = await getAllRoleNames();
            if (!knownRoles.includes(updateData.role)) {
                return res.status(400).json({ message: `Invalid role. Use one of: ${knownRoles.join(', ')}.` });
            }
        }

        // Trio verification (see the note at the top of this handler):
        // a missing or wrong current password, or a confirmation that
        // does not equal the new password, rejects the entire update —
        // nothing has been written yet at this point.
        if (trioEngaged) {
            const currentOk =
                typeof currentPassword === 'string' &&
                currentPassword.length > 0 &&
                (await target.comparePassword(currentPassword));
            if (!currentOk) {
                return res.status(400).json({ message: 'Current password is incorrect.' });
            }
            if (confirmPassword !== password) {
                return res.status(400).json({
                    message: 'The new password and its confirmation do not match.'
                });
            }
        }

        const roleChanges = updateData.role !== undefined && updateData.role !== target.role;
        const deactivates = updateData.isActive !== undefined
            && Boolean(updateData.isActive) === false
            && target.isActive !== false;

        // Role assignment is Super-Admin-only: a non-Super-Admin cannot
        // change ANY role, including their own — otherwise any admin
        // could promote himself. Refused before anything is written
        // (and before the self-lockout guard below, so the refusal is
        // the 403 this rule promises).
        if (req.user?.role !== 'Super Admin' && roleChanges) {
            return res.status(403).json({
                message: 'Only a Super Admin can change roles.'
            });
        }

        // Last-Super-Admin guard FIRST: the final active Super Admin
        // cannot be demoted or deactivated, or the store is left with
        // no top admin — its message is the refusal for that case,
        // including when the Super Admin attempts it on himself.
        if (target.role === 'Super Admin' && (roleChanges || deactivates)) {
            if ((await otherActiveSuperAdmins(target._id)) === 0) {
                return res.status(400).json({
                    message: "You can't remove the last Super Admin account."
                });
            }
        }

        // Self-lockout guard: you cannot demote or deactivate your own
        // account from the panel — another admin has to do it.
        if (String(req.user?._id) === String(target._id) && (roleChanges || deactivates)) {
            return res.status(400).json({
                message: 'You cannot change your own role or deactivate your own account.'
            });
        }

        // Document save (not findByIdAndUpdate) so schema validators run
        // and the password pre-save hook fires when a new password was
        // set. When no password was provided the field is never touched,
        // so the stored hash is preserved exactly.
        target.set(updateData);
        if (wantsPasswordChange) {
            target.password = password;
        }
        await target.save();

        const user = await User.findById(target._id).select('-password');
        res.json(user);
    } catch (error) {
        // Duplicate key (a race past the email pre-check above) gets
        // the same clean message — never the raw MongoDB text.
        if (error?.code === 11000) {
            return res.status(400).json({ message: 'A user with this email already exists.' });
        }
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

        // Ownership rule (Ahsan): only a Super Admin may delete another
        // account. Deleting your OWN account is allowed — self-service
        // (the last-Super-Admin guard below still applies on top, so
        // the final active Super Admin cannot delete itself either).
        if (req.user?.role !== 'Super Admin'
            && String(req.user?._id) !== String(target._id)) {
            return res.status(403).json({
                message: 'Only a Super Admin can delete another account.'
            });
        }

        if (target.role === 'Super Admin' && target.isActive !== false
            && (await otherActiveSuperAdmins(target._id)) === 0) {
            return res.status(400).json({
                message: "You can't remove the last Super Admin account."
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

