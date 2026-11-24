const User = require('../models/User');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendPasswordResetEmail } = require('../utils/emailTemplates');
const { getEffectivePermissions } = require('../utils/permissions');
const { NOT_DELETED } = require('../utils/softDelete');
const { getJwtSecret, getJwtSignSecret } = require('../utils/credentials');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

// Accept codes from the neighbouring 30-second steps as well, to absorb
// clock drift between the server and the admin's phone.
authenticator.options = { window: 1 };

const ISSUER = 'Ecom Store Admin';

// Generates a fresh TOTP secret: 20 random bytes, base32-encoded
// (RFC 4648 alphabet) — the format authenticator apps expect.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const generateTotpKey = () => {
    const bytes = require('crypto').randomBytes(20);
    let secret = '';
    let buffer = 0;
    let bits = 0;
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            secret += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        secret += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
    }
    return secret;
};

// Generate JWT — signed with the secret from the credentials store
// (Settings → API / Integrations; environment value is the fallback and
// the seed, so sessions minted before the move keep verifying). Signing
// goes through the gated resolver: when the Store Session (JWT)
// service is toggled OFF in the panel, getJwtSignSecret throws
// JWT_SIGNING_DISABLED and no new tokens are issued (verification of
// existing tokens is never gated — see utils/credentials.js).
const generateToken = async (id) => {
    return jwt.sign({ id }, await getJwtSignSecret(), {
        expiresIn: '30d',
    });
};

// Short-lived, single-purpose tokens handed back by login when the
// account still owes a second step. They are NOT session tokens: each
// carries a purpose claim that only its own endpoint accepts, and a
// real session token is minted only after that step completes.
//  - 'two-factor-login': the account has 2FA on — the TOTP code is owed.
//  - 'two-factor-enroll': the account has NO 2FA yet — enrolment is
//    mandatory for every staff account (Ahsan's order), so the code
//    confirmation that turns 2FA on is owed instead.
const generateTwoFactorTempToken = async (id) => {
    return jwt.sign({ id, purpose: 'two-factor-login' }, await getJwtSignSecret(), {
        expiresIn: '5m',
    });
};

const generateTwoFactorEnrollToken = async (id) => {
    return jwt.sign({ id, purpose: 'two-factor-enroll' }, await getJwtSignSecret(), {
        expiresIn: '5m',
    });
};

// Verifies a login temp token and returns its payload, or null when it
// is missing, expired, or minted for a different step. Both 2FA login
// steps share this so a token can never be replayed across steps.
const decodeLoginTempToken = async (tempToken, purpose) => {
    if (!tempToken) return null;
    try {
        const decoded = jwt.verify(tempToken, await getJwtSecret());
        return decoded.purpose === purpose ? decoded : null;
    } catch {
        return null;
    }
};

// The payload a completed sign-in returns (shared by plain login and the
// second step of a 2FA login, so both paths answer identically).
const sessionPayload = async (user) => ({
    _id: user._id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    // The account's REAL role (e.g. "Super Admin"). This used to hardcode
    // the string 'admin', which the panel then displayed as the signed-in
    // user's role everywhere.
    role: user.role,
    avatar: user.avatar,
    // The role's effective permission matrix, so the panel can hide what
    // this user may not use. The backend re-checks every call anyway —
    // this is for display only.
    permissions: await getEffectivePermissions(user.role),
    token: await generateToken(user._id),
});

// Panel-access rules shared by login and the 2FA second step. Returns an
// error response object, or null when the account may sign in.
const panelAccessError = (user) => {
    if (user.role === 'Customer') {
        return {
            status: 403,
            message: 'This account is a customer account — it cannot sign in to the admin panel.',
        };
    }
    if (user.isActive === false) {
        return {
            status: 403,
            message: 'This account has been deactivated. Contact the store administrator.',
        };
    }
    return null;
};

// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // ADMIN_EMAIL / ADMIN_PASSWORD are SEED-ONLY: they create the
        // first Super Admin account when no account with that email
        // exists yet. From the first successful seed on, the account's
        // password is the bcrypt hash stored on the User document —
        // changing these env vars afterwards changes nothing, and the
        // password is managed from the panel (profile / password
        // settings), never from here.
        const envAdminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
        // The built-in default satisfies the account schema's own
        // 6-character password minimum — the previous default
        // ('admin', 5 chars) made the seed save fail validation, so a
        // first run on a fresh database with default configuration
        // answered this login with a 500 and could NEVER create the
        // first admin.
        const envAdminPass = process.env.ADMIN_PASSWORD || 'admin123';

        // Check for admin user in DB first
        let adminUser = await User.findOne({ email, ...NOT_DELETED }).select('+password');

        // Auto-seed admin user from .env if it doesn't exist and credentials match the .env request
        if (!adminUser && email === envAdminEmail && password === envAdminPass) {
            if (envAdminPass.length < 6) {
                // A configured seed password the account schema itself
                // would refuse: fail closed with an operator-actionable
                // message instead of the raw validation dump.
                console.error(
                    'ADMIN_PASSWORD is shorter than the 6-character minimum — the first Super Admin cannot be seeded. Set a longer ADMIN_PASSWORD.'
                );
                return res.status(500).json({
                    message:
                        'The server is misconfigured: the seeded admin password is too short. Set a longer ADMIN_PASSWORD and try again.',
                });
            }
            if (!process.env.ADMIN_PASSWORD) {
                // First run with the built-in default password: the
                // account works (and mandatory 2FA enrolment applies
                // at this very login), but the operator must be told
                // loudly to set ADMIN_PASSWORD / change the password.
                console.warn(
                    'WARNING: the first Super Admin was seeded with the DEFAULT password. ' +
                    'Change the account password in the panel immediately and set ADMIN_PASSWORD in the environment.'
                );
            }
            adminUser = new User({
                firstName: 'Super',
                lastName: 'Admin',
                username: 'admin',
                email: envAdminEmail,
                password: envAdminPass,
                role: 'Super Admin',
                isVerified: true
            });
            await adminUser.save();
        }

        if (adminUser) {
            const isMatch = await adminUser.comparePassword(password);
            if (isMatch) {
                // This endpoint signs people into the ADMIN panel. Customer
                // accounts (storefront sign-ups) must not pass here, and a
                // deactivated account must not pass either.
                const accessError = panelAccessError(adminUser);
                if (accessError) {
                    return res.status(accessError.status).json({ message: accessError.message });
                }

                // Two-factor on: the password alone earns only a 5-minute
                // temp token — the session token waits for the TOTP code.
                if (adminUser.twoFactorEnabled) {
                    return res.json({
                        twoFactorRequired: true,
                        tempToken: await generateTwoFactorTempToken(adminUser._id),
                    });
                }

                // Two-factor NOT set up yet: enrolment is mandatory for
                // every staff account (Ahsan's order — "har admin ka 2F
                // auth bhi ho"), so the password alone earns only an
                // enrolment temp token. The session token waits until
                // the account enrols and confirms a live code in this
                // same sign-in (see the enroll endpoints below). There
                // is no skip: a staff account without 2FA never gets a
                // session from this endpoint.
                return res.json({
                    twoFactorSetupRequired: true,
                    tempToken: await generateTwoFactorEnrollToken(adminUser._id),
                });
            }
        }

        res.status(401).json({ message: 'Invalid email or password' });
    } catch (error) {
        if (error.code === 'JWT_SIGNING_DISABLED') {
            return res.status(403).json({ message: error.message });
        }
        if (error.code === 11000) {
            // A seed colliding with an existing unique value (e.g.
            // the username "admin" already taken) — a clean sentence,
            // never the raw MongoDB duplicate-key text.
            return res.status(400).json({
                message: 'An account already exists with one of the seeded values — sign in with that account instead.',
            });
        }
        res.status(500).json({ message: error.message });
    }
};

// @desc    Second step of a 2FA login — exchange temp token + TOTP code
//          for the real session token.
// @route   POST /api/auth/2fa/verify
// @access  Public (the temp token is the credential)
const verifyTwoFactorLogin = async (req, res) => {
    try {
        const { tempToken, code } = req.body || {};
        if (!tempToken || !code) {
            return res.status(400).json({ message: 'A verification code is required.' });
        }

        const decoded = await decodeLoginTempToken(tempToken, 'two-factor-login');
        if (!decoded) {
            return res.status(401).json({ message: 'This sign-in attempt expired — sign in again.' });
        }

        const user = await User.findOne({ _id: decoded.id, ...NOT_DELETED }).select('+twoFactorSecret');
        if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
            return res.status(400).json({ message: 'Two-factor authentication is not enabled for this account.' });
        }

        const accessError = panelAccessError(user);
        if (accessError) {
            return res.status(accessError.status).json({ message: accessError.message });
        }

        const valid = authenticator.check(String(code).trim(), user.twoFactorSecret);
        if (!valid) {
            return res.status(400).json({ message: 'Invalid verification code — check your authenticator app and try again.' });
        }

        res.json(await sessionPayload(user));
    } catch (error) {
        if (error.code === 'JWT_SIGNING_DISABLED') {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message });
    }
};

