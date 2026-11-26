// Online payment automation — gateway webhooks (Part 2; the COD
// half, auto-paid on delivery, lives in the order controller).
//
// A verified Stripe success event marks its order Paid by itself:
// the shop owner pastes this endpoint's URL into their Stripe
// dashboard (Settings → Payments shows it on the Stripe entry) and
// from then on Stripe calls POST /api/payments/webhook/stripe for
// every payment. The signature check (utils/stripeWebhook) is the
// ONLY credential this route answers to — there is no staff session
// on a gateway callback — so an unsigned or wrongly-signed call is
// refused (400) and changes nothing, ever.
//
// Behaviour contract (a system sold to a real customer):
//   - No active Stripe entry / no webhook secret stored → 503 with
//     a plain sentence; nothing changes (the courier-sync pattern).
//   - Verified non-success events → 200, no action.
//   - Verified success for an unknown order → 200 acknowledged,
//     server-side log only (gateways retry on non-200, and the
//     event may belong to another system sharing the account).
//   - Already-paid order → 200, no further change, no second log
//     line: Stripe retries and replays must never double-apply.
//   - Trashed, cancelled or refunded order → never flipped to paid;
//     logged server-side for a human to look at; 200.
//   - Marking paid touches ONLY the payment fields — no stock, no
//     coupon accounting (those follow the order's lifecycle, which
//     a payment does not change).
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { logActivity } = require('../utils/activity');
const { sendError } = require('../utils/apiError');
const { verifyStripeSignature, resolveStripeWebhookSecret } = require('../utils/stripeWebhook');

const SUCCESS_EVENT_TYPES = new Set([
    'payment_intent.succeeded',
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
]);

/**
 * A Checkout Session event only proves the money arrived when the
 * session itself says so: for card payments `checkout.session.completed`
 * lands with payment_status 'paid', but with a delayed method (bank
 * debit and friends) the same event fires while the payment is still
 * processing ('unpaid') — the money settles later and Stripe then
 * sends `checkout.session.async_payment_succeeded`. Flipping on the
 * bare event type would mark an unpaid order Paid, so session events
 * are gated on the session's own payment_status; PaymentIntent
 * events need no such gate ('succeeded' IS the settlement).
 */
const sessionProvesPayment = (object) =>
    object.object !== 'checkout.session' || object.payment_status !== 'unpaid';

/**
 * Finds the order a success event belongs to. First by the gateway
 * payment id already stored on the order (the PaymentIntent id; the
 * event object's own id is tried too — a Checkout Session id an
 * order recorded instead matches the same way), then by the order
 * id / order number carried in the event metadata (a Checkout
 * Session's client_reference_id is tried as both).
 */
const findOrderForEvent = async (object) => {
    const paymentIntentId =
        typeof object.payment_intent === 'string' && object.payment_intent
            ? object.payment_intent
            : object.object === 'payment_intent'
              ? object.id
              : null;
    const paymentIdCandidates = [paymentIntentId, object.id].filter(
        (value, index, list) => typeof value === 'string' && value && list.indexOf(value) === index,
    );
    for (const candidate of paymentIdCandidates) {
        // eslint-disable-next-line no-await-in-loop
        const byPaymentId = await Order.findOne({ paymentId: candidate });
        if (byPaymentId) return { order: byPaymentId, paymentIntentId };
    }

    const metadata = object.metadata && typeof object.metadata === 'object' ? object.metadata : {};
    const orderId = metadata.orderId || metadata.order_id || null;
    if (orderId && mongoose.isValidObjectId(String(orderId))) {
        const byId = await Order.findById(String(orderId));
        if (byId) return { order: byId, paymentIntentId };
    }
    const orderNumber =
        metadata.orderNumber || metadata.order_number || object.client_reference_id || null;
    if (orderNumber) {
        const byNumber = await Order.findOne({ orderNumber: String(orderNumber) });
        if (byNumber) return { order: byNumber, paymentIntentId };
    }
    if (object.client_reference_id && mongoose.isValidObjectId(String(object.client_reference_id))) {
        const byReference = await Order.findById(String(object.client_reference_id));
        if (byReference) return { order: byReference, paymentIntentId };
    }
    return { order: null, paymentIntentId };
};

// @desc    Stripe webhook — a verified payment success marks its order Paid
// @route   POST /api/payments/webhook/stripe
// @access  Public (the Stripe signature is the credential)
const stripeWebhook = async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).json({ message: 'Missing Stripe signature.' });
        }

        const webhookSecret = await resolveStripeWebhookSecret();
        if (!webhookSecret) {
            return res.status(503).json({
                message:
                    'Stripe is not configured — add the Stripe entry with its webhook secret in Settings → Payments to receive payment confirmations.',
            });
        }

        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
            return res.status(400).json({ message: 'Invalid Stripe signature.' });
        }

        let event;
        try {
            event = JSON.parse(rawBody.toString('utf8'));
        } catch {
            return res.status(400).json({ message: 'Invalid Stripe event payload.' });
        }

        if (!SUCCESS_EVENT_TYPES.has(event?.type)) {
            return res.status(200).json({ received: true });
        }

        const object = event.data?.object;
        if (!object || typeof object !== 'object') {
            return res.status(200).json({ received: true });
        }

        if (!sessionProvesPayment(object)) {
            console.log(
                `Stripe webhook: ${event.type} (${event.id || 'no event id'}) — session not yet paid (payment_status: ${object.payment_status || 'unknown'}); acknowledged without changes.`,
            );
            return res.status(200).json({ received: true });
        }

        const { order, paymentIntentId } = await findOrderForEvent(object);
        if (!order) {
            console.log(
                `Stripe webhook: ${event.type} (${event.id || 'no event id'}) matched no order — acknowledged without changes.`,
            );
            return res.status(200).json({ received: true });
        }

        if (order.deletedAt || order.status === 'cancelled' || order.status === 'refunded') {
            console.log(
                `Stripe webhook: ${event.type} (${event.id || 'no event id'}) names order ${order.orderNumber}, which is ${order.deletedAt ? 'in Deleted Items' : order.status} — NOT marked paid; a human needs to look at this payment.`,
            );
            return res.status(200).json({ received: true });
        }

        // Idempotent: a retry or replay of an event whose order is
        // already paid is acknowledged with no change and no log.
        if (order.paymentStatus === 'paid') {
            return res.status(200).json({ received: true });
        }

        order.paymentStatus = 'paid';
        order.paymentDate = event.created ? new Date(event.created * 1000) : new Date();
        if (!order.paymentId && paymentIntentId) order.paymentId = paymentIntentId;
        await order.save();

        await logActivity(
            'STATUS_CHANGE',
            `Order ${order.orderNumber}: Payment marked Paid automatically — Stripe payment confirmed`,
            { orderId: order._id, customerId: order.user || undefined },
        );

        return res.status(200).json({ received: true });
    } catch (error) {
        return sendError(res, error, 500);
    }
};

module.exports = { stripeWebhook };
