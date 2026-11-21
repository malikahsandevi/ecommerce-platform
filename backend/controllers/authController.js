const User = require('../models/User');
const jwt = require('jsonwebtoken');
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

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// Short-lived, single-purpose token handed back by login when the account
// has 2FA on. It is NOT a session token: it carries a purpose claim that
// only the 2FA verify endpoint accepts, and a real session token is
// minted only after the TOTP code checks out.
const generateTwoFactorTempToken = (id) => {
    return jwt.sign({ id, purpose: 'two-factor-login' }, process.env.JWT_SECRET, {
        expiresIn: '5m',
    });
};

// The payload a completed sign-in returns (shared by plain login and the
// second step of a 2FA login, so both paths answer identically).
const sessionPayload = (user) => ({
    _id: user._id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    // The account's REAL role (e.g. "Super Admin"). This used to hardcode
    // the string 'admin', which the panel then displayed as the signed-in
    // user's role everywhere.
    role: user.role,
    avatar: user.avatar,
    token: generateToken(user._id),
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

        const envAdminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
        const envAdminPass = process.env.ADMIN_PASSWORD || 'admin';

        // Check for admin user in DB first
        let adminUser = await User.findOne({ email }).select('+password');

        // Auto-seed admin user from .env if it doesn't exist and credentials match the .env request
        if (!adminUser && email === envAdminEmail && password === envAdminPass) {
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
                        tempToken: generateTwoFactorTempToken(adminUser._id),
                    });
                }

                return res.json(sessionPayload(adminUser));
            }
        }

        res.status(401).json({ message: 'Invalid email or password' });
    } catch (error) {
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

        let decoded;
        try {
            decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ message: 'This sign-in attempt expired — sign in again.' });
        }
        if (decoded.purpose !== 'two-factor-login') {
            return res.status(401).json({ message: 'This sign-in attempt expired — sign in again.' });
        }

        const user = await User.findById(decoded.id).select('+twoFactorSecret');
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

        res.json(sessionPayload(user));
    } catch (error) {
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

module.exports = {
    loginAdmin,
    verifyTwoFactorLogin,
    twoFactorStatus,
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor
};
