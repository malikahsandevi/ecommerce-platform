// Stripe webhook support — signature verification + configuration.
//
// Stripe signs every webhook delivery: the Stripe-Signature header
// carries `t=<unix timestamp>,v1=<hex HMAC>` (possibly several v1
// values while a secret rolls over). The signed payload is the string
// "<timestamp>.<raw request body>" and the expected signature is
// HMAC-SHA256 of that string under the endpoint's webhook secret
// (the whsec_… value the owner copies from their Stripe dashboard
// into Settings → Payments). Verification MUST run over the raw,
// unparsed body — any JSON round-trip changes the bytes and breaks
// the signature — so app.js mounts a raw body parser on this one
// path and the controller hands the Buffer straight here.
//
// HONESTY RULES (the courier-sync pattern): with no active Stripe
// entry or no stored webhook secret there is nothing to verify
// against — the endpoint answers plainly that Stripe is not
// configured and changes nothing. An unsigned or wrongly-signed call
// is refused and changes nothing, ever.
const crypto = require('crypto');
const Setting = require('../models/Setting');
const { allEntries } = require('../config/services');

// Stripe's own default tolerance for the signature timestamp.
const TOLERANCE_SECONDS = 300;

/** Splits the Stripe-Signature header into its timestamp + v1 list. */
const parseSignatureHeader = (header) => {
    const parsed = { timestamp: null, signatures: [] };
    for (const part of String(header || '').split(',')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const key = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (key === 't') parsed.timestamp = value;
        if (key === 'v1' && value) parsed.signatures.push(value);
    }
    return parsed;
};

/**
 * Verifies a Stripe-Signature header against the raw body.
 * Returns true only when the timestamp is inside the tolerance
 * window AND at least one v1 signature matches (constant-time).
 */
const verifyStripeSignature = (rawBody, signatureHeader, secret, toleranceSeconds = TOLERANCE_SECONDS) => {
    if (!signatureHeader || !secret) return false;
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
    if (!timestamp || signatures.length === 0) return false;
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) return false;

    const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody ?? '');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${bodyText}`, 'utf8')
        .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return signatures.some((signature) => {
        const candidate = Buffer.from(String(signature), 'utf8');
        return candidate.length === expectedBuffer.length && crypto.timingSafeEqual(candidate, expectedBuffer);
    });
};

/**
 * The webhook secret of the shop's Stripe entry, or null when Stripe
 * is not usable: no Stripe entry in Settings → Payments, the entry
 * toggled OFF, or no webhook secret stored. Values come from the
 * stored settings document (masking is a read-time display concern
 * of the settings API; the stored values are the real ones).
 */
const resolveStripeWebhookSecret = async () => {
    const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
    const entries = allEntries(settings);
    const entry = entries.find(
        (candidate) =>
            candidate.subService === 'stripe' &&
            candidate.isConnected &&
            String(candidate.values.webhookSecret || '').trim() !== '',
    );
    return entry ? String(entry.values.webhookSecret).trim() : null;
};

module.exports = {
    parseSignatureHeader,
    verifyStripeSignature,
    resolveStripeWebhookSecret,
    TOLERANCE_SECONDS,
};
