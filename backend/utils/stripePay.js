// Stripe — the OUTBOUND half of online card payment; the inbound
// half (the webhook that marks orders Paid) lives in
// utils/stripeWebhook.js + controllers/paymentController.js.
//
// Two outbound shapes share this module's config/amount rules:
//   - EMBEDDED (checkout, Ahsan 2026-11-26: card details are taken
//     on our own checkout page, never by redirect): a PaymentIntent
//     the storefront confirms in-page with the Payment Element —
//     POST /api/storefront/orders/:id/stripe-intent.
//   - HOSTED (pay-later only): a Checkout Session whose URL the
//     account/track Pay action redirects to —
//     POST /api/storefront/orders/:id/stripe-session.
// Flow for both: the storefront places the order FIRST (through
// the shared createOrder, so totals/stock/coupon/shipping are the
// server's own numbers), then opens payment against the STORED
// order — amount, currency and identity come from the order
// document, never from the client — with a raw form-encoded POST
// to the entry's baseUrl (no SDK; the codebase's raw style).
//
// The session carries the order reference in every place the webhook
// matcher looks (see findOrderForEvent in paymentController.js):
//   - client_reference_id = the order number,
//   - metadata.orderId / metadata.orderNumber on the session AND on
//     payment_intent_data (so payment_intent.succeeded matches too),
// and the caller persists the session id as the order's paymentId,
// which the matcher tries FIRST for checkout.session.completed.
//
// HONESTY RULES (the webhook/courier pattern): with no active Stripe
// entry or no stored secret key, online payment is simply
// UNAVAILABLE — resolvers answer null and callers say so plainly.
// A Stripe refusal is logged server-side with its real reason and
// surfaces to the shopper only as a clean sentence; the order stays
// placed and unpaid.
const Setting = require('../models/Setting');
const { allEntries, getDefinition } = require('../config/services');

/**
 * The shop's usable Stripe checkout configuration, or null: no
 * Stripe entry in Settings → Payments, the entry toggled OFF, or no
 * secret key stored. The baseUrl is the ENTRY's stored one (the
 * definition's fixed base is the fallback) so a saved entry is the
 * single source, exactly like every other service consumer.
 */
const resolveStripeCheckout = async () => {
    const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
    const entries = allEntries(settings);
    const entry = entries.find(
        (candidate) =>
            candidate.subService === 'stripe' &&
            candidate.isConnected &&
            String(candidate.values.secretKey || '').trim() !== '',
    );
    if (!entry) return null;
    const definition = getDefinition('stripe');
    const baseUrl = String(entry.baseUrl || definition?.baseUrl || 'https://api.stripe.com/v1').replace(/\/+$/, '');
    return {
        secretKey: String(entry.values.secretKey).trim(),
        // The publishable key is PUBLIC by design — the storefront
        // config serves it so the browser can load Stripe.js. The
        // secret + webhook secret never leave the backend.
        publishableKey: String(entry.values.publishableKey || '').trim(),
        baseUrl,
    };
};

/** Whether online card payment can be offered to shoppers at all. */
const isStripeCheckoutAvailable = async () => (await resolveStripeCheckout()) !== null;

/**
 * The payment-method NAME that means "pay online with Stripe": the
 * shop's payment methods are free-text names (Setting.paymentMethods,
 * e.g. "Stripe", "Cash on Delivery"), and the name is the only link
 * between a method and the Stripe service entry.
 */
const isStripePaymentMethod = (name) => String(name || '').trim().toLowerCase() === 'stripe';

// Stripe's zero-decimal currencies: their smallest unit IS the major
// unit, so amounts go over unmultiplied.
const ZERO_DECIMAL_CURRENCIES = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG',
    'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** An order total in the currency's smallest unit, as Stripe wants. */
const toMinorUnits = (amount, currency) => {
    const value = Number(amount) || 0;
    return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase())
        ? Math.round(value)
        : Math.round(value * 100);
};

