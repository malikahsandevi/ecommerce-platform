const User = require('../models/User');
const Order = require('../models/Order');
// Registered so Order's coupon populate can resolve its code.
require('../models/Coupon');
const { getAllRoleNames, getEffectivePermissions } = require('../utils/permissions');
const { NOT_DELETED, applySoftDelete } = require('../utils/softDelete');
const { detachForDelete } = require('../utils/deleteImpact');
const { sendError } = require('../utils/apiError');

const FAVORITE_CATEGORY_LIMIT = 3;
const favoriteCategoryError = (res) =>
    res.status(400).json({
        message: `Favorite categories are limited to ${FAVORITE_CATEGORY_LIMIT}. Remove one before adding another.`
    });

// ── Read scoping (Claude 8.3 verification round) ───────────────────
// ONE collection backs two panel modules — Customers (storefront
// accounts) and Users (panel accounts) — and the route guard admits a
// caller holding EITHER module's view. The records a caller may READ
// follow the same split as the write guards in routes/users.js: a
// caller without Users view sees customer records only, and a caller
// without Customers view sees staff records only. Before this, any
// Customers-view role (Editor, Support…) received every staff
// account's name, email and role from these reads.
const callerReadScope = async (req) => {
    const perms = await getEffectivePermissions(req.user.role);
    return {
        canStaff: Boolean(perms?.Users?.view),
        canCustomers: Boolean(perms?.Customers?.view),
    };
};

const scopeFilter = (scope) => {
    if (scope.canStaff && scope.canCustomers) return {};
    if (scope.canCustomers) return { role: 'Customer' };
    if (scope.canStaff) return { role: { $ne: 'Customer' } };
    return { role: '__none__' };
};

const targetInScope = (scope, target) => {
    if (!target) return false;
    return target.role === 'Customer' ? scope.canCustomers : scope.canStaff;
};

// @desc    Get all users (customers)
// @route   GET /api/users
// @access  Admin
const getUsers = async (req, res) => {
    try {
        const scope = await callerReadScope(req);
        const users = await User.find({ ...NOT_DELETED, ...scopeFilter(scope) }).select('-password');
        await User.withCodes(users);
        res.json(users);
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Admin
const getUserById = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, ...NOT_DELETED }).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Out-of-scope records answer exactly like missing ones — a
        // Customers-only caller cannot confirm a staff account exists.
        if (!targetInScope(await callerReadScope(req), user)) {
            return res.status(404).json({ message: 'User not found' });
        }
        await User.withCodes(user);
        res.json(user);
    } catch (error) {
        sendError(res, error, 500);
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
        const existing = await User.findOne({ email: normalizedEmail, ...NOT_DELETED });
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
        sendError(res, error, 400);
    }
};

// Counts ACTIVE Super Admins other than the given user — the store must
// always keep at least one, or nobody can administer it.
const otherActiveSuperAdmins = async (excludeId) => {
    return User.countDocuments({
        role: 'Super Admin',
        isActive: { $ne: false },
        ...NOT_DELETED,
        _id: { $ne: excludeId },
    });
};

