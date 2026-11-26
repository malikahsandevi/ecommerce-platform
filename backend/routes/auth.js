const express = require('express');
const router = express.Router();
const {
    loginAdmin,
    forgotPassword,
    resetPassword,
    verifyTwoFactorLogin,
    enrollSetupTwoFactor,
    enrollConfirmTwoFactor,
    twoFactorStatus,
    setupTwoFactor,
    enableTwoFactor,
    disableTwoFactor,
    regenerateRecoveryCodes
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');

router.post('/login', loginAdmin);

// Password reset — request the emailed link, then complete the reset
// with the token from it. Both public: the generic response (request)
// and the single-use token (completion) are the credentials.
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Two-factor login second step — the temp token from /login is the
// credential here, so no Bearer token is involved yet.
router.post('/2fa/verify', verifyTwoFactorLogin);

// Mandatory login-time enrolment for staff accounts without 2FA yet —
// same idea: the enrolment temp token from /login is the credential,
// and the session is minted only by the confirm step.
router.post('/2fa/enroll-setup', enrollSetupTwoFactor);
router.post('/2fa/enroll-confirm', enrollConfirmTwoFactor);

// Enrolment management — all behind a completed sign-in. STAFF
// sessions only (Claude Section 9 follow-up): panel 2FA belongs to
// panel accounts, and a storefront customer token — same JWT shape,
// refused at panel login — must not reach even these self-scoped
// endpoints.
router.get('/2fa/status', protect, requireStaff, twoFactorStatus);
router.post('/2fa/setup', protect, requireStaff, setupTwoFactor);
router.post('/2fa/enable', protect, requireStaff, enableTwoFactor);
router.post('/2fa/disable', protect, requireStaff, disableTwoFactor);
router.post('/2fa/recovery-codes', protect, requireStaff, regenerateRecoveryCodes);

module.exports = router;
