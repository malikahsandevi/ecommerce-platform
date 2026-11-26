const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
    Setting,
    RolePermission,
    Product,
    Category,
    Brand,
    Coupon,
    Order,
    User,
    Review,
    Media,
    BackupSnapshot,
} = require('../models');
const { refreshCredentials } = require('../utils/credentials');
const { invalidatePermissionCache } = require('../utils/permissions');
const { sendError } = require('../utils/apiError');

// ── Backup & Recovery (Ahsan's order) ───────────────────────────────
// A backup is ONE downloadable JSON file: every Settings document
// (all panels + all integration entries with their stored config —
// settings recovery is impossible without them), the role/permission
// matrix, and the business collections. It is generated on the fly
// and streamed as a download — never persisted on the server, never
// written to the repo. Both endpoints sit behind the route's
// Super-Admin gate AND the Settings Lock per-save password check
// (routes/settings.js), because the file carries integration secrets.
//
// CREDENTIAL HONESTY: user password hashes and TOTP secrets are
// EXCLUDED from the file — accounts travel as records only. On
// restore, an account that still exists keeps its CURRENT credential
// material (transplanted from the live database, never from the
// file); an account that no longer exists is recreated with a random
// unknown password (properly hashed) and 2FA off, so an admin must
// set a new password before it can sign in again.
const BACKUP_FORMAT = 'ecommerce-admin-backup';
const BACKUP_VERSION = 1;

// User fields that must never leave in a backup file, and never be
// accepted back from one.
const USER_CREDENTIAL_FIELDS = [
    'password',
    'twoFactorSecret',
    'twoFactorRecoveryCodes',
    'passwordResetTokenHash',
    'passwordResetExpires',
];

// Collections restored by straight delete-and-reinsert. Users are
// handled separately (credential transplant, below); settings and the
// permission matrix get their own post-steps (credential resolver
// refresh, permission cache invalidation).
const PLAIN_COLLECTIONS = [
    ['products', Product],
    ['categories', Category],
    ['brands', Brand],
    ['coupons', Coupon],
    ['orders', Order],
    ['reviews', Review],
    ['media', Media],
];

const ALL_DATA_KEYS = [
    'settings',
    'rolePermissions',
    'products',
    'categories',
    'brands',
    'coupons',
    'orders',
    'users',
    'reviews',
    'media',
];

const stripUserCredentials = (record) => {
    const clean = { ...record };
    for (const field of USER_CREDENTIAL_FIELDS) delete clean[field];
    return clean;
};

/** YYYY-MM-DD-HHmm in the store's timezone, for the file name. */
const fileStampInTimeZone = (date, timeZone) => {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(date);
        const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${byType.year}-${byType.month}-${byType.day}-${byType.hour}${byType.minute}`;
    } catch {
        const iso = date.toISOString();
        return `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
    }
};

/** Assembles the backup payload for the CURRENT database state —
 *  shared by the download endpoint and the pre-restore safety
 *  snapshot (GAP C), so a snapshot is byte-for-byte a backup file. */
const buildBackupPayload = async () => {
    const [
        settings,
        rolePermissions,
        products,
        categories,
        brands,
        coupons,
        orders,
        users,
        reviews,
        media,
    ] = await Promise.all([
        Setting.find().lean(),
        RolePermission.find().lean(),
        Product.find().lean(),
        Category.find().lean(),
        Brand.find().lean(),
        Coupon.find().lean(),
        Order.find().lean(),
        User.find().lean(),
        Review.find().lean(),
        Media.find().lean(),
    ]);

    const general = settings[0]?.general || {};
    const timeZone = general.timeZone || 'Asia/Karachi';
    const now = new Date();

    const payload = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: now.toISOString(),
        storeName: general.storeName || '',
        data: {
            settings,
            rolePermissions,
            products,
            categories,
            brands,
            coupons,
            orders,
            users: users.map(stripUserCredentials),
            reviews,
            media,
        },
    };

    return {
        payload,
        filename: `backup-${fileStampInTimeZone(now, timeZone)}.json`,
    };
};

