const express = require('express');
const Setting = require('../models/Setting');
const { paletteById, resolvePaletteId } = require('../config/palettes');
const { protect } = require('../middleware/auth');
const { sendError } = require('../utils/apiError');
const {
    getStoreConfig,
    getCatalogProducts,
    getCatalogProductBySlug,
    getCatalogCategories,
    getProductReviews,
    getShippingOptions,
    quoteCart,
    placeOrder,
    createStripeSession,
    createStripePaymentIntent,
    trackOrder,
    trackSignInGate,
    reviewSignInGate,
    submitReview,
    requireCustomer,
    registerCustomer,
    loginCustomer,
    forgotCustomerPassword,
    resetCustomerPassword,
    getMe,
    updateMe,
    changeMyPassword,
    updateCart,
    updateWishlist,
    getMyOrders,
    getMyOrder,
} = require('../controllers/storefrontController');

const router = express.Router();

// PUBLIC (no auth): the customer storefront reads its theme palette
// from here. ONE palette colours the storefront AND the admin panel
// together (Settings → Appearance → Theme Colors), so this returns
// the same palette the panel resolved: its id and its four role
// colors. Resolution: the kept palette id wins; the legacy
// storefront/admin hexes migrate by primary-color match; otherwise
// the default palette. Nothing else about the settings document is
// exposed — palette ids and brand colors are not sensitive.
router.get('/theme', async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 }).select('appearance').lean();
        const palette = paletteById(resolvePaletteId(settings?.appearance));
        res.json({ palette: palette.id, colors: { ...palette.dark }, colorsLight: { ...palette.light } });
    } catch (error) {
        sendError(res, error, 500);
    }
});

// PUBLIC: the store's public identity + formatting (name, logo,
// currency, timezone, contact) and the enabled payment method names.
// Allowlisted in the controller — nothing else from Settings leaks.
router.get('/config', getStoreConfig);

// PUBLIC catalog: published products only, slug URLs, approved
// reviews only. The raw /api/products + /api/reviews payloads are
// the admin's (every status); these are the shopper's.
router.get('/products', getCatalogProducts);
router.get('/products/:slug', getCatalogProductBySlug);
router.get('/products/:id/reviews', getProductReviews);
router.get('/categories', getCatalogCategories);

// PUBLIC commerce: delivery choices, a server-priced cart quote,
// and guest/signed-in checkout (through the admin's own
// createOrder). Order tracking and review submission are NOT
// public — both are account-only and guarded below.
router.get('/shipping-options', getShippingOptions);
router.post('/quote', quoteCart);
router.post('/orders', placeOrder);
// Online card payment: opens a Stripe Checkout session for a placed
// order whose method is the Stripe entry (amount/identity server-side
// only; the webhook in routes/payments.js settles it to Paid).
router.post('/orders/:id/stripe-session', createStripeSession);
// Embedded card payment at checkout (the session route above now
// serves the pay-later Pay actions on the account/track pages).
router.post('/orders/:id/stripe-intent', createStripePaymentIntent);
// Order tracking is account-only: the gate gives a guest the human
// refusal, then the standard customer guard stack applies and the
// controller checks the order actually belongs to the caller.
router.post('/track', trackSignInGate, protect, requireCustomer, trackOrder);
// Reviews are account-only: the gate gives a guest the human
// refusal, then the standard customer guard stack applies and
// the review is attributed to the signed-in account.
router.post('/reviews', reviewSignInGate, protect, requireCustomer, submitReview);

// Customer accounts: register + login (no staff 2FA — that flow is
// the admin panel's), then the token-guarded account area. `protect`
// verifies the shared session JWT; requireCustomer scopes it to
// Customer accounts.
router.post('/auth/register', registerCustomer);
router.post('/auth/login', loginCustomer);
router.post('/auth/forgot-password', forgotCustomerPassword);
router.post('/auth/reset-password', resetCustomerPassword);
router.get('/me', protect, requireCustomer, getMe);
router.put('/me', protect, requireCustomer, updateMe);
router.put('/me/password', protect, requireCustomer, changeMyPassword);
router.put('/me/cart', protect, requireCustomer, updateCart);
router.put('/me/wishlist', protect, requireCustomer, updateWishlist);
router.get('/me/orders', protect, requireCustomer, getMyOrders);
router.get('/me/orders/:id', protect, requireCustomer, getMyOrder);

module.exports = router;
