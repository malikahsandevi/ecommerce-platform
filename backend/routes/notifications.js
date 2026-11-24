const express = require('express');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const User = require('../models/User');
const { NOT_DELETED } = require('../utils/softDelete');
const { getStorageEntries, resolveUploadTargetDetailed } = require('../utils/credentials');

const router = express.Router();

router.use(protect, requireStaff);

// A product at or below this stock level (but not empty) is "low stock".
const LOW_STOCK_MAX = 5;
// Each feed is capped so the TopBar panels stay scannable.
const FEED_LIMIT = 15;

const displayName = (user) => {
    if (!user) return 'A customer';
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return full || user.username || user.email || 'A customer';
};

// GET /api/notifications
// Both TopBar feeds, derived live from real store data on every call —
// nothing is stored, so a feed can never drift from the store itself.
//
//   notifications (bell — store/system events):
//     · products out of stock (stock 0) and low on stock (1..5)
//     · the newest orders not yet delivered/cancelled
//     · ONE aggregate item when reviews await moderation
//     · a storage rotation shift, while one is in effect (a storage
//       account at 80% of quota → Auto uploads moved to the next one)
//   inbox (messages — customer-originated):
//     · each review awaiting moderation, individually
//     · the newest customer signups
//
// Every item carries a stable id (entity + the state that produced it,
// so a changed state re-lights the badge), an English title, a real
// timestamp where one exists, and a click-through target (page path +
// record id + a `search` term the target list page pre-applies to its
// search box, so the clicked record is in the visible results on
// arrival — the record's unique public code where it has one, the
// order number for orders, the email for customers).
// Read markers live on the client (per device + user).
router.get('/', async (req, res) => {
    try {
        const [
            outOfStock,
            lowStock,
            openOrders,
            pendingReviews,
            pendingCount,
            newCustomers,
        ] = await Promise.all([
            Product.find({ stock: 0, ...NOT_DELETED })
                .sort({ updatedAt: -1 })
                .limit(FEED_LIMIT)
                .select('name stock updatedAt code')
                .lean(),
            Product.find({ stock: { $gte: 1, $lte: LOW_STOCK_MAX }, ...NOT_DELETED })
                .sort({ stock: 1, updatedAt: -1 })
                .limit(FEED_LIMIT)
                .select('name stock updatedAt code')
                .lean(),
            Order.find({ status: { $nin: ['delivered', 'cancelled'] }, ...NOT_DELETED })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('orderNumber status createdAt')
                .lean(),
            Review.find({ status: 'pending', ...NOT_DELETED })
                .sort({ createdAt: -1 })
                .limit(FEED_LIMIT)
                .populate('product', 'name')
                .populate('user', 'firstName lastName username email')
                .lean(),
            Review.countDocuments({ status: 'pending', ...NOT_DELETED }),
            User.find({ role: 'Customer', ...NOT_DELETED })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('firstName lastName username email createdAt')
                .lean(),
        ]);

        const notifications = [];

        for (const p of outOfStock) {
            notifications.push({
                id: `stock-out:${p._id}:${new Date(p.updatedAt).getTime()}`,
                type: 'stock_out',
                title: `Out of stock: ${p.name}`,
                time: p.updatedAt,
                path: '/products',
                recordId: String(p._id),
                search: p.code || p.name,
            });
        }
        for (const p of lowStock) {
            notifications.push({
                id: `stock-low:${p._id}:${p.stock}:${new Date(p.updatedAt).getTime()}`,
                type: 'stock_low',
                title: `Low stock: ${p.name} — ${p.stock} left`,
                time: p.updatedAt,
                path: '/products',
                recordId: String(p._id),
                search: p.code || p.name,
            });
        }
        for (const o of openOrders) {
            notifications.push({
                id: `order:${o._id}`,
                type: 'order_new',
                title: `New order #${o.orderNumber}`,
                time: o.createdAt,
                path: '/orders',
                recordId: String(o._id),
                search: o.orderNumber,
            });
        }
        if (pendingCount > 0) {
            const newest = pendingReviews[0];
            notifications.push({
                id: `reviews-pending:${pendingCount}`,
                type: 'reviews_pending',
                title: `${pendingCount} review${pendingCount === 1 ? '' : 's'} pending approval`,
                time: newest ? newest.createdAt : new Date(),
                path: '/reviews',
                recordId: newest ? String(newest._id) : null,
                search: newest ? newest.code || newest.product?.name || null : null,
            });
        }

        // Storage rotation: when Auto has shifted new uploads off a
        // storage whose account reached 80% of its quota, say so.
        // Derived live from the same resolver state that decides the
        // uploads themselves, so the notice can never drift from
        // reality; it only exists while the shift is in effect (a
        // pinned destination never produces one). A storage check
        // must never break the feed, hence the guarded block.
        try {
            const storageEntries = await getStorageEntries();
            const usable = storageEntries.filter(
                (entry) => entry.subService === 'cloudinary' && entry.configured && entry.isConnected,
            );
            if (usable.length > 1) {
                const detail = await resolveUploadTargetDetailed();
                if (detail.mode === 'auto' && detail.shiftedFrom && detail.pool) {
                    notifications.push({
                        id: `storage-shift:${detail.shiftedFrom.key}:${detail.pool.key}`,
                        type: 'storage_shift',
                        title: `Storage space: ${detail.shiftedFrom.title} is ${Math.round(detail.shiftedFrom.percent)}% used — uploads have shifted to ${detail.pool.title}`,
                        time: new Date(),
                        path: '/media',
                        recordId: null,
                        search: null,
                    });
                }
            }
        } catch {
            /* storage state is best-effort in this feed */
        }

        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

        const inbox = [];
        for (const r of pendingReviews) {
            inbox.push({
                id: `review:${r._id}`,
                type: 'review_pending',
                title: `${displayName(r.user)} rated ${r.product?.name || 'a product'} ${r.rating}★`,
                time: r.createdAt,
                path: '/reviews',
                recordId: String(r._id),
                search: r.code || r.product?.name || null,
            });
        }
        for (const u of newCustomers) {
            inbox.push({
                id: `customer:${u._id}`,
                type: 'customer_new',
                title: `New customer: ${displayName(u)}`,
                time: u.createdAt,
                path: '/customers',
                recordId: String(u._id),
                search: u.email || displayName(u),
            });
        }
        inbox.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json({
            notifications: notifications.slice(0, FEED_LIMIT),
            inbox: inbox.slice(0, FEED_LIMIT),
            pendingReviews: pendingCount,
        });
    } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ message: 'Failed to load notifications' });
    }
});

module.exports = router;
