// Runtime credential resolution — service credentials are managed from
// the admin panel (Settings → Credentials) and stored in MongoDB
// (models/Credential.js), NOT in hosting-platform environment variables.
//
// Resolution rules:
//  - Per field, the stored DB value wins; the environment value is the
//    fallback (so a field the admin cleared still resolves, and a store
//    read failure can never break the API — the env snapshot stays).
//  - On first boot the store SEEEDS itself from the environment, so an
//    existing deployment migrates with identical values: live JWT
//    sessions keep verifying and Cloudinary signatures keep matching.
//  - MONGO_URI is deliberately NOT part of this: the backend needs it
//    before it can read any document (bootstrap credential).
//
// Freshness: reads are cached for 30s (same pattern as the permission
// matrix). A save through the Settings API invalidates and refreshes
// immediately on the instance that served the save; other serverless
// instances converge within the TTL. No redeploy is ever needed.
//
// The Cloudinary SDK is a process-wide singleton configured at boot from
// the environment (config/cloudinary.js); whenever the effective values
// change, refreshCredentials re-applies them via cloudinary.config().
const Credential = require('../models/Credential');
const Setting = require('../models/Setting');
const cloudinary = require('../config/cloudinary');

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
// The two activation flags mirror Setting.builtInServices (the panel's
// toggles for the built-in services, config/services/index.js's gate):
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

// --- Seeding ------------------------------------------------------------
// First boot with an empty store copies the environment values into the
// document — verbatim, so nothing about live behaviour changes at the
// moment of migration. Runs once per process; safe under races (the
// unique key turns a double-create into a no-op).
let seeded = false;
let seedPromise = null;

const ensureSeeded = async () => {
    if (seeded) return;
    if (!seedPromise) {
        seedPromise = (async () => {
            const existing = await Credential.findOne({ key: 'credentials' }).lean();
            if (!existing) {
                try {
                    await Credential.create({ key: 'credentials', ...envValues() });
                } catch (error) {
                    if (error?.code !== 11000) throw error; // another instance seeded first
                }
            }
            seeded = true;
        })().catch((error) => {
            seedPromise = null;
            throw error;
        });
    }
    return seedPromise;
};

// --- Reads ---------------------------------------------------------------
let cache = { loadedAt: 0 };

const refreshCredentials = async (force = false) => {
    if (!force && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
        return snapshot;
    }
    try {
        await ensureSeeded();
        const doc = await Credential.findOne({ key: 'credentials' }).lean();
        const setting = await Setting.findOne().sort({ createdAt: 1 }).lean();
        const env = envValues();
        snapshot = {
            cloudinaryCloudName: doc?.cloudinaryCloudName || env.cloudinaryCloudName,
            cloudinaryApiKey: doc?.cloudinaryApiKey || env.cloudinaryApiKey,
            cloudinaryApiSecret: doc?.cloudinaryApiSecret || env.cloudinaryApiSecret,
            jwtSecret: doc?.jwtSecret || env.jwtSecret,
            cloudinaryActive: setting?.builtInServices?.cloudinary?.isActive !== false,
            jwtSigningActive: setting?.builtInServices?.storeSessionJwt?.isActive !== false,
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
 * Gated by the Store Session (JWT) activation toggle: when the admin
 * has switched the built-in Auth service OFF in Settings →
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

/** Whether the built-in Cloudinary service is toggled ON (media gate). */
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

// --- Writes ---------------------------------------------------------------
/**
 * Persists credential updates (Super Admin only — enforced at the route).
 * Only fields present in `updates` are touched; the caller decides the
 * keep-on-empty rule for secrets before calling this.
 */
const saveCredentials = async (updates, updatedBy) => {
    await ensureSeeded();
    const doc = await Credential.findOne({ key: 'credentials' });
    if (!doc) throw new Error('Credential store is unavailable.');
    for (const field of ['cloudinaryCloudName', 'cloudinaryApiKey', 'cloudinaryApiSecret', 'jwtSecret']) {
        if (updates[field] !== undefined) doc[field] = updates[field];
    }
    if (updatedBy) doc.updatedBy = updatedBy;
    await doc.save();
    cache = { loadedAt: 0 };
    return refreshCredentials(true);
};

// --- API view ---------------------------------------------------------------
/**
 * What the Settings API may show: cloud name and API key in full (they
 * are identifiers the browser already receives with every upload
 * signature), the two secrets ONLY as a fixed mask + a configured flag.
 * The full secret values never leave the backend.
 */
const maskedView = (values = snapshot) => ({
    cloudinary: {
        cloudName: values.cloudinaryCloudName,
        apiKey: values.cloudinaryApiKey,
        apiSecret: values.cloudinaryApiSecret ? SECRET_MASK : '',
        apiSecretConfigured: Boolean(values.cloudinaryApiSecret),
    },
    jwt: {
        secret: values.jwtSecret ? SECRET_MASK : '',
        secretConfigured: Boolean(values.jwtSecret),
    },
});

module.exports = {
    SECRET_MASK,
    ensureSeeded,
    refreshCredentials,
    currentCredentials,
    getJwtSecret,
    getJwtSignSecret,
    isCloudinaryActive,
    getCloudinaryCredentials,
    saveCredentials,
    maskedView,
};
