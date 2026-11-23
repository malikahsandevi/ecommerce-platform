const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret, getJwtSignSecret } = require('./credentials');

// ── Settings Lock primitives (Ahsan's order) ────────────────────────
// Entering Settings requires the signed-in admin to RE-VERIFY with
// their own account password, and EVERY save inside Settings carries
// a fresh password verification for that save. Both halves are built
// on the codebase's existing idioms:
//
//  • The unlock proof is a short-lived, single-purpose JWT — the
//    exact pattern the 2FA login temp token already uses (a `purpose`
//    claim only its own consumers accept, signed/verified through the
//    credentials store's JWT resolvers). 15 minutes, bound to the
//    account that verified.
//  • Password verification loads the CALLER's own document with the
//    hash selected and runs the model's comparePassword — the same
//    check the Edit User password trio performs.
//
// Password values and hashes are never logged or returned anywhere in
// this flow; verification answers are pass/fail only.

const SETTINGS_UNLOCK_TTL_SECONDS = 15 * 60;

/** Mints the unlock proof for a verified caller. Signing goes
 *  through the gated resolver, exactly like session tokens — if the
 *  Store Session (JWT) service is toggled OFF, this throws
 *  JWT_SIGNING_DISABLED just as login does. */
const issueSettingsUnlock = async (userId) => jwt.sign(
    { id: userId, purpose: 'settings-unlock' },
    await getJwtSignSecret(),
    { expiresIn: SETTINGS_UNLOCK_TTL_SECONDS },
);

/** True when `token` is a live settings-unlock proof minted for THIS
 *  caller. Verification is never gated (mirrors `protect`): an
 *  expired, foreign-purpose or other-account token simply fails. */
const isValidSettingsUnlock = async (token, userId) => {
    if (!token || !userId) return false;
    try {
        const decoded = jwt.verify(token, await getJwtSecret());
        return (
            decoded.purpose === 'settings-unlock' &&
            String(decoded.id) === String(userId)
        );
    } catch {
        return false;
    }
};

/** Verifies a supplied password against the CALLER'S OWN stored
 *  hash. A missing/blank password never passes. */
const passwordMatchesCaller = async (req, password) => {
    if (!req?.user?._id) return false;
    if (typeof password !== 'string' || password.length === 0) return false;
    const caller = await User.findById(req.user._id).select('+password');
    if (!caller) return false;
    return caller.comparePassword(password);
};

module.exports = {
    SETTINGS_UNLOCK_TTL_SECONDS,
    issueSettingsUnlock,
    isValidSettingsUnlock,
    passwordMatchesCaller,
};
