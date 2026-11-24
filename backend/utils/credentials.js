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
const cloudinaryClient = require('./cloudinaryClient');

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
// cloudSecrets maps EVERY configured Cloudinary entry's cloud name to
// its API secret, so response signing works per entry (an asset that
// lives on "Cloudinary 2" is signed with that account's secret).
let snapshot = {
    ...envValues(),
    cloudinaryActive: true,
    jwtSigningActive: true,
    cloudSecrets: {},
};
if (snapshot.cloudinaryCloudName && snapshot.cloudinaryApiSecret) {
    snapshot.cloudSecrets = {
        [snapshot.cloudinaryCloudName]: snapshot.cloudinaryApiSecret,
    };
}

// Every STORAGE entry from the integrations array, in saved order, with
// its credential triple resolved (the FIRST Cloudinary entry — the
// original one — keeps the per-field environment fallback the primary
// resolver has always had; later entries use their stored values only).
// Rebuilt by refreshCredentials alongside the primary snapshot.
let storageEntriesCache = [];

// The admin's chosen upload destination (Setting.storage.uploadTarget):
// empty or "auto" = the Auto rotation policy below decides where NEW
// uploads go; any other value is the serviceSlug of a pinned storage
// entry that overrides Auto while it stays configured + switched on.
let uploadTargetCache = '';

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
            cloudSecrets: {},
        };
        if (snapshot.cloudinaryCloudName && snapshot.cloudinaryApiSecret) {
            snapshot.cloudSecrets[snapshot.cloudinaryCloudName] = snapshot.cloudinaryApiSecret;
        }

        // Per-entry storage resolution: EVERY storage entry the admin
        // configured (any count — two, three, more), each with its own
        // credentials, so uploads, measurement and asset operations can
        // be routed per entry instead of assuming one account.
        let firstCloudinarySeen = false;
        storageEntriesCache = integrations
            .filter((entry) => entry && entry.usageType === 'STORAGE' && entry.serviceSlug)
            .map((entry) => {
                const fields = entryFields(entry);
                const isCloudinary = entry.subService === 'cloudinary';
                const isFirstCloudinary = isCloudinary && !firstCloudinarySeen;
                if (isCloudinary) firstCloudinarySeen = true;
                const cloudName = isCloudinary
                    ? fields.cloudName || (isFirstCloudinary ? env.cloudinaryCloudName : '')
                    : '';
                const apiKey = isCloudinary
                    ? fields.apiKey || (isFirstCloudinary ? env.cloudinaryApiKey : '')
                    : '';
                const apiSecret = isCloudinary
                    ? fields.apiSecret || (isFirstCloudinary ? env.cloudinaryApiSecret : '')
                    : '';
                if (isCloudinary && cloudName && apiSecret && !snapshot.cloudSecrets[cloudName]) {
                    snapshot.cloudSecrets[cloudName] = apiSecret;
                }
                return {
                    slug: entry.serviceSlug,
                    title: entry.title || entry.serviceSlug,
                    subService: entry.subService || '',
                    isConnected: entry.isConnected !== false,
                    cloudName,
                    apiKey,
                    apiSecret,
                    configured: isCloudinary
                        ? Boolean(cloudName && apiKey && apiSecret)
                        : Object.keys(fields).length > 0 ||
                          (Array.isArray(entry.customFields) && entry.customFields.length > 0),
                };
            });
        uploadTargetCache = setting?.storage?.uploadTarget || '';

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

// --- Per-entry storage -----------------------------------------------------

/** Every configured STORAGE entry (saved order), credentials resolved.
 *  Internal use only — API responses must strip the secret fields. */
const getStorageEntries = async () => {
    await refreshCredentials();
    return storageEntriesCache;
};

/** The original storage entry: the first Cloudinary entry, if any. */
const getDefaultStorageEntry = async () => {
    const entries = await getStorageEntries();
    return entries.find((entry) => entry.subService === 'cloudinary') || null;
};