// @desc    Update a user (profile, role, active status, password)
// @route   PUT /api/users/:id
// @access  Admin
const updateUser = async (req, res) => {
    try {
        const { password, currentPassword, confirmPassword, ...updateData } = req.body || {};

        // Server-owned fields never ride a profile update: the
        // soft-delete stamps (soft delete / Deleted Items own them)
        // and the account's security material — 2FA state and reset
        // tokens change only through their dedicated endpoints. A
        // body carrying them (a stray field, or a self-edit trying to
        // switch its own 2FA off) must not apply them.
        delete updateData.deletedAt;
        delete updateData.deletedBy;
        delete updateData.deletedUniques;
        delete updateData.deletedLinks;
        delete updateData.twoFactorSecret;
        delete updateData.twoFactorEnabled;
        delete updateData.passwordResetTokenHash;
        delete updateData.passwordResetExpires;

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
        const target = await User.findOne({ _id: req.params.id, ...NOT_DELETED }).select('+password');
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
                    ...NOT_DELETED,
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
        sendError(res, error, 400);
    }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
// @access  Admin
const deleteUser = async (req, res) => {
    try {
        const target = await User.findOne({ _id: req.params.id, ...NOT_DELETED });
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

        // Delete-impact: a customer leaves every coupon's user scope
        // (snapshotted for restore). Orders and reviews are history —
        // never touched. Staff accounts have no detachments.
        if (target.role === 'Customer') {
            const snapshot = await detachForDelete('customers', target);
            if (snapshot) target.set('deletedLinks', snapshot);
        }

        applySoftDelete(User, target, req.user?._id);
        await target.save();
        res.json({ message: 'User removed successfully' });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @desc    Reset a staff account's two-factor authentication
// @route   POST /api/users/:id/reset-2fa
// @access  Super Admin only (the route enforces the role, and the
//          Settings Lock save gate verifies the caller's own password
//          for this save — a 2FA reset is a Settings → Users & Roles
//          write like any other staff administration). Clearing the
//          secret + flag means the account enrols again at its next
//          sign-in: mandatory enrolment happens in the login flow
//          itself, so a reset can never leave an account without 2FA
//          for longer than until its next login.
const resetUserTwoFactor = async (req, res) => {
    try {
        const target = await User.findOne({ _id: req.params.id, ...NOT_DELETED }).select('+twoFactorSecret');
        if (!target) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Customer accounts never sign in to the panel and hold no
        // panel 2FA — there is nothing to reset on them.
        if (target.role === 'Customer') {
            return res.status(400).json({
                message: 'Customer accounts do not use two-factor authentication.'
            });
        }
        // No self-reset from inside a session: your own 2FA is managed
        // by signing in (a reset here would let a hijacked session
        // strip its own second factor with no code at all).
        if (String(req.user?._id) === String(target._id)) {
            return res.status(400).json({
                message: "You can't reset your own two-factor authentication."
            });
        }

        target.twoFactorEnabled = false;
        target.twoFactorSecret = null;
        // Recovery codes die with the reset (GAP B) — they belong to
        // the old enrolment; the member gets a fresh set when they
        // enrol again at their next sign-in.
        target.twoFactorRecoveryCodes = [];
        await target.save();

        const user = await User.findById(target._id).select('-password');
        await User.withCodes(user);
        res.json(user);
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @desc    Get a customer's full shopping profile
// @route   GET /api/users/:id/profile
// @access  Admin
// The STORED lists (favorites, liked, cart, favoriteCategories) come
// off the User record, populated with product/category names + images.
// Everything transactional is DERIVED from the customer's Orders on
// every request — purchased history, total spend (non-cancelled,
// non-refunded orders), order count, average order value, last order date and the
// distinct coupons used with their counts — so it can never go stale
// and nothing is invented for customers without orders.
// A product's main image: the `image` mirror first, then the gallery
// (main entry, else first) — a record whose mirror was never written
// still shows its photo instead of the initial-letter tile.
const mainImageOf = (product) =>
    product.image ||
    product.images?.find((entry) => entry && (entry.isMain ?? entry.isPrimary))?.url ||
    product.images?.[0]?.url ||
    '';

const productBrief = (product) =>
    product
        ? {
              id: product._id,
              name: product.name || '',
              image: mainImageOf(product),
              price: product.price ?? null,
          }
        : null;

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, ...NOT_DELETED })
            .select('-password')
            .populate('favorites', 'name image images price')
            .populate('liked', 'name image images price')
            .populate('cart.product', 'name image images price')
            .populate('favoriteCategories', 'name image');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!targetInScope(await callerReadScope(req), user)) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Orders carry a required `user` ref — that is the match.
        const orders = await Order.find({ user: user._id, ...NOT_DELETED })
            .sort({ createdAt: -1 })
            .populate('coupon', 'code discountType discountValue')
            // Line items fall back to the product's own image when the
            // order's snapshot carries none (older/seeded orders).
            .populate('items.product', 'image images')
            .lean();

        // The money set: an order counts toward spend, order count,
        // AOV and last-order date only while its money stayed with the
        // store — cancelled orders never took money and refunded
        // orders handed it back (the dashboard's revenue rule; a
        // customer who was refunded did not spend the money). The raw
        // history list below still shows every order with its status.
        const activeOrders = orders.filter(
            (order) => order.status !== 'cancelled' && order.status !== 'refunded'
        );
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

        // The line's own snapshot wins; the populated product is the
        // fallback for orders whose snapshot never carried an image.
        const itemImage = (item) => {
            if (item.image) return item.image;
            const product =
                item.product && typeof item.product === 'object' ? item.product : null;
            return product ? mainImageOf(product) : '';
        };

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
                image: itemImage(item),
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
                    image: itemImage(item),
                    quantity: item.quantity,
                    price: item.price,
                    orderNumber: order.orderNumber,
                    date: order.createdAt,
                })),
            ),
            usedCoupons: [...couponUsage.values()],
        });
    } catch (error) {
        sendError(res, error, 500);
    }
};

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    resetUserTwoFactor,
    getUserProfile
};

