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
    trackOrder,
    submitReview,
    requireCustomer,
    registerCustomer,
    loginCustomer,
    getMe,
    updateMe,
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
// guest/signed-in checkout (through the admin's own createOrder),
// account-free order tracking, and review submission (moderated).
router.get('/shipping-options', getShippingOptions);
router.post('/quote', quoteCart);
router.post('/orders', placeOrder);
router.post('/track', trackOrder);
router.post('/reviews', submitReview);

// Customer accounts: register + login (no staff 2FA — that flow is
// the admin panel's), then the token-guarded account area. `protect`
// verifies the shared session JWT; requireCustomer scopes it to
// Customer accounts.
router.post('/auth/register', registerCustomer);
router.post('/auth/login', loginCustomer);
router.get('/me', protect, requireCustomer, getMe);
router.put('/me', protect, requireCustomer, updateMe);
router.put('/me/cart', protect, requireCustomer, updateCart);
router.put('/me/wishlist', protect, requireCustomer, updateWishlist);
router.get('/me/orders', protect, requireCustomer, getMyOrders);
router.get('/me/orders/:id', protect, requireCustomer, getMyOrder);

module.exports = router;
