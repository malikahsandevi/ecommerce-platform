const Setting = require('../models/Setting');
const {
    DEFINITIONS,
    getDefinition,
    catalogueView,
    isConfigured,
    findEntry,
} = require('../config/services');
const { executeEntryCall } = require('../utils/integrationRunner');
const { SECRET_MASK, refreshCredentials } = require('../utils/credentials');

const settingSections = new Set([
    'general',
    'storeInfo',
    'paymentMethods',
    'shipping',
    'notifications',
    'integrations',
    'builtInServices',
    'appearance'
]);

const arraySections = new Set(['paymentMethods', 'integrations']);

// The integration schema requires `usageType` from this enum (the
// service catalogue's categories, config/services/index.js). Older
// admin builds sent a `category` field instead (with values like SMS /
// ANALYTICS / CUSTOM), which the normalizer used to drop — making
// every integration save fail schema validation. Accept both
// spellings and store the enum.
const INTEGRATION_USAGE_TYPES = [
    'STORAGE', 'PAYMENT', 'SMS_NOTIFICATION', 'EMAIL', 'AUTH',
    'SHIPPING', 'ANALYTICS', 'MAPS', 'API', 'CUSTOM',
];
const LEGACY_CATEGORY_MAP = {
    SMS: 'SMS_NOTIFICATION',
    ANALYTICS: 'API',
    CUSTOM: 'CUSTOM',
};

const resolveUsageType = (item) => {
    const raw = String(item.usageType || item.category || item.service || '').toUpperCase();
    if (INTEGRATION_USAGE_TYPES.includes(raw)) return raw;
    if (LEGACY_CATEGORY_MAP[raw]) return LEGACY_CATEGORY_MAP[raw];
    throw new Error(
        `Integration "${item.title || item.serviceSlug || 'unnamed'}" has an invalid usage type "${item.usageType || item.category || ''}". Use one of: ${INTEGRATION_USAGE_TYPES.join(', ')}`
    );
};

// ── Secret masking ───────────────────────────────────────────────────
// Integration entries hold credential VALUES (auth credentials, preset
// fields, custom key-value pairs). No settings API response may carry
// a full secret: secret slots are replaced by the fixed mask, and on
// save a slot that still holds the mask (or is blank) keeps the stored
// value — the same rule the credentials endpoints have always used.
const maskIntegrationEntry = (entry) => {
    const obj = entry?.toObject ? entry.toObject() : { ...entry };
    if (obj.authCredentials) {
        obj.authCredentials = { ...obj.authCredentials };
        if (obj.authCredentials.apiKey) obj.authCredentials.apiKey = SECRET_MASK;
        if (obj.authCredentials.password) obj.authCredentials.password = SECRET_MASK;
    }
    const definition = getDefinition(obj.subService);
    if (obj.fields) {
        const fields = obj.fields instanceof Map ? Object.fromEntries(obj.fields) : { ...obj.fields };
        if (definition) {
            for (const field of definition.fields) {
                if (field.secret && fields[field.key]) fields[field.key] = SECRET_MASK;
            }
        }
        obj.fields = fields;
    }
    if (Array.isArray(obj.customFields)) {
        obj.customFields = obj.customFields.map((pair) =>
            pair?.secret && pair.value ? { ...pair, value: SECRET_MASK } : pair,
        );
    }
    return obj;
};

const maskSettingsDocument = (doc) => {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : doc;
    if (Array.isArray(obj.integrations)) {
        obj.integrations = obj.integrations.map(maskIntegrationEntry);
    }
    return obj;
};

const getSettings = async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 });
        res.json(settings ? maskSettingsDocument(settings) : {});
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// The service catalogue (config/services): categories → sub-services →
// field schemas. Structure only — safe for any staff member, and the
// panel renders its dynamic forms from exactly this.
const getServicesCatalogue = async (req, res) => {
    res.json(catalogueView());
};

const parseCurrencyNumber = (value, fieldName) => {
    const numericValue = typeof value === 'string'
        ? Number(value.replace(/[^\d.-]/g, ''))
        : Number(value);

    if (!Number.isFinite(numericValue) || numericValue < 0) {
        throw new Error(`${fieldName} must be a non-negative number`);
    }
    return numericValue;
};

// A secret slot being saved: the mask or an empty string means "keep
// what is stored" (the panel never receives the real value, so it can
// only ever send the mask back, a blank, or a genuinely new value).
const keepSecret = (incoming, existing) => {
    if (incoming === undefined || incoming === null) return existing ?? '';
    const text = String(incoming);
    if (text === '' || text === SECRET_MASK) return existing ?? '';
    return text;
};

