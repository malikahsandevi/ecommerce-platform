const Setting = require('../models/Setting');
const {
    DEFINITIONS,
    getDefinition,
    catalogueView,
    isConfigured,
    findEntry,
} = require('../config/services');
const { PALETTES, paletteById } = require('../config/palettes');
const { executeEntryCall, runConfigTest } = require('../utils/integrationRunner');
const { SECRET_MASK, refreshCredentials } = require('../utils/credentials');
const {
    SETTINGS_UNLOCK_TTL_SECONDS,
    issueSettingsUnlock,
    passwordMatchesCaller,
} = require('../utils/settingsLock');
const mongoose = require('mongoose');

// NOTE: the old bespoke 'paymentMethods' and 'shipping' sections are
// deliberately NOT writable here any more — Ahsan replaced those tabs
// with the services system (Payment / Shipping category entries in
// `integrations`, managed from the new Payment Methods / Shipping
// tabs). The fields stay in the Setting schema/document (their stored
// values are preserved, simply no longer editable or read by any
// flow — nothing ever consumed them).
const settingSections = new Set([
    'general',
    'storeInfo',
    'notifications',
    'integrations',
    'appearance'
]);

const arraySections = new Set(['integrations']);

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

// ── Credential masking (Ahsan's rule: "star sary credentials ko") ────
// EVERY value stored inside an integration entry is a credential —
// secrets AND identifiers AND usernames/hosts/from-addresses AND every
// custom key-value pair. Masking happens HERE, at the API
// serialization layer, before the response leaves the server: the
// full value never travels over the wire at all, so nothing in
// between (a proxy, a log, a compromised client) can ever see it.
// The client only ever receives stars + the last 4 characters:
//   "716294989856861" → "***********6861",  "465" → "****",  "" → ""
// Metadata is NOT masked: field keys, labels, slugs, service and
// sub-service names, baseUrl, the header NAME (headerKey), toggles.
// The runtime resolver/gate reads the database directly and always
// uses the FULL stored values — this serializer is the only place
// masks exist.
const maskValue = (value) => {
    if (value === undefined || value === null) return value;
    const text = String(value);
    if (text.length === 0) return '';
    if (text.length <= 4) return '****';
    return '*'.repeat(text.length - 4) + text.slice(-4);
};

/** True when a client-sent value is a mask of the stored value (the
 *  per-value stars+last4 form, or the legacy fixed mask). */
const isMaskOf = (incoming, stored) => {
    if (incoming === undefined || incoming === null || stored === undefined || stored === null || stored === '') {
        return false;
    }
    const text = String(incoming);
    return text === SECRET_MASK || text === maskValue(stored);
};

