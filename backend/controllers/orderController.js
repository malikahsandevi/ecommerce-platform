const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { logActivity } = require('../utils/activity');
const { resolveCoupon, recordCouponUse, releaseCouponUse } = require('../utils/coupon');
const { sendOrderConfirmationEmail, sendOrderStatusEmail } = require('../utils/emailTemplates');
const { NOT_DELETED, applySoftDelete } = require('../utils/softDelete');

// Human-readable, unique order numbers: ORD-YYMMDD-XXXX where XXXX is a
// random block. The admin panel used to invent these in the browser from a
// timestamp slice, which collided whenever two orders landed close
// together; the server owns generation now. The save path retries with a
// fresh suffix when the unique index still reports a collision.
const generateOrderNumber = () => {
    const now = new Date();
    const datePart = [
        String(now.getFullYear()).slice(-2),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('');
    const randomPart = String(Math.floor(1000 + Math.random() * 9000));
    return `ORD-${datePart}-${randomPart}`;
};

const customerLabel = (userDoc) => {
    const name = [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(' ').trim();
    return name || userDoc?.email || 'A customer';
};

// The two order statuses in which the order's stock is RETURNED to
// the shelf and its coupon redemption is NOT counted. One state rule
// drives both resources, symmetrically, on every crossing:
//
//   stock is out ⟺ the order is live (not trashed) and its status is
//   not cancelled/refunded — and the coupon's usedCount includes this
//   order under exactly the same condition.
//
// Entering the set returns the units and releases the redemption;
// leaving it takes the units back out and re-records the redemption
// (without re-checking the coupon's limits — the use was legitimate
// when it was made); moving INSIDE the set (cancelled ↔ refunded)
// moves nothing. Trashing behaves like entering the set, restoring
// like leaving it.
const STOCK_RETURNED_STATUSES = ['cancelled', 'refunded'];
const statusReturnsStock = (status) => STOCK_RETURNED_STATUSES.includes(status);

/**
 * Whether this order's coupon redemption is currently inside the
 * coupon's usedCount, per the marker stored on the order. Orders
 * saved before the marker existed have none: the old code recorded
 * the use at creation and never released it, so their use is still
 * counted — a missing marker reads as true.
 */
const couponIsCounted = (order) => {
    if (!order.coupon) return false;
    if (typeof order.couponCounted === 'boolean') return order.couponCounted;
    return true;
};

/**
 * Brings the coupon's usedCount in line with the order's current
 * state (the rule above), moving the counter only on a real crossing
 * and pinning the marker on the order to match. Returns true when the
 * marker on the passed document changed — the caller saves it (every
 * call site saves the order around its side effects anyway).
 */
const syncCouponUse = async (order) => {
    if (!order.coupon) return false;
    const shouldCount = !order.deletedAt && !statusReturnsStock(order.status);
    const counted = couponIsCounted(order);
    if (shouldCount !== counted) {
        if (shouldCount) await recordCouponUse(order.coupon);
        else await releaseCouponUse(order.coupon);
    }
    if (order.couponCounted !== shouldCount) {
        order.couponCounted = shouldCount;
        return true;
    }
    return false;
};

// Moves stock for every line of an order. direction -1 takes stock out
// (order placed), +1 puts it back (order cancelled / deleted). Products
// that no longer exist are skipped — the order snapshot stays valid.
const adjustStock = async (items, direction) => {
    for (const item of items || []) {
        if (!item.product || !item.quantity) continue;
        await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: direction * item.quantity } }
        );
    }
};