/**
 * Creates a Checkout Session for a placed order. Returns
 * { id, url } — the hosted page the shopper is redirected to.
 * Throws a plain Error on any failure (network, refusal, malformed
 * reply); the real Stripe reason is logged here, never forwarded.
 */
const createCheckoutSession = async ({ config, order, currency, origin }) => {
    const orderId = String(order._id);
    const orderNumber = String(order.orderNumber);
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('client_reference_id', orderNumber);
    params.set('success_url', `${origin}/checkout?payment=success&orderId=${orderId}&order=${encodeURIComponent(orderNumber)}`);
    params.set('cancel_url', `${origin}/checkout?payment=cancelled&orderId=${orderId}&order=${encodeURIComponent(orderNumber)}`);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', String(currency || 'USD').toLowerCase());
    params.set('line_items[0][price_data][unit_amount]', String(toMinorUnits(order.total, currency)));
    params.set('line_items[0][price_data][product_data][name]', `Order ${orderNumber}`);
    params.set('metadata[orderId]', orderId);
    params.set('metadata[orderNumber]', orderNumber);
    params.set('payment_intent_data[metadata][orderId]', orderId);
    params.set('payment_intent_data[metadata][orderNumber]', orderNumber);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(`${config.baseUrl}/checkout/sessions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
            signal: controller.signal,
        });
    } catch (error) {
        console.error(`Stripe checkout session request failed for order ${orderNumber}:`, error?.message || error);
        throw new Error('Stripe checkout session could not be created.');
    } finally {
        clearTimeout(timer);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.id || !payload?.url) {
        console.error(
            `Stripe refused a checkout session for order ${orderNumber}:`,
            payload?.error?.message || `HTTP ${response.status}`,
        );
        throw new Error('Stripe checkout session could not be created.');
    }
    return { id: payload.id, url: payload.url };
};

/**
 * Creates a PaymentIntent for a placed order (the embedded
 * checkout flow). Returns { id, clientSecret } — the secret is
 * what the browser's Payment Element confirms against; it can
 * only ever pay THIS intent's fixed amount. The intent carries
 * the order reference in its metadata, which is one of the keys
 * the webhook matcher (findOrderForEvent) resolves orders by —
 * and the caller persists the intent id as the order's
 * paymentId, the key it tries FIRST. Redirect-based payment
 * methods are disallowed on the intent itself, so confirming in
 * the page can never bounce the shopper off the store.
 * Throws a plain Error on any failure, same discipline as the
 * session creator.
 */
const createPaymentIntent = async ({ config, order, currency }) => {
    const orderId = String(order._id);
    const orderNumber = String(order.orderNumber);
    const params = new URLSearchParams();
    params.set('amount', String(toMinorUnits(order.total, currency)));
    params.set('currency', String(currency || 'USD').toLowerCase());
    params.set('metadata[orderId]', orderId);
    params.set('metadata[orderNumber]', orderNumber);
    params.set('automatic_payment_methods[enabled]', 'true');
    params.set('automatic_payment_methods[allow_redirects]', 'never');
    params.set('description', `Order ${orderNumber}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(`${config.baseUrl}/payment_intents`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.secretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
            signal: controller.signal,
        });
    } catch (error) {
        console.error(`Stripe payment intent request failed for order ${orderNumber}:`, error?.message || error);
        throw new Error('Stripe payment intent could not be created.');
    } finally {
        clearTimeout(timer);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.id || !payload?.client_secret) {
        console.error(
            `Stripe refused a payment intent for order ${orderNumber}:`,
            payload?.error?.message || `HTTP ${response.status}`,
        );
        throw new Error('Stripe payment intent could not be created.');
    }
    return { id: payload.id, clientSecret: payload.client_secret };
};

module.exports = {
    resolveStripeCheckout,
    isStripeCheckoutAvailable,
    isStripePaymentMethod,
    toMinorUnits,
    createCheckoutSession,
    createPaymentIntent,
};