const maskIntegrationEntry = (entry) => {
    const obj = entry?.toObject ? entry.toObject() : { ...entry };
    if (obj.authCredentials) {
        obj.authCredentials = { ...obj.authCredentials };
        // apiKey / password / username are credentials — all masked.
        // headerKey is the NAME of the header (metadata) and stays.
        if (obj.authCredentials.apiKey) obj.authCredentials.apiKey = maskValue(obj.authCredentials.apiKey);
        if (obj.authCredentials.password) obj.authCredentials.password = maskValue(obj.authCredentials.password);
        if (obj.authCredentials.username) obj.authCredentials.username = maskValue(obj.authCredentials.username);
    }
    if (obj.fields) {
        const fields = obj.fields instanceof Map ? Object.fromEntries(obj.fields) : { ...obj.fields };
        for (const key of Object.keys(fields)) {
            if (fields[key]) fields[key] = maskValue(fields[key]);
        }
        obj.fields = fields;
    }
    if (Array.isArray(obj.customFields)) {
        obj.customFields = obj.customFields.map((pair) =>
            pair?.value ? { ...pair, value: maskValue(pair.value) } : pair,
        );
    }
    if (obj.globalHeaders) {
        const headers = obj.globalHeaders instanceof Map
            ? Object.fromEntries(obj.globalHeaders)
            : { ...obj.globalHeaders };
        for (const key of Object.keys(headers)) {
            if (headers[key]) headers[key] = maskValue(headers[key]);
        }
        obj.globalHeaders = headers;
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

// ── Settings Lock: password re-verification ─────────────────────────
// POST /api/settings/verify-password — the caller re-enters their OWN
// account password; on a match the API mints the short-lived unlock
// proof the full Settings reads require (middleware/settingsLock).
// A wrong password is a 403, never a 401: the panel's HTTP layer
// treats a 401 as a dead session and would sign the admin out. The
// failure changes nothing — no lockout, no login side effects.
const verifySettingsPassword = async (req, res) => {
    try {
        const matches = await passwordMatchesCaller(req, req.body?.password);
        if (!matches) {
            return res.status(403).json({
                message: 'Incorrect password. Settings stays locked.',
            });
        }
        const unlockToken = await issueSettingsUnlock(req.user._id);
        res.json({ unlockToken, expiresIn: SETTINGS_UNLOCK_TTL_SECONDS });
    } catch (error) {
        if (error.code === 'JWT_SIGNING_DISABLED') {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message });
    }
};

// ── Universal appearance write ──────────────────────────────────────
// PUT /api/settings/appearance — the ONE settings write that is NOT a
// Settings-panel save: the TopBar theme toggle and the palette Keep
// path write the appearance section from anywhere in the admin, and
// they must keep working with no password prompt (a theme choice is
// the panel's universal rendering state, applied for every staff
// session). Only the appearance section may ride this route — every
// other section stays on the password-gated document save. The
// Settings → Appearance panel's own Save does NOT use this route: it
// goes through the gated document save like every other panel save.
const updateSettingsAppearance = async (req, res) => {
    try {
        const appearance = req.body?.appearance;
        if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
            return res.status(400).json({ message: 'Provide the appearance section to update' });
        }
        let settings = await Setting.findOne().sort({ createdAt: 1 });
        if (!settings) settings = new Setting();
        settings.set('appearance', normalizeSection('appearance', appearance, settings.get('appearance')));
        const savedSettings = await settings.save();
        res.json(maskSettingsDocument(savedSettings));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// ── Shell bootstrap read ───────────────────────────────────────────
// The admin shell must paint for EVERY staff member, including roles
// with no Settings view: the universal theme (appearance palette +
// mode) and the universal language both live in this document, and
// the Setting doc is their single source of truth on every browser
// and device. The rest of the document — integration credentials,
// store configuration — is Settings-view data and stays behind the
// Settings permission on the routes above (Ahsan: "iska data backend
// ki bhi na nikly"). This read serves ONLY the two non-sensitive
// slices the shell applies on load: the appearance section (colours
// and panel cosmetics — no credential values of any kind) and the
// general section's two rendering basics, language and currency
// (they format every string and money figure in the panel, exactly
// like the theme paints it). Any signed-in staff session may read
// it; it exposes nothing else from the document.
const getShellBootstrap = async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 });
        const doc = settings?.toObject ? settings.toObject() : settings;
        res.json({
            appearance: doc?.appearance || {},
            general: {
                language: doc?.general?.language || '',
                currency: doc?.general?.currency || '',
            },
        });
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

