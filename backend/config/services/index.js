// Service catalogue + activation gate (config/services/index.js).
//
// One definition file per sub-service lives beside this index
// (cloudinary.js, stripe.js, twilio.js, …). Each definition holds
// STRUCTURE ONLY — field schema, the provider's FIXED API base and its
// auth style. Credential VALUES are never in these files or in git:
// they are stored in the database, in the Setting document's
// integrations array, and read at runtime, here.
//
// EVERY service is a normal integrations entry — Cloudinary and the
// Store Session (JWT) signer included. They used to be special
// "built-ins" backed by a separate Credential store; Ahsan ordered
// them normalised ("wo bhi normal credentials hai"), so their values
// now live in integrations entries like everyone else's (the one-time
// migration in utils/credentials.js moved them there verbatim).
//
// THE GATE: a sub-service is USED only when BOTH are true —
//   (a) the admin has saved its configuration (every required field
//       of its definition is present), AND
//   (b) its activation toggle is ON (the entry's isConnected flag).
// Otherwise the definition file simply sits unused. Every runtime
// consumer — the integration runner (utils/integrationRunner.js), the
// media/Cloudinary path and JWT signing (utils/credentials.js) —
// resolves through this module; nothing reads a provider config
// anywhere else.
const Setting = require('../../models/Setting');

const DEFINITIONS = {
    cloudinary: require('./cloudinary'),
    'aws-s3': require('./aws-s3'),
    'cloudflare-r2': require('./cloudflare-r2'),
    'google-cloud-storage': require('./google-cloud-storage'),
    'azure-blob-storage': require('./azure-blob-storage'),
    'digitalocean-spaces': require('./digitalocean-spaces'),
    'backblaze-b2': require('./backblaze-b2'),
    wasabi: require('./wasabi'),
    'bunny-storage': require('./bunny-storage'),
    'supabase-storage': require('./supabase-storage'),
    'firebase-storage': require('./firebase-storage'),
    minio: require('./minio'),
    stripe: require('./stripe'),
    paypal: require('./paypal'),
    razorpay: require('./razorpay'),
    square: require('./square'),
    adyen: require('./adyen'),
    'checkout-com': require('./checkout-com'),
    braintree: require('./braintree'),
    mollie: require('./mollie'),
    paddle: require('./paddle'),
    jazzcash: require('./jazzcash'),
    easypaisa: require('./easypaisa'),
    payfast: require('./payfast'),
    'hosting-mail': require('./hosting-mail'),
    smtp: require('./smtp'),
    sendgrid: require('./sendgrid'),
    resend: require('./resend'),
    mailgun: require('./mailgun'),
    postmark: require('./postmark'),
    twilio: require('./twilio'),
    vonage: require('./vonage'),
    messagebird: require('./messagebird'),
    plivo: require('./plivo'),
    sinch: require('./sinch'),
    infobip: require('./infobip'),
    bandwidth: require('./bandwidth'),
    telnyx: require('./telnyx'),
    'amazon-sns': require('./amazon-sns'),
    clicksend: require('./clicksend'),
    google: require('./google'),
    facebook: require('./facebook'),
    github: require('./github'),
    'store-session-jwt': require('./store-session-jwt'),
    auth0: require('./auth0'),
    clerk: require('./clerk'),
    'firebase-auth': require('./firebase-auth'),
    easypost: require('./easypost'),
    shippo: require('./shippo'),
    fedex: require('./fedex'),
    ups: require('./ups'),
    dhl: require('./dhl'),
    usps: require('./usps'),
    aramex: require('./aramex'),
    sendcloud: require('./sendcloud'),
    aftership: require('./aftership'),
    leopards: require('./leopards'),
    postex: require('./postex'),
    'google-analytics': require('./google-analytics'),
    'meta-pixel': require('./meta-pixel'),
    mixpanel: require('./mixpanel'),
    'google-maps': require('./google-maps'),
    mapbox: require('./mapbox'),
    custom: require('./custom'),
};

// Category order + labels for the panel. `usageType` values match the
// Setting schema enum (SMS is stored as SMS_NOTIFICATION).
const CATEGORIES = [
    { id: 'STORAGE', label: 'Storage', subServices: ['cloudinary', 'aws-s3', 'cloudflare-r2', 'google-cloud-storage', 'azure-blob-storage', 'digitalocean-spaces', 'backblaze-b2', 'wasabi', 'bunny-storage', 'supabase-storage', 'firebase-storage', 'minio'] },
    { id: 'PAYMENT', label: 'Payment', subServices: ['stripe', 'paypal', 'razorpay', 'square', 'adyen', 'checkout-com', 'braintree', 'mollie', 'paddle', 'jazzcash', 'easypaisa', 'payfast', 'custom'] },
    { id: 'EMAIL', label: 'Email', subServices: ['hosting-mail', 'smtp', 'sendgrid', 'resend', 'mailgun', 'postmark'] },
    { id: 'SMS_NOTIFICATION', label: 'SMS', subServices: ['twilio', 'vonage', 'messagebird', 'plivo', 'sinch', 'infobip', 'bandwidth', 'telnyx', 'amazon-sns', 'clicksend'] },
    { id: 'AUTH', label: 'Auth', subServices: ['google', 'facebook', 'github', 'store-session-jwt', 'auth0', 'clerk', 'firebase-auth'] },
    { id: 'SHIPPING', label: 'Shipping', subServices: ['easypost', 'shippo', 'fedex', 'ups', 'dhl', 'usps', 'aramex', 'sendcloud', 'aftership', 'leopards', 'postex', 'custom'] },
    { id: 'ANALYTICS', label: 'Analytics', subServices: ['google-analytics', 'meta-pixel', 'mixpanel'] },
    { id: 'MAPS', label: 'Maps', subServices: ['google-maps', 'mapbox'] },
    { id: 'CUSTOM', label: 'Custom', subServices: ['custom'] },
];