const getStorageEntryBySlug = async (slug) => {
    if (!slug) return null;
    const entries = await getStorageEntries();
    return entries.find((entry) => entry.slug === slug) || null;
};

const getStorageEntryByCloudName = async (cloudName) => {
    if (!cloudName) return null;
    const entries = await getStorageEntries();
    return entries.find((entry) => entry.cloudName && entry.cloudName === cloudName) || null;
};

/**
 * Upload destination — a manual pin, or the AUTO rotation policy.
 *
 * The stored choice (Setting.storage.uploadTarget) is either "auto"
 * (or empty — Auto is the default) or the slug of one storage entry:
 * the PIN. A usable pin (configured + switched on) overrides Auto
 * completely — the tiers below never move uploads off it. A pin whose
 * entry is switched off or unconfigured falls back to Auto, and the
 * Media page card says so.
 *
 * AUTO is a tiered, SEQUENTIAL state machine over the configured +
 * switched-on Cloudinary entries, in their saved order. Entries that
 * point at the SAME provider account (same cloud name) are ONE pool —
 * the account's usage/quota is shared, so they fill and rotate
 * together and the pool's first entry receives the uploads. All
 * percentages are of the account's quota, and on Cloudinary's Credit
 * System the quota is credits.limit (1 credit = 1 GB) with the used
 * share credits.usage — the same credit remainder the plan round
 * settled for the Media page's "available" figure:
 *
 *   1. ONE storage at a time: the first pool under 80% is the target;
 *      uploads never spread across several pools at once.
 *   2. At 80% the target SHIFTS to the next pool under 80% (the staff
 *      notifications feed reports the shift — see routes/notifications).
 *   3. No pool is filled past 90% during rotation: a pool at ≥90% is
 *      skipped as a rotation target.
 *   4. When EVERY pool is ≥80%, the least-full pool in the 80–90%
 *      band is used, filling toward 90%.
 *   5. When the resolved destination is ≥90% full (everything is in
 *      the 90–98% band), the upload PROCEEDS with a warning naming
 *      the destination.
 *   6. At 98% uploads STOP: a destination at ≥98% refuses the upload.
 *   7. Fit check, always: a file larger than the destination's
 *      remaining space advances to the next candidate under the same
 *      policy; if it fits nowhere within the caps, the upload is
 *      refused with the file size and the available space.
 *   8. A pool whose quota the provider did not report cannot be
 *      measured, so it ranks below every measurable pool; when NO
 *      pool has a known quota, the first configured + active entry
 *      is the target (no percentages can be computed).
 *
 * The hard protections (98% stop + fit check) apply to a pinned
 * destination too — a pin that is ≥98% full refuses, and a file that
 * cannot fit on the pin falls back to the Auto sequence for that
 * upload. The ≥90% warning likewise names a pinned destination.
 */
const GB_BYTES = 1024 * 1024 * 1024;
const ROTATE_AT_PERCENT = 80;
const WARNING_AT_PERCENT = 90;
const STOP_AT_PERCENT = 98;

const credsOfEntry = (entry) => ({
    cloudName: entry.cloudName,
    apiKey: entry.apiKey,
    apiSecret: entry.apiSecret,
});

const accountKeyOfEntry = (entry) =>
    entry.cloudName ? `cloudinary:${entry.cloudName}` : `entry:${entry.slug}`;