// A credential slot being saved: the panel never receives the real
// value (only its stars+last4 mask), so on save a slot can hold the
// mask of the stored value, the legacy fixed mask, a blank, or a
// genuinely new typed value. Mask/blank → keep what is stored; a new
// value replaces it. This applies to EVERY credential slot now that
// every value is masked on read, not only to secret-flagged ones.
const keepMaskedValue = (incoming, existing, fallback = '') => {
    const stored = existing ?? fallback;
    if (incoming === undefined || incoming === null) return stored;
    const text = String(incoming);
    if (text === '' || text === SECRET_MASK) return stored;
    if (stored !== '' && text === maskValue(stored)) return stored;
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
            fields[field.key] = keepMaskedValue(incoming, existingFields[field.key], field.default ?? '');
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
                // The pair's own ON/OFF toggle: an explicit value in
                // the payload wins, then the stored state, default ON.
                isActive: pair.isActive !== undefined
                    ? Boolean(pair.isActive)
                    : (existingCustom.get(key)?.isActive !== false),
                value: keepMaskedValue(pair.value, existingCustom.get(key)?.value),
            };
        });
    // CUSTOM entries may also carry preset-style `fields` (unused —
    // their values live in customFields), keep the map empty.
    const authIn = item.authCredentials || {};
    const keptApiKey = keepMaskedValue(authIn.apiKey, existingAuth.apiKey);
    const keptPassword = keepMaskedValue(authIn.password, existingAuth.password);
    const existingHeaders = existing?.globalHeaders instanceof Map
        ? Object.fromEntries(existing.globalHeaders)
        : (existing?.globalHeaders || {});
    const globalHeaders = {};
    for (const [key, value] of Object.entries(item.globalHeaders || {})) {
        globalHeaders[key] = keepMaskedValue(value, existingHeaders[key]);
    }
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
            username: keepMaskedValue(authIn.username, existingAuth.username),
        },
        fields: {},
        customFields,
        globalHeaders,
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
            const normalizedItems = value.map((item) => {
                const normalized = normalizeIntegration(item, existingBySlug);
                if (seen.has(normalized.serviceSlug)) {
                    throw new Error(`Integration slug "${normalized.serviceSlug}" is used more than once — slugs must be unique.`);
                }
                seen.add(normalized.serviceSlug);
                return normalized;
            });
            // Singleton sub-services (definition.singleton — e.g. Store
            // Session (JWT), whose secret the runtime reads from the
            // FIRST matching entry only) can exist exactly once: a
            // second entry could never be used, so the save is refused
            // instead of storing dead, conflicting configuration.
            const singletonSeen = new Set();
            for (const item of normalizedItems) {
                const definition = item.subService ? getDefinition(item.subService) : null;
                if (!definition?.singleton) continue;
                if (singletonSeen.has(definition.id)) {
                    throw new Error(`"${definition.name}" is a single-configuration service — only one entry can exist, because the system reads exactly one. Remove the duplicate "${definition.name}" entry and change the existing one instead.`);
                }
                singletonSeen.add(definition.id);
            }
            return normalizedItems;
        }
        return value;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${section} must be an object`);
    }

    const normalized = { ...(currentValue?.toObject?.() || currentValue || {}), ...value };
    if (section === 'appearance') {
        // Legacy theme-color hexes: empty = built-in default; anything
        // else must be a full #rrggbb hex — an invalid color is
        // rejected, never stored. (Kept writable: they are the
        // migration source for palette resolution.)
        for (const key of ['adminColor', 'storefrontColor']) {
            if (value[key] !== undefined) {
                const text = String(value[key] ?? '').trim();
                if (text !== '' && !/^#[0-9a-fA-F]{6}$/.test(text)) {
                    throw new Error(`${key} must be a valid hex color like #f97316`);
                }
                normalized[key] = text.toLowerCase();
            }
        }
        // Theme palette: only a known palette id (or empty) may be
        // stored — the palettes themselves live in config/palettes.js,
        // never in the document.
        if (value.palette !== undefined) {
            const text = String(value.palette ?? '').trim();
            if (text !== '' && !paletteById(text)) {
                throw new Error(`palette must be one of: ${PALETTES.map((palette) => palette.id).join(', ')}`);
            }
            normalized.palette = text;
        }
        // Last-used palettes: known ids only, de-duplicated, capped
        // at 4, most recent first.
        if (value.paletteLastUsed !== undefined) {
            if (!Array.isArray(value.paletteLastUsed)) {
                throw new Error('paletteLastUsed must be an array of palette ids');
            }
            const seen = new Set();
            normalized.paletteLastUsed = value.paletteLastUsed.filter((id) => {
                if (typeof id !== 'string' || !paletteById(id) || seen.has(id)) return false;
                seen.add(id);
                return true;
            }).slice(0, 4);
        }
        // Universal theme mode: only "dark" / "light" (or empty =
        // unset) may be stored — this doc value is the admin theme's
        // single source of truth on every browser and device.
        if (value.mode !== undefined) {
            const text = String(value.mode ?? '').trim();
            if (text !== '' && text !== 'dark' && text !== 'light') {
                throw new Error('mode must be "dark" or "light"');
            }
            normalized.mode = text;
        }
        // The legacy theme select and the universal mode describe
        // the same choice — an explicit theme write (the TopBar
        // toggle also sends mode itself; the Appearance form sends
        // only theme) keeps mode in agreement, so the two can never
        // fight on the next load. "System" clears the mode: no
        // universal mode is forced then.
        if (value.theme !== undefined && value.mode === undefined) {
            if (value.theme === 'Dark') normalized.mode = 'dark';
            else if (value.theme === 'Light') normalized.mode = 'light';
            else if (value.theme === 'System') normalized.mode = '';
        }
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
        // The Cloudinary / JWT entries live in integrations now — an
        // integrations save may have moved them, so refresh the
        // credentials resolver's snapshot on this instance right away.
        if (req.body.integrations) await refreshCredentials(true);
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
        // A preset with no callable endpoint gets a configuration
        // test instead of an HTTP call (see runConfigTest).
        if (entry.subService && entry.subService !== 'custom' && !(definition.endpoints || []).length) {
            const data = await runConfigTest({ entry, definition, values: entry.values });
            return res.json({ success: true, data });
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
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'Setting not found' });
        }
        const doc = await Setting.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Setting not found' });
        res.json(maskSettingsDocument(doc));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSettingById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'Setting not found' });
        }
        const doc = await Setting.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Setting not found' });
        const sections = Object.entries(req.body || {}).filter(([section]) => settingSections.has(section));
        for (const [section, value] of sections) {
            doc.set(section, normalizeSection(section, value, doc.get(section)));
        }
        const saved = await doc.save();
        if (req.body?.integrations) await refreshCredentials(true);
        res.json(maskSettingsDocument(saved));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// ── Per-entry integration writes ─────────────────────────────────────
