const { User } = require('../models');
const { sendError } = require('../utils/apiError');
const {
    isValidSettingsUnlock,
    passwordMatchesCaller,
} = require('../utils/settingsLock');

// ── Settings Lock enforcement (Ahsan's order) ───────────────────────
// Two gates, both server-side (the panel's lock screen / security
// modal are only the presentation):
//
//  1. ENTRY — the full Settings reads require a live unlock proof
//     (POST /api/settings/verify-password mints one after the caller
//     re-enters their own password). Without it the answer is a
//     distinct 403 SETTINGS_LOCKED, so no panel data leaks to a
//     merely-signed-in session. The shell bootstrap is deliberately
//     NOT behind this gate — the rest of the admin must keep painting
//     themed for locked sessions.
//  2. EVERY SAVE — each Settings write verifies the caller's own
//     password again, for that save only. The password rides in the
//     request body (`securityPassword`) for POST/PUT, or the
//     `x-settings-password` header for DELETE (no reliable body). It
//     is stripped from the body before any controller runs, never
//     stored, never logged. Missing/wrong → 403, NOTHING is written.
//     A 403 (never 401) is deliberate: the panel's HTTP layer treats
//     a 401 as a dead session and would sign the admin out.

const lockedResponse = (res) => res.status(403).json({
    code: 'SETTINGS_LOCKED',
    message: 'Settings is locked. Enter your password to continue.',
});

const saveCheckFailedResponse = (res) => res.status(403).json({
    code: 'SETTINGS_PASSWORD_REQUIRED',
    message: 'Security check failed — your password could not be verified, so nothing was saved. Enter your own account password to save changes in Settings.',
});

/** Entry gate for the full Settings reads. Sits behind `protect`,
 *  `requireStaff` and the Settings view permission, so a role without
 *  Settings view still gets the permission refusal, never this one. */
const requireSettingsUnlock = async (req, res, next) => {
    try {
        const token = req.headers['x-settings-unlock'];
        if (await isValidSettingsUnlock(token, req.user?._id)) return next();
        return lockedResponse(res);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

/** Pulls the save password out of the request and removes it from
 *  the body, so no controller, logger or error path downstream can
 *  ever see it. Header wins for DELETE-style calls without a body. */
const takeSavePassword = (req) => {
    let password;
    if (req.body && typeof req.body === 'object' && 'securityPassword' in req.body) {
        password = req.body.securityPassword;
        delete req.body.securityPassword;
    }
    if (typeof password !== 'string' || password.length === 0) {
        const header = req.headers['x-settings-password'];
        if (typeof header === 'string' && header.length > 0) password = header;
    }
    return password;
};

const verifySavePassword = async (req, res) => {
    const password = takeSavePassword(req);
    return passwordMatchesCaller(req, password);
};

/** Save gate for writes that are ALWAYS Settings saves (the settings
 *  document, integration entries, the permission matrix, roles). */
const requireSettingsSavePassword = async (req, res, next) => {
    try {
        if (await verifySavePassword(req, res)) return next();
        return saveCheckFailedResponse(res);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

// ── Users & Roles writes ────────────────────────────────────────────
// /api/users is shared: the Customers module manages customer records
// through the same endpoints the Settings → Users & Roles panel uses
// for staff accounts. The save gate therefore follows the split the
// route guards already draw — a write is gated when it administers a
// STAFF account (creating one, or changing/deleting an account whose
// stored role is not Customer, or promoting a record to a staff
// role). Ordinary customer-record writes from the Customers module
// keep working with no password, exactly as before.

const requireSavePasswordForUserCreate = async (req, res, next) => {
    try {
        const role = req.body?.role;
        const createsStaff = Boolean(role) && role !== 'Customer';
        if (!createsStaff) {
            takeSavePassword(req);
            return next();
        }
        if (await verifySavePassword(req, res)) return next();
        return saveCheckFailedResponse(res);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

const loadTargetRole = async (req) => {
    try {
        const target = await User.findById(req.params.id).select('role');
        return target?.role || null;
    } catch {
        return null;
    }
};

const requireSavePasswordForUserUpdate = async (req, res, next) => {
    try {
        const targetRole = await loadTargetRole(req);
        const setsStaffRole = Boolean(req.body?.role) && req.body.role !== 'Customer';
        const administersStaff = setsStaffRole || (targetRole !== null && targetRole !== 'Customer');
        if (!administersStaff) {
            takeSavePassword(req);
            return next();
        }
        if (await verifySavePassword(req, res)) return next();
        return saveCheckFailedResponse(res);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

const requireSavePasswordForUserDelete = async (req, res, next) => {
    try {
        const targetRole = await loadTargetRole(req);
        if (targetRole === null || targetRole === 'Customer') {
            takeSavePassword(req);
            return next();
        }
        if (await verifySavePassword(req, res)) return next();
        return saveCheckFailedResponse(res);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

module.exports = {
    requireSettingsUnlock,
    requireSettingsSavePassword,
    requireSavePasswordForUserCreate,
    requireSavePasswordForUserUpdate,
    requireSavePasswordForUserDelete,
};