// After stock has been taken out, any line whose product dropped to (or
// below) its low-stock threshold earns a STOCK_ALERT entry — this is what
// the dashboard's Recent Activity feed shows as "X is running low".
const logLowStockAlerts = async (items) => {
    for (const item of items || []) {
        if (!item.product) continue;
        const product = await Product.findOne({ _id: item.product, ...NOT_DELETED })
            .select('name stock lowStockThreshold')
            .lean();
        if (!product) continue;
        const threshold = product.lowStockThreshold ?? 10;
        if (product.stock <= threshold) {
            await logActivity(
                'STOCK_ALERT',
                `${product.name} is running low (${product.stock} left)`,
                { productId: product._id }
            );
        }
    }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Admin
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find({ ...NOT_DELETED }).populate('user', 'firstName lastName email avatar').populate('coupon', 'code');
        await Order.withCodes(orders);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Admin
const getOrderById = async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, ...NOT_DELETED }).populate('user', 'firstName lastName email avatar').populate('coupon', 'code');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        await Order.withCodes(order);
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new order
// @route   POST /api/orders
// @access  Admin (router requires a signed-in staff token)
const createOrder = async (req, res) => {
    try {
        const data = { ...req.body };

        if (!Array.isArray(data.items) || data.items.length === 0) {
            return res.status(400).json({ message: 'An order needs at least one item.' });
        }

        // The order must belong to a real, live customer record — an
        // order pointing at a missing or trashed user is an orphan the
        // moment it is written (both callers — the admin form and the
        // storefront's find-or-create — always pass a real one).
        const customer = data.user
            ? await User.findOne({ _id: data.user, ...NOT_DELETED }).select('_id').lean()
            : null;
        if (!customer) {
            return res.status(400).json({ message: 'The selected customer was not found.' });
        }

        // Every line must point at a real product with enough stock —
        // placing the order takes the units out of inventory. Quantities
        // are aggregated per product first: two lines of 6 against a
        // stock of 10 must not pass one by one and drive the stock
        // negative. Prices are re-read from the product documents and
        // the subtotal is recomputed here — the amounts recorded (and
        // the coupon discount below) never trust a caller-supplied
        // price or subtotal.
        const quantityByProduct = new Map();
        for (const item of data.items) {
            const key = String(item.product || '');
            quantityByProduct.set(key, (quantityByProduct.get(key) || 0) + (Number(item.quantity) || 0));
        }
        const pricedItems = [];
        const couponLines = [];
        let computedSubtotal = 0;
        for (const item of data.items) {
            const product = await Product.findOne({ _id: item.product, ...NOT_DELETED })
                .select('stock name sku price image category')
                .lean();
            if (!product) {
                return res.status(400).json({ message: 'One of the ordered products no longer exists.' });
            }
            const wanted = quantityByProduct.get(String(item.product)) || 0;
            if ((product.stock ?? 0) < wanted) {
                return res.status(400).json({
                    message: `Not enough stock for "${product.name}" — ${product.stock ?? 0} left, ${wanted} requested.`,
                });
            }
            const quantity = Number(item.quantity) || 0;
            const price = Number(product.price) || 0;
            computedSubtotal += price * quantity;
            // The coupon resolver's scoping view of this line: which
            // product, which category it belongs to, what it totals.
            couponLines.push({
                product: product._id,
                category: product.category || null,
                lineTotal: price * quantity,
            });
            pricedItems.push({
                ...item,
                name: item.name || product.name,
                sku: item.sku || product.sku,
                price,
                quantity,
                image: item.image || product.image || '',
            });
        }
        data.items = pricedItems;
        data.subtotal = Math.round(computedSubtotal * 100) / 100;

        // Coupon (optional): a caller may pass `couponCode` — the admin's
        // Create Order form does. The shared resolver (utils/coupon.js)
        // validates it against the real coupon rules and computes the
        // discount from the items subtotal; any rule failure aborts the
        // order with the resolver's message — no phantom discount is
        // ever stored. Callers that pass no code (the storefront today)
        // skip this entirely and keep their exact previous behaviour.
        const couponCode = typeof data.couponCode === 'string' ? data.couponCode.trim() : '';
        delete data.couponCode;
        // The coupon-counted marker is server-owned: a fresh order
        // starts uncounted, and the sync after the save records the
        // redemption when the created state is a counted one.
        data.couponCounted = false;
        let appliedCoupon = null;
        if (couponCode) {
            const resolved = await resolveCoupon(couponCode, {
                subtotal: data.subtotal,
                userId: data.user,
                lines: couponLines,
            });
            appliedCoupon = resolved.coupon;
            data.coupon = appliedCoupon._id;
            data.discount = resolved.discount;
        }
        // A discount exists only as a resolved coupon's discount: with
        // no coupon code there is no discount and no coupon reference,
        // whatever the caller sent.
        if (!appliedCoupon) {
            data.discount = 0;
            data.coupon = undefined;
        }
        // The total is always derived here from the recomputed subtotal
        // (never taken from the caller): subtotal − discount + tax +
        // shipping. Tax and shipping stay caller-set — no server-side
        // rule computes them — but they can no longer smuggle a wrong
        // subtotal or discount into the recorded total.
        data.total =
            Math.round(
                (data.subtotal -
                    (Number(data.discount) || 0) +
                    (Number(data.tax) || 0) +
                    (Number(data.shippingCost) || 0)) *
                    100
            ) / 100;

        // Generate the order number here unless the caller supplied one.
        let order = null;
        let lastError = null;
        for (let attempt = 0; attempt < 5 && !order; attempt++) {
            try {
                order = await new Order({
                    ...data,
                    orderNumber: data.orderNumber || generateOrderNumber(),
                }).save();
            } catch (error) {
                // 11000 = duplicate key. Only an order-number collision is
                // worth retrying (with a fresh number); anything else is a
                // real validation problem.
                if (error.code === 11000 && !data.orderNumber) {
                    lastError = error;
                    continue;
                }
                throw error;
            }
        }
        if (!order) throw lastError || new Error('Could not create the order.');

        // The state rule applies from birth: an order created directly
        // in a stock-returned status (cancelled/refunded) never takes
        // stock out and its redemption never counts; any other order
        // takes its stock out now, and the redemption is recorded now
        // that the order carrying it exists.
        const stockOut = !statusReturnsStock(order.status);
        if (stockOut) {
            await adjustStock(order.items, -1);
        }
        if (await syncCouponUse(order)) {
            await order.save();
        }

        const userDoc = order.user
            ? await User.findById(order.user).select('firstName lastName email').lean()
            : null;
        await logActivity(
            'PURCHASE',
            `Order ${order.orderNumber} placed by ${customerLabel(userDoc)} — $${Number(order.total || 0).toFixed(2)}`,
            { orderId: order._id, customerId: order.user || undefined }
        );
        if (stockOut) await logLowStockAlerts(order.items);

        // Order confirmation email to the customer. Fail-soft: the
        // helper never throws (no email service configured → logged and
        // skipped), so the order succeeds identically either way. This
        // controller is also the storefront's placement path (it invokes
        // createOrder), so guest checkouts get the same email.
        if (userDoc?.email) {
            await sendOrderConfirmationEmail({
                to: userDoc.email,
                customerName: customerLabel(userDoc),
                order,
            });
        }

        res.status(201).json(order);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update an order (status / payment / fulfilment fields)
// @route   PUT /api/orders/:id
// @access  Admin
const updateOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const previousStatus = order.status;
        const nextStatus = req.body.status || previousStatus;

        // Only the fields an order update may legitimately change are
        // applied — the lifecycle/payment/shipping surface the admin's
        // edit form sends. Anything else in the body (items, totals,
        // subtotal, discount, coupon, customer, order number) is
        // ignored: those are fixed at creation and guarded by the
        // stock/coupon invariants, so a stray or hostile field can no
        // longer rewrite an order's money or contents after the fact.
        const UPDATABLE_FIELDS = [
            'status',
            'paymentStatus',
            'paymentMethod',
            'paymentId',
            'transactionId',
            'shippingCarrier',
            'trackingNumber',
            'notes',
            'shippingAddress',
            'billingAddress',
        ];
        for (const field of UPDATABLE_FIELDS) {
            if (req.body[field] !== undefined) order[field] = req.body[field];
        }

        // Fulfilment timestamps follow the status, so the record shows
        // when the parcel actually left / arrived.
        if (nextStatus === 'shipped' && !order.shippedAt) order.shippedAt = new Date();
        if (nextStatus === 'delivered' && !order.deliveredAt) order.deliveredAt = new Date();

        const updated = await order.save();

        // The coupon redemption follows the state rule on EVERY
        // update: entering cancelled/refunded releases it, leaving
        // re-records it (no limit re-check — the use was legitimate
        // when made), moving inside the set changes nothing. The
        // marker on the order makes each crossing happen exactly once.
        if (await syncCouponUse(order)) {
            await order.save();
        }

        if (nextStatus !== previousStatus) {
            // Stock follows the same rule, crossing the boundary of
            // the stock-returned set: entering it (cancelled OR
            // refunded) returns the reserved units, LEAVING it takes
            // them back out — the exact inverse, mirroring how a trash
            // restore re-reserves. Moving inside the set (cancelled ↔
            // refunded) moves nothing: the units are already back.
            const wasReturned = statusReturnsStock(previousStatus);
            const isReturned = statusReturnsStock(nextStatus);
            if (isReturned && !wasReturned) {
                await adjustStock(order.items, +1);
            } else if (wasReturned && !isReturned) {
                await adjustStock(order.items, -1);
            }
            await logActivity(
                'STATUS_CHANGE',
                `Order ${order.orderNumber} status changed from ${previousStatus} to ${nextStatus}`,
                { orderId: order._id, customerId: order.user || undefined }
            );

            // Status-update email to the customer (fail-soft, like the
            // confirmation — see createOrder).
            const userDoc = order.user
                ? await User.findById(order.user).select('firstName lastName email').lean()
                : null;
            if (userDoc?.email) {
                await sendOrderStatusEmail({
                    to: userDoc.email,
                    customerName: customerLabel(userDoc),
                    order: updated,
                    previousStatus,
                });
            }
        }

        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Delete an order (soft — Settings → Deleted Items)
// @route   DELETE /api/orders/:id
// @access  Admin
const deleteOrder = async (req, res) => {
    try {
        // Only a live order can be deleted: a second delete answers
        // 404, so the stock below can never be returned twice.
        const order = await Order.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        applySoftDelete(Order, order, req.user?._id);
        await order.save();

        // A deleted live order frees its stock again; a cancelled or
        // refunded order already returned it when it entered that
        // status. Restoring the order (Settings → Deleted Items) takes
        // the stock back out — the exact inverse, run by the trash
        // controller.
        if (!statusReturnsStock(order.status)) {
            await adjustStock(order.items, +1);
        }

        // Trashing also releases the order's coupon redemption — the
        // redemption counts only while the order is live (the state
        // rule). Restoring the order re-records it.
        if (await syncCouponUse(order)) {
            await order.save();
        }

        res.json({ message: 'Order removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getOrders,
    getOrderById,
    createOrder,
    updateOrder,
    deleteOrder,
    // Shared with the Deleted Items restore, which re-reserves the
    // stock a soft delete returned and re-records the coupon
    // redemption it released.
    adjustStock,
    statusReturnsStock,
    syncCouponUse
};