// @desc    Login-time enrolment, step 1 — issue a TOTP secret + QR for
//          an account that signed in with its password but has no 2FA
//          yet. The enrolment temp token from /login is the credential;
//          NO session exists yet. Same handshake as the in-panel setup:
//          the secret is stored but NOT enabled — only a live code in
//          step 2 turns it on, so a password alone can never silently
//          enrol an authenticator the account owner didn't confirm.
// @route   POST /api/auth/2fa/enroll-setup
// @access  Public (the enrolment temp token is the credential)
const enrollSetupTwoFactor = async (req, res) => {
    try {
        const { tempToken } = req.body || {};
        const decoded = await decodeLoginTempToken(tempToken, 'two-factor-enroll');
        if (!decoded) {
            return res.status(401).json({ message: 'This sign-in attempt expired — sign in again.' });
        }

        const user = await User.findOne({ _id: decoded.id, ...NOT_DELETED }).select('+twoFactorSecret');
        if (!user) {
            return res.status(400).json({ message: 'Two-factor authentication is not available for this account.' });
        }

        const accessError = panelAccessError(user);
        if (accessError) {
            return res.status(accessError.status).json({ message: accessError.message });
        }
        if (user.twoFactorEnabled) {
            return res.status(400).json({ message: 'Two-factor authentication is already enabled for this account. Sign in and enter your code.' });
        }

        // A fresh secret every time this step runs: an abandoned
        // enrolment's unconfirmed secret is simply overwritten, never
        // left half-active.
        const secret = generateTotpKey();
        user.twoFactorSecret = secret;
        await user.save();

        const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
        const qrCode = await QRCode.toDataURL(otpauthUrl);

        res.json({ secret, otpauthUrl, qrCode, enabled: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Login-time enrolment, step 2 — confirm a live code from the
//          authenticator just enrolled: 2FA turns ON for the account
//          and the real session token is minted (this completes the
//          sign-in — enrolment is asked only here, at login).
// @route   POST /api/auth/2fa/enroll-confirm
// @access  Public (the enrolment temp token is the credential)
const enrollConfirmTwoFactor = async (req, res) => {
    try {
        const { tempToken, code } = req.body || {};
        if (!code) {
            return res.status(400).json({ message: 'A verification code is required.' });
        }

        const decoded = await decodeLoginTempToken(tempToken, 'two-factor-enroll');
        if (!decoded) {
            return res.status(401).json({ message: 'This sign-in attempt expired — sign in again.' });
        }

        const user = await User.findOne({ _id: decoded.id, ...NOT_DELETED }).select('+twoFactorSecret');
        if (!user) {
            return res.status(400).json({ message: 'Two-factor authentication is not available for this account.' });
        }

        const accessError = panelAccessError(user);
        if (accessError) {
            return res.status(accessError.status).json({ message: accessError.message });
        }
        if (user.twoFactorEnabled) {
            return res.status(400).json({ message: 'Two-factor authentication is already enabled for this account. Sign in and enter your code.' });
        }
        if (!user.twoFactorSecret) {
            return res.status(400).json({ message: 'Start the setup first, then confirm with a code.' });
        }

        const valid = authenticator.check(String(code).trim(), user.twoFactorSecret);
        if (!valid) {
            return res.status(400).json({ message: 'Invalid verification code — check your authenticator app and try again.' });
        }

        user.twoFactorEnabled = true;
        await user.save();

        res.json(await sessionPayload(user));
    } catch (error) {
        if (error.code === 'JWT_SIGNING_DISABLED') {
            return res.status(403).json({ message: error.message });
        }
        res.status(500).json({ message: error.message });
    }
};

// @desc    Current 2FA state for the signed-in user.
// @route   GET /api/auth/2fa/status
// @access  Private
const twoFactorStatus = async (req, res) => {
    res.json({ enabled: Boolean(req.user.twoFactorEnabled) });
};

// @desc    Start enrolment: generate a fresh TOTP secret and return it
//          with a QR code. NOT enabled yet — enabling needs a valid code,
//          so a stolen session alone cannot silently turn 2FA on.
// @route   POST /api/auth/2fa/setup
// @access  Private
const setupTwoFactor = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('+twoFactorSecret');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.twoFactorEnabled) {
            return res.status(400).json({ message: 'Two-factor authentication is already enabled. Disable it first to enrol a new authenticator.' });
        }

        const secret = generateTotpKey();
        user.twoFactorSecret = secret;
        await user.save();

        const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
        const qrCode = await QRCode.toDataURL(otpauthUrl);

        res.json({ secret, otpauthUrl, qrCode, enabled: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Confirm enrolment with a code from the authenticator app.
// @route   POST /api/auth/2fa/enable
// @access  Private
const enableTwoFactor = async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ message: 'A verification code is required.' });
        }

        const user = await User.findById(req.user._id).select('+twoFactorSecret');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.twoFactorEnabled) {
            return res.status(400).json({ message: 'Two-factor authentication is already enabled.' });
        }
        if (!user.twoFactorSecret) {
            return res.status(400).json({ message: 'Start the setup first, then confirm with a code.' });
        }

        const valid = authenticator.check(String(code).trim(), user.twoFactorSecret);
        if (!valid) {
            return res.status(400).json({ message: 'Invalid verification code — check your authenticator app and try again.' });
        }

        user.twoFactorEnabled = true;
        await user.save();
        res.json({ enabled: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Turn 2FA off — requires a current code, so a hijacked session
//          cannot strip the second factor on its own.
// @route   POST /api/auth/2fa/disable
// @access  Private
const disableTwoFactor = async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ message: 'A verification code is required.' });
        }

        const user = await User.findById(req.user._id).select('+twoFactorSecret');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.twoFactorEnabled || !user.twoFactorSecret) {
            return res.status(400).json({ message: 'Two-factor authentication is not enabled.' });
        }

        const valid = authenticator.check(String(code).trim(), user.twoFactorSecret);
        if (!valid) {
            return res.status(400).json({ message: 'Invalid verification code — check your authenticator app and try again.' });
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        await user.save();
        res.json({ enabled: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ── Password reset ──────────────────────────────────────────────────
// The reset token is 32 random bytes, hex-encoded for the link; only
// its SHA-256 hash is stored on the user, with a 1-hour expiry. A new
// request overwrites the old token; a successful reset clears both
// fields, so every link is single-use.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const hashResetToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const adminAppUrl = () =>
    (process.env.ADMIN_URL || 'https://ecommerce-admin-teal.vercel.app').replace(/\/+$/, '');

// @desc    Request a password reset email (admin "Forgot password")
// @route   POST /api/auth/forgot-password
// @access  Public — ALWAYS answers with the same generic message, so
//          the endpoint cannot be used to enumerate accounts.
const forgotPassword = async (req, res) => {
    const generic = {
        message: 'If an account with that email exists, a password reset link has been sent.',
    };
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (email) {
            const user = await User.findOne({ email, ...NOT_DELETED });
            // Panel accounts only — customer accounts never sign in to
            // the admin, so they get no reset email from here either.
            if (user && user.role !== 'Customer' && user.isActive !== false) {
                const token = crypto.randomBytes(32).toString('hex');
                user.passwordResetTokenHash = hashResetToken(token);
                user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
                await user.save();
                // Fail-soft: the helper logs and swallows a missing /
                // failing email service; the response stays generic.
                await sendPasswordResetEmail({
                    to: user.email,
                    resetUrl: `${adminAppUrl()}/reset-password?token=${token}`,
                });
            }
        }
        res.json(generic);
    } catch (error) {
        // Even a server error must not leak whether the account exists.
        console.error(`[auth] forgot-password failed: ${error.message}`);
        res.json(generic);
    }
};

// @desc    Complete a password reset with the emailed token
// @route   POST /api/auth/reset-password
// @access  Public (the token is the credential)
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body || {};
        if (!token || !password) {
            return res.status(400).json({ message: 'A reset token and a new password are required.' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ message: 'The new password must be at least 6 characters.' });
        }

        const user = await User.findOne({
            passwordResetTokenHash: hashResetToken(token),
            passwordResetExpires: { $gt: new Date() },
            ...NOT_DELETED,
        }).select('+passwordResetTokenHash');
        if (!user) {
            return res.status(400).json({
                message: 'This reset link is invalid or has expired. Request a new one.',
            });
        }
        if (user.role === 'Customer' || user.isActive === false) {
            return res.status(400).json({
                message: 'This reset link is invalid or has expired. Request a new one.',
            });
        }

        // The pre-save hook bcrypt-hashes the new password; clearing the
        // token fields makes the link single-use.
        user.password = String(password);
        user.passwordResetTokenHash = null;
        user.passwordResetExpires = null;
        await user.save();

        res.json({ message: 'Your password has been reset. You can now sign in with your new password.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    loginAdmin,
    forgotPassword,
    resetPassword,
    verifyTwoFactorLogin,
    enrollSetupTwoFactor,
    enrollConfirmTwoFactor,
    twoFactorStatus,
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor
};