const getDefinition = (id) => DEFINITIONS[id] || null;

/** Public catalogue for the admin panel: structure only, no values. */
const catalogueView = () => ({
    categories: CATEGORIES.map((category) => ({
        ...category,
        subServices: category.subServices.map((id) => {
            const def = DEFINITIONS[id];
            return {
                id: def.id,
                name: def.name,
                hasFixedBase: Boolean(def.baseUrl),
                singleton: Boolean(def.singleton),
                fields: def.fields,
                endpoints: def.endpoints,
            };
        }),
    })),
});

/** True when every required field of the definition has a value. */
const isConfigured = (definition, values = {}) =>
    definition.fields
        .filter((field) => field.required)
        .every((field) => String(values[field.key] ?? '').trim() !== '');

/** The stored values of an integrations[] entry as a plain object. */
const entryValues = (entry) => {
    const values = {};
    if (entry.fields) {
        const map = entry.fields instanceof Map ? Object.fromEntries(entry.fields) : entry.fields;
        Object.assign(values, map);
    }
    if (Array.isArray(entry.customFields)) {
        for (const pair of entry.customFields) {
            // A pair toggled OFF in the panel stays saved but is not
            // used — it never becomes part of the effective values.
            if (pair?.key && pair.isActive !== false) values[pair.key] = pair.value ?? '';
        }
    }
    return values;
};

/** All service entries: exactly the saved integrations, in order. */
const allEntries = (settings) => (settings?.integrations || []).map((entry) => ({
    serviceSlug: entry.serviceSlug,
    subService: entry.subService || '',
    usageType: entry.usageType,
    title: entry.title,
    isConnected: entry.isConnected !== false,
    baseUrl: entry.baseUrl,
    authType: entry.authType,
    authCredentials: entry.authCredentials,
    globalHeaders: entry.globalHeaders,
    endpoints: entry.endpoints || [],
    raw: entry,
    values: entryValues(entry),
}));

/**
 * THE GATE. Resolves the ACTIVE provider of a category: the first
 * entry (in saved order) that is both configured and toggled ON.
 * Returns { definition, entry, values } or null — null means "no
 * usable provider for this category", and callers must treat the
 * service as unavailable.
 */
const resolveActiveProvider = (entries, category) => {
    switch (category) {
        case 'STORAGE':
        case 'PAYMENT':
        case 'EMAIL':
        case 'SMS_NOTIFICATION':
        case 'AUTH':
        case 'SHIPPING':
        case 'ANALYTICS':
        case 'MAPS':
        case 'CUSTOM':
        case 'API': {
            for (const entry of entries) {
                if (entry.usageType !== category) continue;
                if (!entry.isConnected) continue; // toggle OFF → unusable
                const definition = getDefinition(entry.subService) || DEFINITIONS.custom;
                if (entry.subService && !isConfigured(definition, entry.values)) continue;
                return { definition, entry, values: entry.values };
            }
            return null;
        }
        default:
            return null;
    }
};

/** Loads the settings document and resolves a category's provider. */
const getActiveService = async (category) => {
    const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
    return resolveActiveProvider(allEntries(settings), category);
};

/** Finds one entry by slug, regardless of state. */
const findEntry = async (serviceSlug) => {
    const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
    const entries = allEntries(settings);
    return { settings, entries, entry: entries.find((e) => e.serviceSlug === serviceSlug) || null };
};

/**
 * Gate check for a single sub-service id: configured AND toggle ON.
 * Used by runtime consumers that serve one fixed provider (the media
 * path serves Cloudinary; JWT signing serves store-session-jwt).
 */
const isServiceUsable = async (subServiceId) => {
    const { entry } = await findEntry(subServiceId);
    if (!entry || !entry.isConnected) return false;
    const definition = getDefinition(subServiceId);
    return definition ? isConfigured(definition, entry.values) : false;
};

module.exports = {
    DEFINITIONS,
    CATEGORIES,
    getDefinition,
    catalogueView,
    isConfigured,
    entryValues,
    allEntries,
    resolveActiveProvider,
    getActiveService,
    findEntry,
    isServiceUsable,
};