const formatBytesHuman = (bytes) => {
    if (bytes == null || !Number.isFinite(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/** One account pool's quota picture from its usage record (or nulls
 *  when the provider reported nothing measurable). */
const describePool = (poolEntries, usage) => {
    const first = poolEntries[0];
    let percent = null;
    let remainingBytes = null;
    if (usage && usage.creditsLimit) {
        if (usage.creditsUsed != null) {
            percent = (usage.creditsUsed / usage.creditsLimit) * 100;
            remainingBytes = Math.max(0, (usage.creditsLimit - usage.creditsUsed) * GB_BYTES);
        } else if (usage.storageUsedBytes != null) {
            const quotaBytes = usage.creditsLimit * GB_BYTES;
            percent = (usage.storageUsedBytes / quotaBytes) * 100;
            remainingBytes = Math.max(0, quotaBytes - usage.storageUsedBytes);
        }
    }
    return {
        key: accountKeyOfEntry(first),
        entries: poolEntries,
        entry: first,
        title: first.title,
        percent,
        remainingBytes,
        known: percent != null,
    };
};

/**
 * The rotation state: every configured + switched-on Cloudinary entry
 * grouped into account pools (saved order), each pool described with
 * its account's live usage. Usage is fetched per pool in parallel
 * with the per-entry REST client; a failed call leaves that pool
 * unmeasured (usage null) rather than failing the resolution.
 */
const getStorageRotation = async () => {
    const entries = await getStorageEntries();
    const cloudinaryEntries = entries.filter((entry) => entry.subService === 'cloudinary');
    const candidates = cloudinaryEntries.filter((entry) => entry.configured && entry.isConnected);
    const pools = [];
    const byKey = new Map();
    for (const entry of candidates) {
        const key = accountKeyOfEntry(entry);
        if (!byKey.has(key)) {
            const pool = { key, entries: [] };
            byKey.set(key, pool);
            pools.push(pool);
        }
        byKey.get(key).entries.push(entry);
    }
    const described = await Promise.all(
        pools.map(async (pool) => {
            let usage = null;
            try {
                usage = await cloudinaryClient.usage(credsOfEntry(pool.entries[0]));
            } catch {
                usage = null;
            }
            return describePool(pool.entries, usage);
        }),
    );
    return { cloudinaryEntries, candidates, pools: described };
};

const warningForPool = (pool) =>
    pool && pool.known && pool.percent >= WARNING_AT_PERCENT && pool.percent < STOP_AT_PERCENT
        ? `Storage ${pool.title} is over 90% full — this file will be saved to ${pool.title}`
        : null;

/** The Auto half of the policy: pick the pool an upload goes to. */
const pickAutoPool = (pools, fileSize) => {
    const fits = (pool) =>
        fileSize == null || pool.remainingBytes == null || pool.remainingBytes >= fileSize;
    const known = pools.filter((pool) => pool.known);
    if (!known.length) {
        // Rule 8: nothing measurable — the first usable entry, in order.
        return { pool: pools[0] || null };
    }
    // Tier 1 — sequential fill: first pool under 80% that fits the file.
    for (const pool of pools) {
        if (pool.known && pool.percent < ROTATE_AT_PERCENT && fits(pool)) return { pool };
    }
    // Tier 2 — all ≥80%: least-full pool in the 80–90% band.
    const band = known
        .filter((pool) => pool.percent >= ROTATE_AT_PERCENT && pool.percent < WARNING_AT_PERCENT)
        .sort((a, b) => a.percent - b.percent);
    for (const pool of band) if (fits(pool)) return { pool };
    // Tier 3 — the 90–98% band, least-full first (warning at the caller).
    const hot = known
        .filter((pool) => pool.percent >= WARNING_AT_PERCENT && pool.percent < STOP_AT_PERCENT)
        .sort((a, b) => a.percent - b.percent);
    for (const pool of hot) if (fits(pool)) return { pool };
    // Last resort — pools whose quota cannot be measured.
    for (const pool of pools) if (!pool.known) return { pool };
    // Refusals: everything measurable is at the stop line, or the file
    // fits nowhere within the caps.
    const leastFull = [...known].sort((a, b) => a.percent - b.percent)[0];
    if (leastFull && leastFull.percent >= STOP_AT_PERCENT) {
        return {
            pool: null,
            blockMessage:
                `Upload stopped: ${leastFull.title} is ${Math.round(leastFull.percent)}% full — ` +
                'storage stops accepting uploads at 98%. Free up space or add another storage first.',
        };
    }
    const maxRemaining = Math.max(...known.map((pool) => pool.remainingBytes ?? 0));
    const roomiest = known.find((pool) => (pool.remainingBytes ?? 0) === maxRemaining);
    return {
        pool: null,
        blockMessage:
            `This file (${formatBytesHuman(fileSize)}) does not fit in the available storage — ` +
            `the most free space on any storage is ${formatBytesHuman(maxRemaining)} (${roomiest?.title}).`,
    };
};

/**
 * Full resolution of the upload destination for one upload.
 * `fileSize` (bytes) feeds the fit check when the caller knows it.
 * Returns the entry plus everything the callers need: the stored
 * choice, whether a pin is in effect or Auto is, the ≥90% warning,
 * a refusal (blocked + message) when the policy stops the upload,
 * and — for the notifications feed — the pool the rotation shifted
 * away from (the nearest preceding pool at ≥80%), when it shifted.
 * With NO usable entry at all, entry falls back to the original
 * Cloudinary entry (or null) so the media gate can refuse with its
 * name, exactly as before Auto existed.
 */
const resolveUploadTargetDetailed = async ({ fileSize = null } = {}) => {
    const { cloudinaryEntries, pools } = await getStorageRotation();
    const choice =
        uploadTargetCache && uploadTargetCache !== 'auto' ? uploadTargetCache : 'auto';
    const base = {
        choice,
        mode: 'auto',
        pinUsable: false,
        entry: null,
        pool: null,
        warning: null,
        blocked: false,
        blockMessage: null,
        shiftedFrom: null,
    };
    if (!cloudinaryEntries.length) return base;

    if (choice !== 'auto') {
        const pinned = cloudinaryEntries.find((entry) => entry.slug === choice);
        if (pinned && pinned.configured && pinned.isConnected) {
            let usage = null;
            try {
                usage = await cloudinaryClient.usage(credsOfEntry(pinned));
            } catch {
                usage = null;
            }
            const pool = describePool([pinned], usage);
            if (pool.known && pool.percent >= STOP_AT_PERCENT) {
                return {
                    ...base,
                    mode: 'pin',
                    pinUsable: true,
                    pool,
                    blocked: true,
                    blockMessage:
                        `Upload stopped: ${pinned.title} is ${Math.round(pool.percent)}% full — ` +
                        'storage stops accepting uploads at 98%. Free up space or add another storage first.',
                };
            }
            const fitsPin =
                fileSize == null || pool.remainingBytes == null || pool.remainingBytes >= fileSize;
            if (fitsPin) {
                return {
                    ...base,
                    mode: 'pin',
                    pinUsable: true,
                    pool,
                    entry: pinned,
                    warning: warningForPool(pool),
                };
            }
            // The file cannot fit on the pin — this one upload falls
            // back to the Auto sequence below.
        }
    }

    const picked = pickAutoPool(pools, fileSize);
    if (!picked.pool) {
        if (!pools.length) return { ...base, entry: cloudinaryEntries[0] };
        return { ...base, blocked: true, blockMessage: picked.blockMessage };
    }
    const pool = picked.pool;
    let shiftedFrom = null;
    const index = pools.indexOf(pool);
    for (let i = index - 1; i >= 0; i--) {
        if (pools[i].known && pools[i].percent >= ROTATE_AT_PERCENT) {
            shiftedFrom = pools[i];
            break;
        }
    }
    return { ...base, entry: pool.entry, pool, warning: warningForPool(pool), shiftedFrom };
};

/** The entry that receives NEW uploads (see the policy above). */
const resolveUploadTarget = async () => (await resolveUploadTargetDetailed()).entry;

/** Persist the admin's upload-target choice in the Setting document. */
const setUploadTarget = async (slug) => {
    const setting = await Setting.findOne().sort({ createdAt: 1 });
    if (!setting) throw new Error('Settings document not found.');
    setting.storage = { ...(setting.storage || {}), uploadTarget: slug };
    await setting.save();
    await refreshCredentials(true);
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
    getStorageEntries,
    getDefaultStorageEntry,
    getStorageEntryBySlug,
    getStorageEntryByCloudName,
    getStorageRotation,
    resolveUploadTarget,
    resolveUploadTargetDetailed,
    setUploadTarget,
};
