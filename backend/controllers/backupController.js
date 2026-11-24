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
} = require('../models');
const { refreshCredentials } = require('../utils/credentials');
const { invalidatePermissionCache } = require('../utils/permissions');

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

// POST /api/settings/backup — build the file and stream it as a
// download. The payload goes out with res.send, NOT res.json: the
// media-protection response signer hooks res.json only, and a backup
// must carry the STORED (unsigned) asset URLs verbatim, exactly as
// they would be restored.
const createBackup = async (req, res) => {
    try {
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

        const filename = `backup-${fileStampInTimeZone(now, timeZone)}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(JSON.stringify(payload));
    } catch (error) {
        return res.status(500).json({ message: error.message });
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
 *  restore: if it is not in the file it is kept as-is. */
const restoreUsers = async (req, backupUsers) => {
    const current = await User.find()
        .select('+password +twoFactorSecret +passwordResetTokenHash')
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
            doc.twoFactorEnabled = false;
            doc.passwordResetTokenHash = null;
            doc.passwordResetExpires = null;
            recreated += 1;
        }
        docs.push(doc);
    }

    const keepIds = callerInFile ? [] : [callerId].filter(Boolean);
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
        const counts = {};

        counts.settings = await replaceCollection(Setting, data.settings);
        counts.rolePermissions = await replaceCollection(RolePermission, data.rolePermissions);
        for (const [key, Model] of PLAIN_COLLECTIONS) {
            // eslint-disable-next-line no-await-in-loop
            counts[key] = await replaceCollection(Model, data[key]);
        }
        const userResult = await restoreUsers(req, data.users);
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
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { createBackup, restoreBackup };
