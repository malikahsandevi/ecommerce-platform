const Setting = require('../models/Setting');
const axios = require('axios');

const settingSections = new Set([
    'general',
    'storeInfo',
    'paymentMethods',
    'shipping',
    'notifications',
    'integrations',
    'appearance'
]);

const arraySections = new Set(['paymentMethods', 'integrations']);

// The integration schema requires `usageType` from this enum. Older admin
// builds sent a `category` field instead (with values like SMS / ANALYTICS /
// CUSTOM), which the normalizer used to drop — making every integration
// save fail schema validation. Accept both spellings and store the enum.
const INTEGRATION_USAGE_TYPES = ['STORAGE', 'PAYMENT', 'SMS_NOTIFICATION', 'EMAIL', 'AUTH', 'API'];
const LEGACY_CATEGORY_MAP = {
    SMS: 'SMS_NOTIFICATION',
    ANALYTICS: 'API',
    CUSTOM: 'API',
};

const resolveUsageType = (item) => {
    const raw = String(item.usageType || item.category || '').toUpperCase();
    if (INTEGRATION_USAGE_TYPES.includes(raw)) return raw;
    if (LEGACY_CATEGORY_MAP[raw]) return LEGACY_CATEGORY_MAP[raw];
    throw new Error(
        `Integration "${item.title || item.serviceSlug || 'unnamed'}" has an invalid usage type "${item.usageType || item.category || ''}". Use one of: ${INTEGRATION_USAGE_TYPES.join(', ')}`
    );
};

const getSettings = async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 });
        res.json(settings || {});
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
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

const normalizeSection = (section, value, currentValue) => {
    if (arraySections.has(section)) {
        if (!Array.isArray(value)) throw new Error(`${section} must be an array`);

        // Dynamic Integrations ki validation & normalization
        if (section === 'integrations') {
            return value.map((item) => {
                if (!item.serviceSlug || !item.title || !item.baseUrl) {
                    throw new Error('Each integration must have serviceSlug, title, and baseUrl');
                }
                return {
                    usageType: resolveUsageType(item),
                    serviceSlug: item.serviceSlug,
                    title: item.title,
                    baseUrl: item.baseUrl,
                    authType: item.authType || 'NONE',
                    authCredentials: {
                        apiKey: item.authCredentials?.apiKey || '',
                        headerKey: item.authCredentials?.headerKey || 'Authorization',
                        username: item.authCredentials?.username || '',
                        password: item.authCredentials?.password || ''
                    },
                    globalHeaders: item.globalHeaders || {},
                    endpoints: Array.isArray(item.endpoints) ? item.endpoints.map(ep => ({
                        name: ep.name,
                        path: ep.path,
                        method: ep.method || 'POST',
                        defaultHeaders: ep.defaultHeaders || {},
                        responseMapping: ep.responseMapping || {}
                    })) : [],
                    webhooks: Array.isArray(item.webhooks) ? item.webhooks : [],
                    isConnected: item.isConnected !== undefined ? item.isConnected : true
                };
            });
        }
        return value;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${section} must be an object`);
    }

    const normalized = { ...(currentValue?.toObject?.() || currentValue || {}), ...value };
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
        res.json(savedSettings);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Universal Dynamic Driver Engine (Runtime Integration Call)
const executeIntegration = async (req, res) => {
    const { serviceSlug, endpointName, payload = {}, queryParams = {} } = req.body;

    try {
        const settings = await Setting.findOne();
        if (!settings) return res.status(404).json({ message: 'Settings not configured' });

        const service = settings.integrations.find(
            (i) => i.serviceSlug === serviceSlug && i.isConnected
        );
        if (!service) {
            return res.status(404).json({ message: `Integration '${serviceSlug}' not found or disabled.` });
        }

        const endpoint = service.endpoints.find((e) => e.name === endpointName);
        if (!endpoint) {
            return res.status(404).json({ message: `Endpoint '${endpointName}' not found.` });
        }

        // Headers construction
        const headers = {
            'Content-Type': 'application/json',
            ...(service.globalHeaders ? Object.fromEntries(service.globalHeaders) : {}),
            ...(endpoint.defaultHeaders ? Object.fromEntries(endpoint.defaultHeaders) : {})
        };

        // Authentication inject
        switch (service.authType) {
            case 'BEARER_TOKEN':
                headers['Authorization'] = `Bearer ${service.authCredentials.apiKey}`;
                break;
            case 'API_KEY':
            case 'CUSTOM_HEADER':
                headers[service.authCredentials.headerKey || 'X-API-KEY'] = service.authCredentials.apiKey;
                break;
            case 'BASIC':
                const token = Buffer.from(
                    `${service.authCredentials.username}:${service.authCredentials.password}`
                ).toString('base64');
                headers['Authorization'] = `Basic ${token}`;
                break;
        }

        const url = `${service.baseUrl.replace(/\/$/, '')}/${endpoint.path.replace(/^\//, '')}`;

        // SSRF guard: integrations may only call public http(s) services —
        // never loopback / private-network addresses on the host.
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return res.status(400).json({ success: false, message: 'Integration URL is invalid.' });
        }
        const host = parsedUrl.hostname.toLowerCase();
        const isPrivateHost =
            host === 'localhost' ||
            host.endsWith('.local') ||
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
            host === '::1';
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || isPrivateHost) {
            return res.status(400).json({ success: false, message: 'Integration URL must be a public http(s) address.' });
        }

        const response = await axios({
            method: endpoint.method,
            url,
            headers,
            params: queryParams,
            timeout: 10000,
            maxContentLength: 1024 * 1024,
            data: ['POST', 'PUT', 'PATCH'].includes(endpoint.method) ? payload : undefined
        });

        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.response?.data?.message || error.message
        });
    }
};

module.exports = { getSettings, updateSettings, executeIntegration };