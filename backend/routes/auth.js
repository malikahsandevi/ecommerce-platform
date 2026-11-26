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

// Enrolment management — all behind a completed sign-in.
router.get('/2fa/status', protect, twoFactorStatus);
router.post('/2fa/setup', protect, setupTwoFactor);
router.post('/2fa/enable', protect, enableTwoFactor);
router.post('/2fa/disable', protect, disableTwoFactor);
router.post('/2fa/recovery-codes', protect, regenerateRecoveryCodes);

module.exports = router;