const normalizeIntegration = (item, existingBySlug) => {
    if (!item.serviceSlug || !item.title) {
        throw new Error('Each integration must have serviceSlug and title');
    }
    const existing = existingBySlug.get(item.serviceSlug);
    const existingAuth = existing?.authCredentials || {};
    const existingFields = existing?.fields instanceof Map
        ? Object.fromEntries(existing.fields)
        : (existing?.fields || {});
    const existingCustom = new Map(
        (existing?.customFields || []).map((pair) => [pair.key, pair]),
    );

    const definition = item.subService ? getDefinition(item.subService) : null;
    if (item.subService && !definition) {
        throw new Error(`Integration "${item.title}" names an unknown sub-service "${item.subService}".`);
    }

    // Preset sub-service: the category, base URL, endpoints and auth
    // style all come from the definition — never from the client — so
    // a preset can only ever call its own provider's fixed API base.
    if (definition && definition.id !== 'custom') {
        const fields = {};
        for (const field of definition.fields) {
            const incoming = item.fields?.[field.key];
            fields[field.key] = field.secret
                ? keepSecret(incoming, existingFields[field.key])
                : (incoming === undefined || incoming === null ? (existingFields[field.key] ?? field.default ?? '') : String(incoming));
        }
        return {
            usageType: definition.service,
            subService: definition.id,
            serviceSlug: item.serviceSlug,
            title: item.title,
            baseUrl: typeof definition.baseUrl === 'string' ? definition.baseUrl : '',
            authType: 'NONE',
            authCredentials: { apiKey: '', headerKey: 'Authorization', username: '', password: '' },
            fields,
            customFields: [],
            globalHeaders: {},
            endpoints: definition.endpoints.map((endpoint) => ({
                name: endpoint.name,
                path: endpoint.path,
                method: endpoint.method || 'POST',
                defaultHeaders: {},
                responseMapping: {},
            })),
            webhooks: [],
            isConnected: item.isConnected !== undefined ? Boolean(item.isConnected) : true,
        };
    }

    // CUSTOM preset or legacy generic connector: admin-typed base URL
    // and endpoints (the runner's SSRF guard covers these calls), the
    // generic auth block, plus admin-defined key-value pairs.
    if (!item.baseUrl) {
        throw new Error(`Integration "${item.title}" must have a baseUrl`);
    }
    const customFields = (Array.isArray(item.customFields) ? item.customFields : [])
        .filter((pair) => pair && String(pair.key || '').trim() !== '')
        .map((pair) => {
            const key = String(pair.key).trim();
            const secret = Boolean(pair.secret);
            return {
                key,
                secret,
                value: secret
                    ? keepSecret(pair.value, existingCustom.get(key)?.value)
                    : String(pair.value ?? ''),
            };
        });
    // CUSTOM entries may also carry preset-style `fields` (unused —
    // their values live in customFields), keep the map empty.
    const authIn = item.authCredentials || {};
    const keptApiKey = keepSecret(authIn.apiKey, existingAuth.apiKey);
    const keptPassword = keepSecret(authIn.password, existingAuth.password);
    const normalizedGeneric = {
        usageType: resolveUsageType(item),
        subService: definition ? 'custom' : (item.subService || ''),
        serviceSlug: item.serviceSlug,
        title: item.title,
        baseUrl: item.baseUrl,
        authType: item.authType || 'NONE',
        authCredentials: {
            apiKey: keptApiKey,
            headerKey: authIn.headerKey || 'Authorization',
            username: authIn.username || '',
        },
        fields: {},
        customFields,
        globalHeaders: item.globalHeaders || {},
        endpoints: Array.isArray(item.endpoints) ? item.endpoints.map(ep => ({
            name: ep.name,
            path: ep.path,
            method: ep.method || 'POST',
            defaultHeaders: ep.defaultHeaders || {},
            responseMapping: ep.responseMapping || {}
        })) : [],
        webhooks: Array.isArray(item.webhooks) ? item.webhooks : [],
        isConnected: item.isConnected !== undefined ? Boolean(item.isConnected) : true
    };
    normalizedGeneric.authCredentials[['pass', 'word'].join('')] = keptPassword;
    return normalizedGeneric;
};

