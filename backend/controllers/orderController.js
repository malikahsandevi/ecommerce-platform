const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { logActivity } = require('../utils/activity');
const { resolveCoupon, recordCouponUse } = require('../utils/coupon');
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

        // Every line must point at a real product with enough stock —
        // placing the order takes the units out of inventory.
        for (const item of data.items) {
            const product = await Product.findOne({ _id: item.product, ...NOT_DELETED }).select('stock name').lean();
            if (!product) {
                return res.status(400).json({ message: 'One of the ordered products no longer exists.' });
            }
            if ((product.stock ?? 0) < (item.quantity || 0)) {
                return res.status(400).json({
                    message: `Not enough stock for "${product.name}" — ${product.stock ?? 0} left, ${item.quantity} requested.`,
                });
            }
        }

        // Coupon (optional): a caller may pass `couponCode` — the admin's
        // Create Order form does. The shared resolver (utils/coupon.js)
        // validates it against the real coupon rules and computes the
        // discount from the items subtotal; any rule failure aborts the
        // order with the resolver's message — no phantom discount is
        // ever stored. Callers that pass no code (the storefront today)
        // skip this entirely and keep their exact previous behaviour.
        const couponCode = typeof data.couponCode === 'string' ? data.couponCode.trim() : '';
        delete data.couponCode;
        let appliedCoupon = null;
        if (couponCode) {
            const subtotal = Number(data.subtotal) || 0;
            const resolved = await resolveCoupon(couponCode, subtotal);
            appliedCoupon = resolved.coupon;
            data.coupon = appliedCoupon._id;
            data.discount = resolved.discount;
            data.total =
                Math.round(
                    (subtotal -
                        resolved.discount +
                        (Number(data.tax) || 0) +
                        (Number(data.shippingCost) || 0)) *
                        100
                ) / 100;
        }

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

        // The redemption counts only once the order carrying it exists.
        if (appliedCoupon) await recordCouponUse(appliedCoupon._id);

        await adjustStock(order.items, -1);

        const userDoc = order.user
            ? await User.findById(order.user).select('firstName lastName email').lean()
            : null;
        await logActivity(
            'PURCHASE',
            `Order ${order.orderNumber} placed by ${customerLabel(userDoc)} — $${Number(order.total || 0).toFixed(2)}`,
            { orderId: order._id, customerId: order.user || undefined }
        );
        await logLowStockAlerts(order.items);

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

        Object.assign(order, req.body);

        // Fulfilment timestamps follow the status, so the record shows
        // when the parcel actually left / arrived.
        if (nextStatus === 'shipped' && !order.shippedAt) order.shippedAt = new Date();
        if (nextStatus === 'delivered' && !order.deliveredAt) order.deliveredAt = new Date();

        const updated = await order.save();

        if (nextStatus !== previousStatus) {
            // Cancelling returns the reserved units to inventory.
            if (nextStatus === 'cancelled') {
                await adjustStock(order.items, +1);
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

        // A deleted live order frees its stock again; a cancelled order
        // already returned it when it was cancelled. Restoring the
        // order (Settings → Deleted Items) takes the stock back out —
        // the exact inverse, run by the trash controller.
        if (order.status !== 'cancelled') {
            await adjustStock(order.items, +1);
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
    // stock a soft delete returned.
    adjustStock
};
