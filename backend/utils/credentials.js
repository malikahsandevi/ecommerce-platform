// Runtime credential resolution for the two store-critical services
// (Cloudinary media + the Store Session JWT signer).
//
// These are NORMAL services now: their values live in the Setting
// document's integrations array — the Cloudinary entry (Service:
// Storage, Sub-Service: cloudinary) and the Store Session entry
// (Service: Auth, Sub-Service: store-session-jwt) — exactly like every
// other connector in Settings → API / Integrations, edited through
// the same builder form, saved per entry, masked on every API read.
//
// MIGRATION (one-time, idempotent, on boot): the values used to live
// in a dedicated Credential store with toggles in
// Setting.builtInServices. On the first boot of this build, if the
// normal entries don't exist yet, they are created from that store
// (falling back to the environment) with the values copied VERBATIM —
// the JWT secret is unchanged, so live sessions keep verifying, and
// the Cloudinary triple is unchanged, so signatures keep matching.
// After the migration the integrations entries are the single source
// of truth; the legacy store is never read again.
//
// Resolution rules:
//  - Per field, the entry's stored value wins; the environment value
//    is the fallback (so a field the admin cleared still resolves,
//    and a store read failure can never break the API — the env
//    snapshot stays).
//  - MONGO_URI is deliberately NOT part of this: the backend needs
//    it before it can read any document (bootstrap credential).
//
// Freshness: reads are cached for 30s (same pattern as the permission
// matrix). A save through the Settings API invalidates and refreshes
// immediately on the instance that served the save; other serverless
// instances converge within the TTL. No redeploy is ever needed.
//
// The Cloudinary SDK is a process-wide singleton configured at boot
// from the environment (config/cloudinary.js); whenever the effective
// values change, refreshCredentials re-applies them via
// cloudinary.config().
const Credential = require('../models/Credential');
const Setting = require('../models/Setting');
const cloudinary = require('../config/cloudinary');
const cloudinaryDefinition = require('../config/services/cloudinary');
const jwtDefinition = require('../config/services/store-session-jwt');

const SECRET_MASK = '••••••••••';
const CACHE_TTL_MS = 30_000;

const envValues = () => ({
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
    jwtSecret: process.env.JWT_SECRET || '',
});

// Effective values, initialised from the environment so synchronous
// readers (utils/cloudinaryUrl.js) work before the first DB read.
// The two activation flags mirror the entries' isConnected toggles:
// both default ON so a settings read failure can never lock the store.
let snapshot = { ...envValues(), cloudinaryActive: true, jwtSigningActive: true };

// What the Cloudinary SDK singleton is currently configured with —
// starts as the environment values (config/cloudinary.js did that at
// require time) and is re-applied whenever the effective values move.
let appliedCloudinary = {
    cloudinaryCloudName: snapshot.cloudinaryCloudName,
    cloudinaryApiKey: snapshot.cloudinaryApiKey,
    cloudinaryApiSecret: snapshot.cloudinaryApiSecret,
};

const applyCloudinary = (values) => {
    if (
        values.cloudinaryCloudName === appliedCloudinary.cloudinaryCloudName &&
        values.cloudinaryApiKey === appliedCloudinary.cloudinaryApiKey &&
        values.cloudinaryApiSecret === appliedCloudinary.cloudinaryApiSecret
    ) {
        return;
    }
    cloudinary.config({
        cloud_name: values.cloudinaryCloudName || undefined,
        api_key: values.cloudinaryApiKey || undefined,
        api_secret: values.cloudinaryApiSecret || undefined,
        secure: true,
    });
    appliedCloudinary = {
        cloudinaryCloudName: values.cloudinaryCloudName,
        cloudinaryApiKey: values.cloudinaryApiKey,
        cloudinaryApiSecret: values.cloudinaryApiSecret,
    };
};