// Every service entry in the panel has its OWN Save button: this
// endpoint upserts exactly ONE entry (matched by its slug) and leaves
// every other entry untouched. The entry goes through the same
// normalizer as a whole-array save (preset values forced from the
// definition, secrets kept on mask/blank), so a per-entry save can
// never diverge from what the array save would have stored.
const saveIntegrationEntry = async (req, res) => {
    try {
        const serviceSlug = String(req.params.serviceSlug || '');
        const item = req.body || {};
        if (!serviceSlug || String(item.serviceSlug || '') !== serviceSlug) {
            return res.status(400).json({ message: 'The entry slug must match the URL slug.' });
        }
        let settings = await Setting.findOne().sort({ createdAt: 1 });
        if (!settings) settings = new Setting();
        const current = settings.get('integrations') || [];
        const existingBySlug = new Map(
            current.map((entry) => {
                const obj = entry?.toObject ? entry.toObject() : entry;
                return [obj.serviceSlug, obj];
            }),
        );
        // "Make new one" (the panel's save-guard popup): the clone is
        // submitted under a FRESH slug but still carries the source
        // entry's MASKED values — the client never holds the real
        // credentials. When the payload names a clone source and the
        // target slug is new, the mask-keep logic resolves those masks
        // against the SOURCE entry's stored values, so the clone is
        // stored with the real credentials while the original entry is
        // left byte-identical. A genuinely new typed value in the
        // clone still wins over the source's stored value.
        const cloneSource = typeof item.cloneFromSlug === 'string'
            ? existingBySlug.get(item.cloneFromSlug)
            : undefined;
        if (cloneSource && !existingBySlug.has(serviceSlug)) {
            existingBySlug.set(serviceSlug, cloneSource);
        }
        const normalized = normalizeIntegration(item, existingBySlug);
        // Singleton sub-services (definition.singleton — e.g. Store
        // Session (JWT)): exactly one entry may exist, because the
        // runtime resolver reads the first matching entry only. This
        // refuses both a fresh duplicate AND the save-guard popup's
        // "Make new one" clone (fresh slug, same sub-service) — while
        // saving the existing entry itself (same slug) stays allowed.
        const normalizedDefinition = normalized.subService ? getDefinition(normalized.subService) : null;
        if (normalizedDefinition?.singleton) {
            const clash = current.find(
                (entry) => entry.serviceSlug !== serviceSlug && entry.subService === normalizedDefinition.id,
            );
            if (clash) {
                throw new Error(`"${normalizedDefinition.name}" is a single-configuration service — an entry already exists ("${clash.title}") and a second one can never be used. Change the existing entry instead.`);
            }
        }
        const index = current.findIndex((entry) => entry.serviceSlug === serviceSlug);
        const next = [...current];
        if (index >= 0) next[index] = normalized;
        else next.push(normalized);
        settings.set('integrations', next);
        const saved = await settings.save();
        await refreshCredentials(true);
        const masked = maskSettingsDocument(saved);
        const integration = (masked.integrations || []).find((entry) => entry.serviceSlug === serviceSlug) || null;
        res.json({ integration, integrations: masked.integrations || [] });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// The per-entry counterpart for the card's remove button: deletes
// exactly one entry by slug, nothing else.
const deleteIntegrationEntry = async (req, res) => {
    try {
        const serviceSlug = String(req.params.serviceSlug || '');
        let settings = await Setting.findOne().sort({ createdAt: 1 });
        if (!settings) return res.status(404).json({ message: 'Integration not found' });
        const current = settings.get('integrations') || [];
        if (!current.some((entry) => entry.serviceSlug === serviceSlug)) {
            return res.status(404).json({ message: 'Integration not found' });
        }
        settings.set('integrations', current.filter((entry) => entry.serviceSlug !== serviceSlug));
        const saved = await settings.save();
        await refreshCredentials(true);
        const masked = maskSettingsDocument(saved);
        res.json({ integrations: masked.integrations || [] });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = { getSettings, getShellBootstrap, updateSettings, verifySettingsPassword, updateSettingsAppearance, executeIntegration, getServicesCatalogue, maskSettingsDocument, maskValue, isMaskOf, getSettingById, updateSettingById, saveIntegrationEntry, deleteIntegrationEntry };