// POST /api/settings/backup — build the file and stream it as a
// download. The payload goes out with res.send, NOT res.json: the
// media-protection response signer hooks res.json only, and a backup
// must carry the STORED (unsigned) asset URLs verbatim, exactly as
// they would be restored.
const createBackup = async (req, res) => {
    try {
        const { payload, filename } = await buildBackupPayload();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(JSON.stringify(payload));
    } catch (error) {
        return sendError(res, error, 500);
    }
};

/** How many pre-restore safety snapshots are retained. */
const SAFETY_SNAPSHOT_KEEP = 3;

/** Captures the current state as a server-side safety snapshot
 *  (GAP C). Runs BEFORE the first restore write; a failure here
 *  aborts the restore — restoring without a way back is worse than
 *  not restoring. Older snapshots beyond the keep-limit are pruned. */
const takeSafetySnapshot = async (req) => {
    const { payload } = await buildBackupPayload();
    const serialized = JSON.stringify(payload);
    const snapshot = await BackupSnapshot.create({
        createdBy: req.user?._id || null,
        reason: 'pre-restore',
        payload: serialized,
        sizeBytes: Buffer.byteLength(serialized),
    });
    const stale = await BackupSnapshot.find()
        .sort({ createdAt: -1 })
        .skip(SAFETY_SNAPSHOT_KEEP)
        .select('_id')
        .lean();
    if (stale.length > 0) {
        await BackupSnapshot.deleteMany({ _id: { $in: stale.map((entry) => entry._id) } });
    }
    return snapshot;
};

// GET /api/settings/backup/safety — download the newest pre-restore
// safety snapshot as a backup file (restoring it undoes the restore
// it preceded). Same gates as creating a backup: the payload carries
// the same integration secrets.
const downloadSafetyBackup = async (req, res) => {
    try {
        const snapshot = await BackupSnapshot.findOne().sort({ createdAt: -1 }).lean();
        if (!snapshot) {
            return res.status(404).json({
                message: 'No safety backup exists yet — one is saved automatically before every restore.',
            });
        }
        const stamp = fileStampInTimeZone(new Date(snapshot.createdAt), 'Asia/Karachi');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="safety-backup-${stamp}.json"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(snapshot.payload);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

const isPlainRecord = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Full structural validation, run BEFORE anything is written: a
 *  malformed or foreign file fails closed and changes nothing. */
const validateBackup = (backup) => {
    if (!isPlainRecord(backup)) return 'The uploaded file is not a backup file.';
    if (backup.format !== BACKUP_FORMAT) {
        return 'The uploaded file is not a backup file for this store.';
    }
    if (backup.version !== BACKUP_VERSION) {
        return `Unsupported backup version: ${String(backup.version ?? 'unknown')}.`;
    }
    if (!isPlainRecord(backup.data)) return 'The backup file is missing its data section.';
    for (const key of ALL_DATA_KEYS) {
        if (!Array.isArray(backup.data[key])) {
            return `The backup file is incomplete: "${key}" is missing or invalid.`;
        }
        for (const entry of backup.data[key]) {
            if (!isPlainRecord(entry)) {
                return `The backup file is corrupted: "${key}" contains an invalid record.`;
            }
        }
    }
    for (const user of backup.data.users) {
        if (typeof user.email !== 'string' || typeof user.username !== 'string') {
            return 'The backup file is corrupted: a user record is missing its email or username.';
        }
    }
    return null;
};

/** Business-unique values per collection — the fields a restore
 *  would collide on at insert time. */
const UNIQUE_VALUE_FIELDS = {
    products: ['slug', 'sku'],
    categories: ['slug'],
    brands: ['slug'],
    coupons: ['code'],
    orders: ['orderNumber'],
    users: ['email', 'username'],
};

/**
 * Duplicate pre-flight, run BEFORE anything is written. Structural
 * validation alone cannot see that two products in the file share a
 * slug, or that two records carry the same _id — the restore used to
 * discover that at insert time, AFTER earlier collections had
 * already been replaced, leaving the store half-restored. Any
 * duplicate now refuses the whole restore with nothing changed.
 */
const validateDuplicates = (data) => {
    for (const key of ALL_DATA_KEYS) {
        const seenIds = new Set();
        for (const entry of data[key]) {
            if (entry._id == null) continue;
            const id = String(entry._id);
            if (seenIds.has(id)) {
                return `The backup file is corrupted: "${key}" contains the same record twice. Nothing was restored.`;
            }
            seenIds.add(id);
        }
        for (const field of UNIQUE_VALUE_FIELDS[key] || []) {
            const seenValues = new Set();
            for (const entry of data[key]) {
                const raw = entry[field];
                if (raw == null || raw === '') continue;
                const value = field === 'email' ? String(raw).toLowerCase() : String(raw);
                if (seenValues.has(value)) {
                    return `The backup file is corrupted: "${key}" contains two records with the same ${field} ("${String(raw)}"). Nothing was restored.`;
                }
                seenValues.add(value);
            }
        }
    }
    return null;
};

const MODEL_BY_KEY = {
    settings: Setting,
    rolePermissions: RolePermission,
    products: Product,
    categories: Category,
    brands: Brand,
    coupons: Coupon,
    orders: Order,
    users: User,
    reviews: Review,
    media: Media,
};

/**
 * Schema pre-flight: every record in the file is validated against
 * its model (required fields, types, enums) BEFORE the first write,
 * so a record MongoDB would refuse at insert time refuses the whole
 * restore up front instead of stranding it half-applied. Users are
 * validated as the PREPARED documents (credentials transplanted), in
 * exactly the shape that will be inserted.
 */
const validateAgainstModels = async (data, preparedUserDocs) => {
    for (const key of ALL_DATA_KEYS) {
        const Model = MODEL_BY_KEY[key];
        if (!Model) continue;
        const docs = key === 'users' ? preparedUserDocs : data[key];
        for (const doc of docs) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await new Model(doc).validate();
            } catch {
                return `The backup file is corrupted: a "${key}" record is missing required data or holds an invalid value. Nothing was restored.`;
            }
        }
    }
    return null;
};

