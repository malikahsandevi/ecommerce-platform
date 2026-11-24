const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { logActivity } = require('../utils/activity');
const { resolveCoupon, recordCouponUse, releaseCouponUse, claimCouponUse } = require('../utils/coupon');
const { sendOrderConfirmationEmail, sendOrderStatusEmail } = require('../utils/emailTemplates');
const { NOT_DELETED } = require('../utils/softDelete');
const { transactionsSupported, withTransaction } = require('../utils/transactions');

/**
 * Thrown inside a TRANSACTIONAL placement when the order-number
 * lottery collides: a failed insert can poison the transaction it
 * ran in, so instead of retrying the save inside it, the whole unit
 * is retried with a fresh number — the abort leaves nothing behind,
 * so the fresh attempt starts clean. The sequential path never
 * throws this: it retries the save in place, as it always has.
 */
class OrderNumberRetry extends Error {
    constructor(cause) {
        super(cause.message);
        this.name = 'OrderNumberRetry';
        this.cause = cause;
    }
}

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
const syncCouponUse = async (order, session) => {
    if (!order.coupon) return false;
    const shouldCount = !order.deletedAt && !statusReturnsStock(order.status);
    const counted = couponIsCounted(order);
    if (shouldCount !== counted) {
        if (shouldCount) await recordCouponUse(order.coupon, session);
        else await releaseCouponUse(order.coupon, session);
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
// `session` (optional) joins the writes to the caller's transaction.
const adjustStock = async (items, direction, session) => {
    for (const item of items || []) {
        if (!item.product || !item.quantity) continue;
        await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: direction * item.quantity } },
            session ? { session } : undefined
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

        // The trash stamps are server-owned (soft delete writes them,
        // the Deleted Items restore clears them): a create body must
        // never smuggle them in — an order born with a deletedAt would
        // be invisible everywhere while its stock and coupon effects
        // still ran.
        delete data.deletedAt;
        delete data.deletedBy;
        delete data.deletedUniques;
        delete data.deletedLinks;

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

        // Every line must point at a real product — placing the order
        // takes the units out of inventory. Quantities are aggregated
        // per product first (the reservationQty map built in the loop
        // below): two lines of 6 against a stock of 10 must not pass
        // one by one and drive the stock negative. Prices are re-read
        // from the product documents and the subtotal is recomputed
        // here — the amounts recorded (and the coupon discount below)
        // never trust a caller-supplied price or subtotal.
        const pricedItems = [];
        const couponLines = [];
        const productById = new Map();
        const reservationQty = new Map();
        let computedSubtotal = 0;
        for (const item of data.items) {
            const product = await Product.findOne({ _id: item.product, ...NOT_DELETED })
                .select('stock name sku price image category')
                .lean();
            if (!product) {
                return res.status(400).json({ message: 'One of the ordered products no longer exists.' });
            }
            productById.set(String(product._id), product);
            // No stock DECISION is taken from this read: between the
            // read and the write another order could take the units.
            // The atomic reservation below is the only stock check —
            // this loop prices the lines. The reservation plan is
            // aggregated here, keyed by the product's canonical id,
            // so it can never drift from the priced lines.
            const quantity = Number(item.quantity) || 0;
            reservationQty.set(
                String(product._id),
                (reservationQty.get(String(product._id)) || 0) + quantity
            );
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

        // The state rule applies from birth: an order created directly
        // in a stock-returned status (cancelled/refunded) never takes
        // stock out and its redemption never counts.
        const bornStatus = data.status || 'pending';
        const stockOut = !statusReturnsStock(bornStatus);

        // ── Placement: reservations + coupon claim + the order ──────
        // The writes below form ONE unit — the order must never exist
        // without its stock out and its redemption counted, nor the
        // reverse. When the deployment's MongoDB supports
        // transactions (Atlas / any replica set), the unit runs in a
        // session transaction (utils/transactions): it commits whole
        // or aborts whole, so even a hard crash mid-sequence leaves
        // nothing partial behind. On a standalone server the SAME
        // steps run sequentially with the manual rollbacks — every
        // step already atomic on its own — exactly as before. A
        // refusal inside the unit is thrown as an Error and answered
        // by the outer catch with the same 400 + message the direct
        // returns produced.
        const placeOrder = async (session) => {
            // ── Atomic stock reservation ────────────────────────────
            // Each product's units are taken with ONE conditional
            // update (stock must still cover the aggregated quantity),
            // so two orders placed at the same moment can never both
            // take the last units or drive the stock negative — the
            // loser fails here and every reservation already made for
            // this order is rolled back before the refusal answers.
            // (Inside a transaction the manual rollback stands down:
            // the abort undoes the reservations itself.)
            const reservations = [];
            const rollbackReservations = async () => {
                if (session) return;
                for (const held of reservations) {
                    // eslint-disable-next-line no-await-in-loop
                    await Product.updateOne({ _id: held.id }, { $inc: { stock: held.qty } });
                }
                reservations.length = 0;
            };
            if (stockOut) {
                for (const [productKey, qty] of reservationQty) {
                    if (!qty) continue;
                    const product = productById.get(productKey);
                    if (!product) continue;
                    // eslint-disable-next-line no-await-in-loop
                    const taken = await Product.updateOne(
                        { _id: product._id, ...NOT_DELETED, stock: { $gte: qty } },
                        { $inc: { stock: -qty } },
                        session ? { session } : undefined
                    );
                    if (taken.modifiedCount !== 1) {
                        // eslint-disable-next-line no-await-in-loop
                        const fresh = await Product.findOne({ _id: product._id, ...NOT_DELETED })
                            .select('stock')
                            .lean();
                        // eslint-disable-next-line no-await-in-loop
                        await rollbackReservations();
                        if (!fresh) {
                            throw new Error('One of the ordered products no longer exists.');
                        }
                        throw new Error(
                            `Not enough stock for "${product.name}" — ${fresh.stock ?? 0} left, ${qty} requested.`
                        );
                    }
                    reservations.push({ id: product._id, qty });
                }
            }

            // ── Atomic coupon claim ─────────────────────────────────
            // The redemption is claimed against the global usage limit
            // with the same one-shot conditional update (see
            // claimCouponUse): under parallel orders the counter can
            // never pass the limit. The claim precedes the save; if
            // the save ultimately fails, the claim and the
            // reservations are released again, so a failed order
            // consumes nothing.
            let couponClaimed = false;
            if (appliedCoupon && stockOut) {
                couponClaimed = await claimCouponUse(appliedCoupon._id, session);
                if (!couponClaimed) {
                    await rollbackReservations();
                    throw new Error('This coupon has reached its usage limit.');
                }
                data.couponCounted = true;
            }

            // Generate the order number here unless the caller supplied one.
            let order = null;
            let lastError = null;
            try {
                // Inside a transaction the save gets ONE attempt: a
                // collision signals OrderNumberRetry and the caller
                // retries the whole unit with a fresh number (below).
                const saveAttempts = session ? 1 : 5;
                for (let attempt = 0; attempt < saveAttempts && !order; attempt++) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        order = await new Order({
                            ...data,
                            orderNumber: data.orderNumber || generateOrderNumber(),
                        }).save(session ? { session } : undefined);
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
                if (!order) {
                    if (session && lastError) throw new OrderNumberRetry(lastError);
                    throw lastError || new Error('Could not create the order.');
                }
            } catch (saveError) {
                if (saveError instanceof OrderNumberRetry) throw saveError;
                await rollbackReservations();
                if (couponClaimed && !session) await releaseCouponUse(appliedCoupon._id);
                throw saveError;
            }

            // ── Per-customer limit: the ordinal recount ─────────────
            // The resolver's pre-check races under parallel orders by
            // the SAME customer (both reads count the same prior
            // orders), so once this order exists it is counted in
            // (createdAt, _id) order among the customer's counted
            // orders carrying the coupon: if its ordinal passes the
            // limit, THIS order — and only this order — is rolled
            // back (document removed, claim and reservations
            // released) and the refusal answers. Inside a transaction
            // the throw alone rolls the whole unit back.
            if (appliedCoupon && stockOut && appliedCoupon.perCustomerLimit != null) {
                const countedQuery = Order.find({
                    user: order.user,
                    coupon: appliedCoupon._id,
                    ...NOT_DELETED,
                    status: { $nin: STOCK_RETURNED_STATUSES },
                })
                    .sort({ createdAt: 1, _id: 1 })
                    .select('_id')
                    .lean();
                if (session) countedQuery.session(session);
                const countedOrders = await countedQuery;
                const ordinal =
                    countedOrders.findIndex((entry) => String(entry._id) === String(order._id)) + 1;
                if (ordinal > appliedCoupon.perCustomerLimit) {
                    if (!session) {
                        await Order.deleteOne({ _id: order._id });
                        if (couponClaimed) await releaseCouponUse(appliedCoupon._id);
                        await rollbackReservations();
                    }
                    throw new Error(
                        'This customer has already used this coupon the maximum number of times.'
                    );
                }
            }

            // The stock is already out (the reservation above) and the
            // redemption is already counted (the claim above set the
            // marker to match), so this sync is a no-op safeguard that
            // keeps the state rule in exactly one place.
            if (await syncCouponUse(order, session)) {
                await order.save(session ? { session } : undefined);
            }

            return order;
        };

        let order;
        if (await transactionsSupported()) {
            // The order-number lottery gets the same five attempts
            // the sequential path gives the save alone — each retry
            // is a fresh transaction, and the aborted one left
            // nothing behind, so a retry starts from a clean slate.
            // After the fifth collision the last duplicate-key error
            // answers, exactly as the sequential path answers it.
            let attempt = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                attempt += 1;
                try {
                    // eslint-disable-next-line no-await-in-loop
                    order = await withTransaction(placeOrder);
                    break;
                } catch (error) {
                    if (error instanceof OrderNumberRetry && attempt < 5) continue;
                    throw error instanceof OrderNumberRetry ? error.cause : error;
                }
            }
        } else {
            order = await placeOrder(null);
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
        let order = await Order.findOne({ _id: req.params.id, ...NOT_DELETED });
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
        const updates = {};
        for (const field of UPDATABLE_FIELDS) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        // Fulfilment timestamps follow the status, so the record shows
        // when the parcel actually left / arrived.
        if (nextStatus === 'shipped' && !order.shippedAt) updates.shippedAt = new Date();
        if (nextStatus === 'delivered' && !order.deliveredAt) updates.deliveredAt = new Date();

        // A status change is claimed ATOMICALLY: the conditional
        // update only lands while the stored status is still the one
        // this request read, so when two updates race the same
        // transition (a double-click, two staff members), exactly one
        // of them wins and runs the stock/coupon side effects. The
        // loser answers with the order as it now stands and moves
        // nothing — a cancel can never return the same units twice.
        //
        // The claim and its paired adjustments (coupon counter, then
        // stock) run as ONE unit — inside a MongoDB transaction when
        // the deployment supports it (utils/transactions), so a hard
        // crash between the claim and the adjustments can no longer
        // leave them split; on a standalone server the same steps run
        // sequentially, each already atomic on its own, exactly as
        // before. The activity log and the status email stay outside
        // the unit — they are notifications ABOUT the change, not
        // part of it, and both are fail-soft.
        let updated;
        if (nextStatus !== previousStatus) {
            const outcome = await withTransaction(async (session) => {
                const claimed = await Order.findOneAndUpdate(
                    { _id: req.params.id, ...NOT_DELETED, status: previousStatus },
                    { $set: updates },
                    { new: true, ...(session ? { session } : {}) }
                );
                if (!claimed) return { lost: true };

                // The coupon redemption follows the state rule:
                // entering cancelled/refunded releases it, leaving
                // re-records it (no limit re-check — the use was
                // legitimate when made), moving inside the set
                // changes nothing. The marker on the order makes
                // each crossing happen exactly once.
                if (await syncCouponUse(claimed, session)) {
                    await claimed.save(session ? { session } : undefined);
                }

                // Stock follows the same rule, crossing the boundary
                // of the stock-returned set: entering it (cancelled
                // OR refunded) returns the reserved units, LEAVING it
                // takes them back out — the exact inverse, mirroring
                // how a trash restore re-reserves. Moving inside the
                // set (cancelled ↔ refunded) moves nothing: the units
                // are already back.
                const wasReturned = statusReturnsStock(previousStatus);
                const isReturned = statusReturnsStock(nextStatus);
                if (isReturned && !wasReturned) {
                    await adjustStock(claimed.items, +1, session);
                } else if (wasReturned && !isReturned) {
                    await adjustStock(claimed.items, -1, session);
                }
                return { order: claimed };
            });
            if (outcome.lost) {
                const current = await Order.findOne({ _id: req.params.id, ...NOT_DELETED });
                if (!current) {
                    return res.status(404).json({ message: 'Order not found' });
                }
                return res.json(current);
            }
            order = outcome.order;
            updated = outcome.order;
        } else {
            for (const [field, value] of Object.entries(updates)) order[field] = value;
            updated = await order.save();

            // The coupon redemption follows the state rule on EVERY
            // update — on a non-status update only the marker can
            // need pinning (the counted state cannot change without
            // a status change), and the save below is that pin.
            if (await syncCouponUse(order)) {
                await order.save();
            }
        }

        if (nextStatus !== previousStatus) {
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
        // The trash stamp lands ATOMICALLY: the conditional update
        // only matches a still-live order, so two deletes racing (a
        // double-click, two staff members) produce exactly one winner
        // — the loser answers 404 and the stock below can never be
        // returned twice. (Orders carry no tombstoned unique values,
        // so this stamp is the whole of applySoftDelete for them.)
        //
        // The stamp and its paired adjustments (stock return, coupon
        // release) run as ONE unit — inside a MongoDB transaction
        // when the deployment supports it (utils/transactions), so a
        // hard crash between them can no longer leave them split; on
        // a standalone server the same steps run sequentially, each
        // already atomic on its own, exactly as before.
        const outcome = await withTransaction(async (session) => {
            const claimed = await Order.findOneAndUpdate(
                { _id: req.params.id, ...NOT_DELETED },
                { $set: { deletedAt: new Date(), deletedBy: req.user?._id || null } },
                { new: true, ...(session ? { session } : {}) }
            );
            if (!claimed) return { lost: true };

            // A deleted live order frees its stock again; a cancelled
            // or refunded order already returned it when it entered
            // that status. Restoring the order (Settings → Deleted
            // Items) takes the stock back out — the exact inverse,
            // run by the trash controller.
            if (!statusReturnsStock(claimed.status)) {
                await adjustStock(claimed.items, +1, session);
            }

            // Trashing also releases the order's coupon redemption —
            // the redemption counts only while the order is live (the
            // state rule). Restoring the order re-records it.
            if (await syncCouponUse(claimed, session)) {
                await claimed.save(session ? { session } : undefined);
            }
            return { order: claimed };
        });
        if (outcome.lost) {
            return res.status(404).json({ message: 'Order not found' });
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