// --- One-time migration ---------------------------------------------------
// Builds a normal integrations entry in exactly the shape the settings
// normalizer writes for a preset sub-service.
const presetEntry = ({ definition, serviceSlug, title, fields, isConnected }) => ({
    usageType: definition.service,
    subService: definition.id,
    serviceSlug,
    title,
    baseUrl: typeof definition.baseUrl === 'string' ? definition.baseUrl : '',
    authType: 'NONE',
    authCredentials: { apiKey: '', headerKey: 'Authorization', username: '', password: '' },
    fields,
    customFields: [],
    globalHeaders: {},
    endpoints: (definition.endpoints || []).map((endpoint) => ({
        name: endpoint.name,
        path: endpoint.path,
        method: endpoint.method || 'POST',
        defaultHeaders: {},
        responseMapping: {},
    })),
    webhooks: [],
    isConnected,
});

let migrated = false;
let migrationPromise = null;

const ensureMigrated = async () => {
    if (migrated) return;
    if (!migrationPromise) {
        migrationPromise = (async () => {
            const settings = await Setting.findOne().sort({ createdAt: 1 });
            const integrations = settings?.integrations || [];
            const hasCloudinary = integrations.some((entry) => entry.subService === 'cloudinary');
            const hasJwt = integrations.some((entry) => entry.subService === 'store-session-jwt');
            if (hasCloudinary && hasJwt) {
                // Entries already migrated — just make sure the
                // legacy toggle section is gone from the document.
                if (settings) {
                    const raw = await Setting.collection.findOne(
                        { _id: settings._id },
                        { projection: { builtInServices: 1 } },
                    );
                    if (raw?.builtInServices) {
                        await Setting.collection.updateOne(
                            { _id: settings._id },
                            { $unset: { builtInServices: 1 } },
                        );
                    }
                }
                migrated = true;
                return;
            }

            // Source values: the legacy Credential store first (it
            // holds the live values verbatim), the environment as the
            // fallback for any field it lacks.
            const legacy = await Credential.findOne({ key: 'credentials' }).lean();
            const env = envValues();
            const source = {
                cloudinaryCloudName: legacy?.cloudinaryCloudName || env.cloudinaryCloudName,
                cloudinaryApiKey: legacy?.cloudinaryApiKey || env.cloudinaryApiKey,
                cloudinaryApiSecret: legacy?.cloudinaryApiSecret || env.cloudinaryApiSecret,
                jwtSecret: legacy?.jwtSecret || env.jwtSecret,
            };
            // Legacy toggles lived in Setting.builtInServices — read
            // the raw document, the schema no longer carries the field.
            const rawSettings = settings
                ? await Setting.collection.findOne({ _id: settings._id })
                : null;
            const legacyToggles = rawSettings?.builtInServices || {};

            const newEntries = [];
            if (!hasCloudinary) {
                newEntries.push(presetEntry({
                    definition: cloudinaryDefinition,
                    serviceSlug: 'cloudinary',
                    title: 'Cloudinary',
                    fields: {
                        cloudName: source.cloudinaryCloudName,
                        apiKey: source.cloudinaryApiKey,
                        apiSecret: source.cloudinaryApiSecret,
                    },
                    isConnected: legacyToggles.cloudinary?.isActive !== false,
                }));
            }
            if (!hasJwt) {
                newEntries.push(presetEntry({
                    definition: jwtDefinition,
                    serviceSlug: 'store-session-jwt',
                    title: 'Store Session (JWT)',
                    fields: { jwtSecret: source.jwtSecret },
                    isConnected: legacyToggles.storeSessionJwt?.isActive !== false,
                }));
            }

            // The two entries go FIRST in the array — the gate resolves
            // a category's provider in saved order, and Cloudinary was
            // always the preferred storage provider.
            const doc = settings || new Setting();
            doc.integrations = [...newEntries, ...(doc.integrations || [])];
            await doc.save();
            // The legacy toggle section has been fully absorbed into
            // the entries — remove it from the stored document. (Raw
            // collection: Mongoose casting would strip the $unset of
            // a field the schema no longer knows.)
            if (rawSettings?.builtInServices) {
                await Setting.collection.updateOne({ _id: doc._id }, { $unset: { builtInServices: 1 } });
            }
            migrated = true;
        })().catch((error) => {
            migrationPromise = null;
            throw error;
        });
    }
    return migrationPromise;
};

