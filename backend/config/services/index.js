// Service catalogue + activation gate (config/services/index.js).
//
// One definition file per sub-service lives beside this index
// (cloudinary.js, stripe.js, twilio.js, …). Each definition holds
// STRUCTURE ONLY — field schema, the provider's FIXED API base and its
// auth style. Credential VALUES are never in these files or in git:
// they are stored in the database (the Setting document's integrations
// for admin-added services; the Credential store for the two built-ins)
// and read at runtime, here.
//
// THE GATE: a sub-service is USED only when BOTH are true —
//   (a) the admin has saved its configuration (every required field
//       of its definition is present), AND
//   (b) its activation toggle is ON (the entry's isConnected flag;
//       for the built-ins, Setting.builtInServices.<id>.isActive).
// Otherwise the definition file simply sits unused. Every runtime
// consumer — the integration runner (utils/integrationRunner.js), the
// media/Cloudinary path and JWT signing (utils/credentials.js) —
// resolves through this module; nothing reads a provider config
// anywhere else.
const Setting = require('../../models/Setting');
const { currentCredentials } = require('../../utils/credentials');

const DEFINITIONS = {
    cloudinary: require('./cloudinary'),
    'aws-s3': require('./aws-s3'),
    'cloudflare-r2': require('./cloudflare-r2'),
    stripe: require('./stripe'),
    paypal: require('./paypal'),
    razorpay: require('./razorpay'),
    'hosting-mail': require('./hosting-mail'),
    smtp: require('./smtp'),
    sendgrid: require('./sendgrid'),
    resend: require('./resend'),
    mailgun: require('./mailgun'),
    twilio: require('./twilio'),
    vonage: require('./vonage'),
    google: require('./google'),
    facebook: require('./facebook'),
    github: require('./github'),
    'store-session-jwt': require('./store-session-jwt'),
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
    'google-maps': require('./google-maps'),
    mapbox: require('./mapbox'),
    custom: require('./custom'),
};

// Category order + labels for the panel. `usageType` values match the
// Setting schema enum (SMS is stored as SMS_NOTIFICATION).
const CATEGORIES = [
    { id: 'STORAGE', label: 'Storage', subServices: ['cloudinary', 'aws-s3', 'cloudflare-r2'] },
    { id: 'PAYMENT', label: 'Payment', subServices: ['stripe', 'paypal', 'razorpay'] },
    { id: 'EMAIL', label: 'Email', subServices: ['hosting-mail', 'smtp', 'sendgrid', 'resend', 'mailgun'] },
    { id: 'SMS_NOTIFICATION', label: 'SMS', subServices: ['twilio', 'vonage'] },
    { id: 'AUTH', label: 'Auth', subServices: ['google', 'facebook', 'github', 'store-session-jwt'] },
    { id: 'SHIPPING', label: 'Shipping', subServices: ['easypost', 'shippo', 'fedex', 'ups', 'dhl', 'usps', 'aramex', 'sendcloud', 'aftership', 'leopards', 'postex'] },
    { id: 'ANALYTICS', label: 'Analytics', subServices: ['google-analytics', 'meta-pixel'] },
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
                builtIn: Boolean(def.builtIn),
                hasFixedBase: Boolean(def.baseUrl),
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
            if (pair?.key) values[pair.key] = pair.value ?? '';
        }
    }
    return values;
};

/**
 * The two built-in services as synthetic entries. Their VALUES come
 * from the Credential store (utils/credentials.js) — the same store
 * that has run media + sessions since the credentials moved out of
 * env — and their activation toggles from Setting.builtInServices.
 */
const builtInEntries = (settings) => {
    const values = currentCredentials();
    const toggles = settings?.builtInServices || {};
    return [
        {
            builtIn: true,
            serviceSlug: 'cloudinary',
            subService: 'cloudinary',
            usageType: 'STORAGE',
            title: 'Cloudinary',
            isConnected: toggles.cloudinary?.isActive !== false,
            values: {
                cloudName: values.cloudinaryCloudName,
                apiKey: values.cloudinaryApiKey,
                apiSecret: values.cloudinaryApiSecret,
            },
        },
        {
            builtIn: true,
            serviceSlug: 'store-session-jwt',
            subService: 'store-session-jwt',
            usageType: 'AUTH',
            title: 'Store Session (JWT)',
            isConnected: toggles.storeSessionJwt?.isActive !== false,
            values: { jwtSecret: values.jwtSecret },
        },
    ];
};

/** All service entries: built-ins first, then the saved integrations. */
const allEntries = (settings) => [
    ...builtInEntries(settings),
    ...(settings?.integrations || []).map((entry) => ({
        builtIn: false,
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
    })),
];

/**
 * THE GATE. Resolves the ACTIVE provider of a category: the first
 * entry (built-ins first, then saved order) that is both configured
 * and toggled ON. Returns { definition, entry, values } or null —
 * null means "no usable provider for this category", and callers
 * must treat the service as unavailable.
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

/** Finds one entry by slug (built-ins included), regardless of state. */
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
    builtInEntries,
    allEntries,
    resolveActiveProvider,
    getActiveService,
    findEntry,
    isServiceUsable,
};