/** Replaces one collection with the file's records (original _ids
 *  ride along, so cross-references between collections stay intact). */
const replaceCollection = async (Model, docs) => {
    await Model.deleteMany({});
    if (docs.length > 0) {
        await Model.insertMany(docs, { ordered: true });
    }
    return docs.length;
};

/** Users: delete-and-reinsert like the rest, EXCEPT credential
 *  material — it never comes from the file. Accounts matched by email
 *  keep their live password hash, TOTP secret/state and reset fields
 *  (transplanted from the current database); accounts the file brings
 *  back from deletion get a random unknown password (hashed) and 2FA
 *  off. The caller's own account is never deleted out from under the
 *  restore: if it is not in the file it is kept as-is.
 *
 *  Split in two: prepareRestoredUsers only READS (it assembles the
 *  exact documents that will be inserted, so the restore's
 *  pre-flight can validate them before anything is written);
 *  writeRestoredUsers performs the replacement. */
const prepareRestoredUsers = async (req, backupUsers) => {
    const current = await User.find()
        .select('+password +twoFactorSecret +passwordResetTokenHash +twoFactorRecoveryCodes')
        .lean();
    const currentByEmail = new Map(
        current.map((user) => [String(user.email || '').toLowerCase(), user]),
    );
    const callerId = String(req.user?._id || '');
    const callerInFile = backupUsers.some(
        (user) => String(user._id || '') === callerId,
    );

    const docs = [];
    let recreated = 0;
    for (const record of backupUsers) {
        const doc = stripUserCredentials(record);
        const existing = currentByEmail.get(String(record.email || '').toLowerCase());
        if (existing) {
            doc.password = existing.password;
            doc.twoFactorSecret = existing.twoFactorSecret ?? null;
            // Recovery codes transplant with the rest of the live
            // credential set (GAP B): a restore must never silently
            // resurrect codes the owner burned or kill the set they
            // are holding.
            doc.twoFactorRecoveryCodes = existing.twoFactorRecoveryCodes ?? [];
            doc.twoFactorEnabled = Boolean(existing.twoFactorEnabled);
            doc.passwordResetTokenHash = existing.passwordResetTokenHash ?? null;
            doc.passwordResetExpires = existing.passwordResetExpires ?? null;
        } else {
            // Recreated account: a random password nobody knows,
            // stored as a proper bcrypt hash (insertMany runs no
            // pre-save hooks, so the hashing happens here). An admin
            // sets a real password before this account can sign in;
            // mandatory login-time 2FA enrolment applies as usual.
            // eslint-disable-next-line no-await-in-loop
            doc.password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
            doc.twoFactorSecret = null;
            doc.twoFactorRecoveryCodes = [];
            doc.twoFactorEnabled = false;
            doc.passwordResetTokenHash = null;
            doc.passwordResetExpires = null;
            recreated += 1;
        }
        docs.push(doc);
    }

    const keepIds = callerInFile ? [] : [callerId].filter(Boolean);
    return { docs, recreated, keepIds };
};