// --- Reads ---------------------------------------------------------------
let cache = { loadedAt: 0 };

const entryFields = (entry) => {
    if (!entry?.fields) return {};
    return entry.fields instanceof Map ? Object.fromEntries(entry.fields) : entry.fields;
};

const refreshCredentials = async (force = false) => {
    if (!force && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return snapshot;
    }
    try {
        await ensureMigrated();
        const setting = await Setting.findOne().sort({ createdAt: 1 }).lean();
        const integrations = setting?.integrations || [];
        const cloudinaryEntry = integrations.find((entry) => entry.subService === 'cloudinary');
        const jwtEntry = integrations.find((entry) => entry.subService === 'store-session-jwt');
        const cloudinaryFields = entryFields(cloudinaryEntry);
        const jwtFields = entryFields(jwtEntry);
        const env = envValues();
        snapshot = {
            cloudinaryCloudName: cloudinaryFields.cloudName || env.cloudinaryCloudName,
            cloudinaryApiKey: cloudinaryFields.apiKey || env.cloudinaryApiKey,
            cloudinaryApiSecret: cloudinaryFields.apiSecret || env.cloudinaryApiSecret,
            jwtSecret: jwtFields.jwtSecret || env.jwtSecret,
            cloudinaryActive: cloudinaryEntry ? cloudinaryEntry.isConnected !== false : true,
            jwtSigningActive: jwtEntry ? jwtEntry.isConnected !== false : true,
        };
        applyCloudinary(snapshot);
        cache = { loadedAt: Date.now() };
    } catch {
        // A store read failure must never break requests — the previous
        // (environment-seeded) snapshot stays in effect.
    }
    return snapshot;
};

/** Synchronous view of the last resolved values (env-seeded at boot). */
const currentCredentials = () => snapshot;

/** The JWT secret for VERIFYING tokens: stored value, environment
 *  fallback. Verification is never gated — existing sessions must keep
 *  working so an admin who toggles signing off can still reach the
 *  panel and turn it back on. */
const getJwtSecret = async () => (await refreshCredentials()).jwtSecret;

/**
 * The JWT secret for SIGNING new tokens (logins, 2FA temp tokens).
 * Gated by the Store Session (JWT) entry's activation toggle: when
 * the admin has switched that service OFF in Settings →
 * API / Integrations, no new tokens are issued. Throws an error with
 * code JWT_SIGNING_DISABLED; callers turn it into a clean 403.
 */
const getJwtSignSecret = async () => {
    const values = await refreshCredentials();
    if (!values.jwtSigningActive) {
        const error = new Error(
            'Sign-in is disabled: the Store Session (JWT) service is switched off in Settings → API / Integrations.',
        );
        error.code = 'JWT_SIGNING_DISABLED';
        throw error;
    }
    return values.jwtSecret;
};

/** Whether the Cloudinary service entry is toggled ON (media gate). */
const isCloudinaryActive = async () => (await refreshCredentials()).cloudinaryActive !== false;

/** The effective Cloudinary triple (also applied to the SDK singleton). */
const getCloudinaryCredentials = async () => {
    const values = await refreshCredentials();
    return {
        cloudName: values.cloudinaryCloudName,
        apiKey: values.cloudinaryApiKey,
        apiSecret: values.cloudinaryApiSecret,
    };
};

module.exports = {
    SECRET_MASK,
    ensureMigrated,
    refreshCredentials,
    currentCredentials,
    getJwtSecret,
    getJwtSignSecret,
    isCloudinaryActive,
    getCloudinaryCredentials,
};