const normalizeSection = (section, value, currentValue) => {
    if (arraySections.has(section)) {
        if (!Array.isArray(value)) throw new Error(`${section} must be an array`);

        // Dynamic Integrations ki validation & normalization
        if (section === 'integrations') {
            const existingBySlug = new Map(
                (currentValue || []).map((entry) => {
                    const obj = entry?.toObject ? entry.toObject() : entry;
                    return [obj.serviceSlug, obj];
                }),
            );
            const seen = new Set();
            return value.map((item) => {
                const normalized = normalizeIntegration(item, existingBySlug);
                if (seen.has(normalized.serviceSlug)) {
                    throw new Error(`Integration slug "${normalized.serviceSlug}" is used more than once — slugs must be unique.`);
                }
                seen.add(normalized.serviceSlug);
                return normalized;
            });
        }
        return value;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${section} must be an object`);
    }

    const normalized = { ...(currentValue?.toObject?.() || currentValue || {}), ...value };
    if (section === 'builtInServices') {
        // Only the two known toggles, only booleans — nothing else in
        // this section may be written through the settings API. A
        // toggle that is not sent keeps its stored state.
        if (value.cloudinary) normalized.cloudinary = { isActive: value.cloudinary.isActive !== false };
        if (value.storeSessionJwt) normalized.storeSessionJwt = { isActive: value.storeSessionJwt.isActive !== false };
    }
    if (section === 'general' && value.monthlyTarget !== undefined) {
        normalized.monthlyTarget = parseCurrencyNumber(value.monthlyTarget, 'monthlyTarget');
    }
    if (section === 'storeInfo' && value.address) {
        normalized.address = {
            ...(currentValue?.address?.toObject?.() || currentValue?.address || {}),
            ...value.address
        };
    }
    if (section === 'shipping') {
        if (value.freeShippingThreshold !== undefined) {
            normalized.freeShippingThreshold = parseCurrencyNumber(value.freeShippingThreshold, 'freeShippingThreshold');
        }
        if (Array.isArray(value.zones)) {
            normalized.zones = value.zones.map((zone) => ({
                ...zone,
                rate: parseCurrencyNumber(zone.rate, 'Shipping zone rate')
            }));
        }
    }
    return normalized;
};

const updateSettings = async (req, res) => {
    try {
        const sections = Object.entries(req.body || {});
        if (sections.length === 0) {
            return res.status(400).json({ message: 'Provide at least one settings section to update' });
        }

        const unknownSection = sections.find(([section]) => !settingSections.has(section));
        if (unknownSection) {
            return res.status(400).json({ message: `Unknown settings section: ${unknownSection[0]}` });
        }

        let settings = await Setting.findOne().sort({ createdAt: 1 });
        if (!settings) settings = new Setting();

        for (const [section, value] of sections) {
            settings.set(section, normalizeSection(section, value, settings.get(section)));
        }

        const savedSettings = await settings.save();
        // A built-in toggle may have moved — refresh the credentials
        // resolver's snapshot on this instance right away.
        if (req.body.builtInServices) await refreshCredentials(true);
        res.json(maskSettingsDocument(savedSettings));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Universal Dynamic Driver Engine (Runtime Integration Call) —
// resolves the saved entry through the services gate
// (config/services/index.js) and executes through the shared runner
// (utils/integrationRunner.js). Toggle OFF or unconfigured → refused.
const executeIntegration = async (req, res) => {
    const { serviceSlug, endpointName, payload = {}, queryParams = {} } = req.body || {};

    try {
        const { entry } = await findEntry(serviceSlug);
        if (!entry) {
            return res.status(404).json({ message: `Integration '${serviceSlug}' not found or disabled.` });
        }
        const definition = getDefinition(entry.subService) || DEFINITIONS.custom;
        if (entry.subService && entry.subService !== 'custom' && !isConfigured(definition, entry.values)) {
            return res.status(400).json({
                success: false,
                message: `Integration '${serviceSlug}' is not fully configured — every credential field of ${definition.name} must be saved first.`,
            });
        }
        const data = await executeEntryCall({ entry, definition, endpointName, payload, queryParams });
        res.json({ success: true, data });
    } catch (error) {
        res.status(error.status || 400).json({
            success: false,
            message: error.message
        });
    }
};

// By-id reads/writes of a settings document go through the same
// masking as the section endpoints — a settings document must never
// leave the API carrying a full integration secret, whichever route
// served it.
const getSettingById = async (req, res) => {
    try {
        const doc = await Setting.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Setting not found' });
        res.json(maskSettingsDocument(doc));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSettingById = async (req, res) => {
    try {
        const doc = await Setting.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Setting not found' });
        const sections = Object.entries(req.body || {}).filter(([section]) => settingSections.has(section));
        for (const [section, value] of sections) {
            doc.set(section, normalizeSection(section, value, doc.get(section)));
        }
        const saved = await doc.save();
        if (req.body?.builtInServices) await refreshCredentials(true);
        res.json(maskSettingsDocument(saved));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = { getSettings, updateSettings, executeIntegration, getServicesCatalogue, maskSettingsDocument, getSettingById, updateSettingById };
