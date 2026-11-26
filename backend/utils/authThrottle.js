const AuthThrottle = require('../models/AuthThrottle');

// ── Authentication throttling (Claude 8.3 round, GAP A) ─────────────
// Commercial-standard brute-force protection for every credential
// surface: staff login, staff 2FA verify + enrol-confirm, customer
// login, customer registration, and both forgot-password flows.
//
// Rules (one config place — the AUTH_THROTTLE object below):
//   · Failures are counted per ACCOUNT and per IP. The account
//     counter locks at `maxFailures`; the IP counter — shared by
//     every account signing in from that address — locks at the
//     higher `ipMaxFailures`, so one person's typos behind an
//     office NAT cannot lock the whole team out, while a guessing
//     run against many accounts still hits a wall.
//   · A locked flow answers 429 with a human sentence — the SAME
//     sentence for an account that exists and one that does not
//     (failures are recorded for unknown emails too), so the lock
//     can never be used to enumerate accounts.
//   · A success wipes the counters for that account + IP pair.
//   · The lock is checked inside the credential endpoints
//     themselves, so no other path (Settings Lock proofs, session
//     tokens) can be used to guess around it.
//   · Forgot-password is throttled by REQUEST count instead: past
//     the limit the endpoint keeps its generic answer but silently
//     issues no token and sends no email.
//   · Registration is throttled per IP by attempt count.
// The lock length can be shortened through the environment for
// staging/tests (AUTH_THROTTLE_LOCK_MINUTES); production default 15.
const AUTH_THROTTLE = {
    maxFailures: 5,
    ipMaxFailures: 20,
    lockMinutes: Number(process.env.AUTH_THROTTLE_LOCK_MINUTES) > 0
        ? Number(process.env.AUTH_THROTTLE_LOCK_MINUTES)
        : 15,
    registerMaxAttempts: 10,
    forgotMaxRequests: 5,
};

const lockMs = () => AUTH_THROTTLE.lockMinutes * 60 * 1000;

/** The client IP: the first hop of X-Forwarded-For behind the
 *  platform proxy, else the socket address. */
const getClientIp = (req) => {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
};

const lockMessage = (retryMinutes) =>
    `Too many failed attempts. Try again in ${Math.max(1, retryMinutes)} minute${retryMinutes === 1 ? '' : 's'}.`;

/** Is any of these keys currently locked? Returns the longest
 *  remaining lock so the message never understates the wait. */
const throttleLock = async (keys) => {
    const now = Date.now();
    const docs = await AuthThrottle.find({ key: { $in: keys } }).lean();
    let retryMinutes = 0;
    for (const doc of docs) {
        if (doc.lockedUntil && new Date(doc.lockedUntil).getTime() > now) {
            retryMinutes = Math.max(
                retryMinutes,
                Math.ceil((new Date(doc.lockedUntil).getTime() - now) / 60000),
            );
        }
    }
    return retryMinutes > 0
        ? { locked: true, retryMinutes, message: lockMessage(retryMinutes) }
        : { locked: false, retryMinutes: 0, message: null };
};

/** Records one failed attempt against every key. Entries may be
 *  bare key strings (locked at the default limit — or the explicit
 *  `defaultLimit` argument) or { key, limit } pairs, which is how
 *  the login flows give the shared IP key its higher ceiling. A key
 *  whose window has fully elapsed (and whose lock, if any, has
 *  expired) starts a fresh window; reaching its limit sets the lock. */
const recordThrottleFailure = async (entries, defaultLimit = AUTH_THROTTLE.maxFailures) => {
    const now = new Date();
    for (const entry of entries) {
        const key = typeof entry === 'string' ? entry : entry.key;
        const maxFailures = typeof entry === 'string' || entry.limit == null
            ? defaultLimit
            : entry.limit;
        // eslint-disable-next-line no-await-in-loop
        const doc = await AuthThrottle.findOne({ key });
        if (!doc) {
            // eslint-disable-next-line no-await-in-loop
            await AuthThrottle.create({
                key,
                count: 1,
                windowStartedAt: now,
                lockedUntil: maxFailures <= 1 ? new Date(now.getTime() + lockMs()) : null,
            });
            continue;
        }
        const lockExpired = !doc.lockedUntil || new Date(doc.lockedUntil).getTime() <= now.getTime();
        const windowElapsed = now.getTime() - new Date(doc.windowStartedAt).getTime() > lockMs();
        if (lockExpired && windowElapsed) {
            doc.count = 0;
            doc.windowStartedAt = now;
            doc.lockedUntil = null;
        }
        doc.count += 1;
        if (doc.count >= maxFailures) {
            doc.lockedUntil = new Date(now.getTime() + lockMs());
        }
        // eslint-disable-next-line no-await-in-loop
        await doc.save();
    }
};

/** The standard entry pair for a credential failure: the account
 *  key locks at maxFailures, the shared IP key at ipMaxFailures. */
const lockoutEntries = (accountKey, ipKey) => [
    { key: accountKey, limit: AUTH_THROTTLE.maxFailures },
    { key: ipKey, limit: AUTH_THROTTLE.ipMaxFailures },
];

/** A success wipes the counters for the account + IP pair. */
const clearThrottle = async (keys) => {
    await AuthThrottle.deleteMany({ key: { $in: keys } });
};

/** Current request count for the forgot-password throttle (the max
 *  across the given keys, inside a live window). */
const throttleCount = async (keys) => {
    const now = Date.now();
    const docs = await AuthThrottle.find({ key: { $in: keys } }).lean();
    let count = 0;
    for (const doc of docs) {
        const windowElapsed = now - new Date(doc.windowStartedAt).getTime() > lockMs();
        if (!windowElapsed) count = Math.max(count, doc.count || 0);
    }
    return count;
};

module.exports = {
    AUTH_THROTTLE,
    getClientIp,
    throttleLock,
    recordThrottleFailure,
    lockoutEntries,
    clearThrottle,
    throttleCount,
};