const writeRestoredUsers = async (prepared) => {
    const { docs, recreated, keepIds } = prepared;
    await User.deleteMany(keepIds.length ? { _id: { $nin: keepIds } } : {});
    if (docs.length > 0) {
        await User.insertMany(docs, { ordered: true });
    }
    return { restored: docs.length, recreated, kept: keepIds.length };
};

// POST /api/settings/backup/restore — validate everything, then
// replace the backed-up data with the file's contents and report a
// per-collection restored-count summary.
const restoreBackup = async (req, res) => {
    try {
        const backup = req.body?.backup;
        const validationError = validateBackup(backup);
        if (validationError) {
            return res.status(400).json({ message: validationError });
        }
        const data = backup.data;

        // FULL pre-flight before the first write: duplicates the
        // insert would collide on, then every record validated
        // against its schema. A file that fails either check changes
        // NOTHING — a restore never strands the store half-restored.
        const duplicateError = validateDuplicates(data);
        if (duplicateError) {
            return res.status(400).json({ message: duplicateError });
        }
        const preparedUsers = await prepareRestoredUsers(req, data.users);
        const schemaError = await validateAgainstModels(data, preparedUsers.docs);
        if (schemaError) {
            return res.status(400).json({ message: schemaError });
        }

        // SAFETY SNAPSHOT (GAP C): the current state is captured
        // server-side BEFORE the first write, in backup-file format,
        // so this restore can itself be undone. If the snapshot
        // cannot be taken, the restore does not run at all.
        let safetySnapshot;
        try {
            safetySnapshot = await takeSafetySnapshot(req);
        } catch (snapshotError) {
            console.error(`[backup] safety snapshot failed, restore aborted: ${snapshotError.message}`);
            return res.status(500).json({
                message: 'The safety backup before this restore could not be saved, so nothing was restored. Try again.',
            });
        }

        const counts = {};

        counts.settings = await replaceCollection(Setting, data.settings);
        counts.rolePermissions = await replaceCollection(RolePermission, data.rolePermissions);
        for (const [key, Model] of PLAIN_COLLECTIONS) {
            // eslint-disable-next-line no-await-in-loop
            counts[key] = await replaceCollection(Model, data[key]);
        }
        const userResult = await writeRestoredUsers(preparedUsers);
        counts.users = userResult.restored;
        counts.usersRecreated = userResult.recreated;
        counts.usersKept = userResult.kept;

        // The restored settings may carry different integration
        // credentials (Cloudinary, the JWT service) and a different
        // permission matrix — refresh both live resolvers on this
        // instance, exactly like a settings save does.
        invalidatePermissionCache();
        await refreshCredentials(true);

        return res.json({
            message: 'Backup restored.',
            counts,
            restoredAt: new Date().toISOString(),
            safetyBackup: {
                id: String(safetySnapshot._id),
                createdAt: safetySnapshot.createdAt,
            },
        });
    } catch (error) {
        return sendError(res, error, 500);
    }
};

module.exports = { createBackup, restoreBackup, downloadSafetyBackup };
