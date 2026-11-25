const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, Product, Category, Order, Review, Setting } = require('../models');
const { createOrder } = require('./orderController');
const { createReview } = require('./reviewController');
const { NOT_DELETED } = require('../utils/softDelete');
const { sendError, translateError } = require('../utils/apiError');
const { getJwtSecret, getJwtSignSecret } = require('../utils/credentials');
const { resolveCoupon } = require('../utils/coupon');
const { getShippingConfig, computeShippingCharge, shipmentBlock } = require('../utils/shipping');
const { paletteById, resolvePaletteId } = require('../config/palettes');
const { resolveStripeCheckout, isStripePaymentMethod, createCheckoutSession } = require('../utils/stripePay');

// PUBLIC storefront endpoints. These never re-implement business
// rules: order placement goes through the SAME createOrder the admin
// panel uses (server-side pricing, stock reservation, coupon
// resolver, shipping calculator, order numbers, activity log), and
// review submission goes through the SAME createReview. Prices and
// totals are always computed from the Product documents — the client
// only ever sends product ids and quantities, never prices.
//
// Every catch answers through sendError (utils/apiError): raw system
// text never leaves this API.

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

// ── Catalog shaping ────────────────────────────────────────────────
// The storefront speaks a trimmed product contract: everything a
// shopper may see, and nothing else — the internal costPrice, the
// admin bookkeeping fields and the legacy gallery key names never
// leave through here (the raw /api/products payload is the admin's).
const shapeCatalogProduct = (product) => {
    if (!product) return product;
    const obj = typeof product.toObject === 'function' ? product.toObject() : { ...product };
    const raw = Array.isArray(obj.images) ? obj.images : [];
    const entries = raw
        .filter((entry) => entry && entry.url)
        .map((entry) => ({ entry, wantsMain: Boolean(entry.isMain ?? entry.isPrimary) }));
    const mainIndex = Math.max(0, entries.findIndex((e) => e.wantsMain));
    const ordered = entries.length
        ? [entries[mainIndex], ...entries.filter((_, i) => i !== mainIndex)]
        : [];
    const images = ordered.map((e, i) => ({
        url: e.entry.url,
        alt: e.entry.alt ?? e.entry.altText ?? '',
        isMain: i === 0,
    }));
    const category = obj.category && typeof obj.category === 'object'
        ? { _id: obj.category._id, name: obj.category.name, slug: obj.category.slug }
        : null;
    const brand = obj.brand && typeof obj.brand === 'object'
        ? { _id: obj.brand._id, name: obj.brand.name, slug: obj.brand.slug || '' }
        : null;
    return {
        _id: obj._id,
        name: obj.name,
        slug: obj.slug,
        sku: obj.sku,
        description: obj.description || '',
        price: obj.price,
        comparePrice: obj.comparePrice ?? null,
        stock: obj.stock,
        image: images[0]?.url || (typeof obj.image === 'string' ? obj.image : ''),
        images,
        category,
        brand,
        variants: Array.isArray(obj.variants) ? obj.variants : [],
        attributes: Array.isArray(obj.attributes) ? obj.attributes : [],
        tags: Array.isArray(obj.tags) ? obj.tags : [],
        averageRating: obj.averageRating || 0,
        reviewCount: obj.reviewCount || 0,
        metaTitle: obj.metaTitle || '',
        metaDescription: obj.metaDescription || '',
        createdAt: obj.createdAt,
    };
};

const PUBLISHED = { status: 'published', ...NOT_DELETED };

// ── Public store configuration ─────────────────────────────────────
// ONLY the public-safe general settings: the store's display identity
// and how its money is formatted. Nothing else from the settings
// document (credentials, integrations, payment secrets) is exposed.
// @route   GET /api/storefront/config
// @access  Public
// ── Storefront appearance ──────────────────────────────────────────
// The theme the ADMIN keeps (Settings → Appearance): ONE palette
// colours the admin panel and this storefront together. The public
// config serves the resolved palette id, the resolved mode and the
// palette's own colour values (from backend/config/palettes.js — the
// single source the admin mirrors), so the storefront never keeps a
// colour copy that can drift. Mode resolution mirrors the admin's:
// the universal mode field wins, then the legacy theme field
// (Dark/Light), else "system" (the client picks via its OS setting,
// using colorsDark/colorsLight below).
const resolveStorefrontAppearance = (appearance) => {
    const palette = paletteById(resolvePaletteId(appearance));
    let mode = 'system';
    if (appearance && (appearance.mode === 'dark' || appearance.mode === 'light')) {
        mode = appearance.mode;
    } else if (appearance && appearance.theme === 'Dark') {
        mode = 'dark';
    } else if (appearance && appearance.theme === 'Light') {
        mode = 'light';
    }
    return {
        palette: palette.id,
        mode,
        colors: { ...(mode === 'light' ? palette.light : palette.dark) },
        colorsDark: { ...palette.dark },
        colorsLight: { ...palette.light },
    };
};

const getStoreConfig = async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 }).select('general paymentMethods appearance').lean();
        const general = settings?.general || {};
        // Resolved ONCE: can the "Stripe" method actually take a card
        // right now (active Stripe entry + secret key in Settings →
        // Payments)? Drives both the boolean below and the auto-offered
        // method — no keys or entry details ever leave the backend.
        const stripeCheckout = await resolveStripeCheckout();
        const paymentMethods = (settings?.paymentMethods || [])
            .filter((method) => method && method.enabled !== false && method.name)
            .map((method) => ({ name: method.name, description: method.description || '' }));
        // Cash on Delivery is the system's built-in method — the
        // order flow, the COD auto-paid-on-delivery automation and
        // the checkout copy all assume it exists — so it is ALWAYS
        // offered: appended when the stored list doesn't already
        // carry it (a stored entry is served as-is, never
        // duplicated), and ahead of the auto-offered Stripe method
        // below so it stays the checkout's default selection.
        if (!paymentMethods.some((method) => String(method.name).trim().toLowerCase() === 'cash on delivery')) {
            paymentMethods.push({ name: 'Cash on Delivery', description: '' });
        }
        // The legacy paymentMethods array is no longer editable in the
        // admin (the services system replaced it), so a configured
        // Stripe gateway offers its method itself — appended only when
        // the stored list doesn't already carry one under that name.
        if (stripeCheckout && !paymentMethods.some((method) => String(method.name).trim().toLowerCase() === 'stripe')) {
            paymentMethods.push({ name: 'Stripe', description: '' });
        }
        res.json({
            appearance: resolveStorefrontAppearance(settings?.appearance),
            storeName: general.storeName || '',
            tagline: general.storeTagline || '',
            logo: general.logo || '',
            favicon: general.favicon || '',
            currency: general.currency || 'USD',
            timeZone: general.timeZone || 'Asia/Karachi',
            contactEmail: general.storeEmail || '',
            phone: general.phone || '',
            paymentMethods,
            stripePayAvailable: stripeCheckout !== null,
        });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// ── Catalog ────────────────────────────────────────────────────────
// @route   GET /api/storefront/products
// @access  Public — published products only (drafts/archived/trashed
//          never reach a shopper), with search / category / price /
//          sort / pagination for the Shop page.
const getCatalogProducts = async (req, res) => {
    try {
        const filter = { ...PUBLISHED };
        const { category, search, minPrice, maxPrice } = req.query;

        if (category) {
            const cat = await Category.findOne({
                $or: [{ slug: String(category).toLowerCase() }, ...(String(category).match(/^[a-f0-9]{24}$/i) ? [{ _id: category }] : [])],
                ...NOT_DELETED,
            }).select('_id').lean();
            if (!cat) return res.json({ products: [], total: 0, page: 1, pages: 0 });
            // A parent category's page includes its subcategories'
            // products — a shopper browsing "Electronics" expects the
            // phones inside it too.
            const children = await Category.find({ parent: cat._id, ...NOT_DELETED }).select('_id').lean();
            const grandChildren = children.length
                ? await Category.find({ parent: { $in: children.map((c) => c._id) }, ...NOT_DELETED }).select('_id').lean()
                : [];
            filter.category = { $in: [cat._id, ...children.map((c) => c._id), ...grandChildren.map((c) => c._id)] };
        }
        if (search) {
            const pattern = new RegExp(escapeRegex(String(search).trim()), 'i');
            filter.$or = [{ name: pattern }, { description: pattern }, { tags: pattern }];
        }
        const min = Number(minPrice);
        const max = Number(maxPrice);
        if (Number.isFinite(min) && min > 0) filter.price = { ...(filter.price || {}), $gte: min };
        if (Number.isFinite(max) && max > 0) filter.price = { ...(filter.price || {}), $lte: max };

        const sorts = {
            newest: { createdAt: -1 },
            'price-asc': { price: 1 },
            'price-desc': { price: -1 },
            rating: { averageRating: -1, reviewCount: -1 },
            name: { name: 1 },
            featured: { reviewCount: -1, averageRating: -1, createdAt: -1 },
        };
        const sort = sorts[String(req.query.sort || 'newest')] || sorts.newest;

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 24));

        const [total, products] = await Promise.all([
            Product.countDocuments(filter),
            Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)
                .populate('category', 'name slug').populate('brand', 'name slug').lean(),
        ]);
        res.json({
            products: products.map(shapeCatalogProduct),
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @route   GET /api/storefront/products/:slug
// @access  Public
const getCatalogProductBySlug = async (req, res) => {
    try {
        const product = await Product.findOne({ slug: String(req.params.slug).toLowerCase(), ...PUBLISHED })
            .populate('category', 'name slug').populate('brand', 'name slug').lean();
        if (!product) return res.status(404).json({ message: 'Product not found.' });
        res.json(shapeCatalogProduct(product));
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @route   GET /api/storefront/categories
// @access  Public — live categories with their PUBLISHED product
//          counts (the raw /api/categories counts every status).
const getCatalogCategories = async (req, res) => {
    try {
        const [categories, counts] = await Promise.all([
            Category.find({ ...NOT_DELETED, isActive: { $ne: false } }).sort({ sortOrder: 1, name: 1 })
                .populate('parent', 'name slug').lean(),
            Product.aggregate([
                { $match: { ...PUBLISHED } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
            ]),
        ]);
        const byId = new Map(counts.map((entry) => [String(entry._id), entry.count]));
        res.json(categories.map((category) => ({
            _id: category._id,
            name: category.name,
            slug: category.slug,
            description: category.description || '',
            image: category.image || '',
            parent: category.parent
                ? { _id: category.parent._id, name: category.parent.name, slug: category.parent.slug }
                : null,
            productsCount: byId.get(String(category._id)) || 0,
        })));
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @route   GET /api/storefront/products/:id/reviews
// @access  Public — APPROVED reviews only. Pending/rejected reviews
//          are the moderation queue's business, never a shopper's.
const getProductReviews = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, ...PUBLISHED }).select('_id').lean();
        if (!product) return res.status(404).json({ message: 'Product not found.' });
        const reviews = await Review.find({ product: product._id, status: 'approved', ...NOT_DELETED })
            .sort({ createdAt: -1 })
            .populate('user', 'firstName lastName avatar')
            .lean();
        res.json(reviews.map((review) => ({
            _id: review._id,
            rating: review.rating,
            title: review.title,
            content: review.content,
            createdAt: review.createdAt,
            author: review.user
                ? {
                    name: [review.user.firstName, review.user.lastName].filter(Boolean).join(' ').trim() || 'Customer',
                    avatar: review.user.avatar || '',
                }
                : { name: 'Customer', avatar: '' },
        })));
    } catch (error) {
        sendError(res, error, 500);
    }
};

// ── Cart pricing (shared by the quote and checkout) ────────────────
// Prices every requested line from the Product documents. A line
// whose product is not purchasable (unpublished or trashed) refuses
// the whole request with a shopper-readable sentence — a stale cart
// must never silently sell, or silently drop, an item.
const priceCartItems = async (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Your cart is empty.');
    }
    const lines = [];
    const couponLines = [];
    let subtotal = 0;
    for (const item of items) {
        const quantity = parseInt(item?.quantity, 10);
        if (!Number.isFinite(quantity) || quantity < 1) {
            throw new Error('Invalid item quantity.');
        }
        const product = await Product.findOne({ _id: item.product, ...PUBLISHED })
            .select('name sku price image category stock').lean();
        if (!product) {
            throw new Error('One of the items in your cart is no longer available.');
        }
        const price = Number(product.price) || 0;
        subtotal += price * quantity;
        lines.push({ product: product._id, name: product.name, price, quantity });
        couponLines.push({ product: product._id, category: product.category || null, lineTotal: price * quantity });
    }
    return { lines, couponLines, subtotal: roundMoney(subtotal) };
};

// @route   GET /api/storefront/shipping-options
// @access  Public — the checkout's delivery choices: method names,
//          charges and free-above thresholds are the store's public
//          rates (the same numbers a shopper is charged by).
const getShippingOptions = async (req, res) => {
    try {
        const config = await getShippingConfig();
        const methods = (config.methods || [])
            .filter((method) => method.isActive !== false)
            .map((method) => ({
                id: method.id,
                name: method.name,
                charge: Number(method.charge) || 0,
                freeAbove: method.freeAbove ?? null,
                estimatedDays: method.estimatedDays || '',
            }));
        const deliveryOptions = (config.deliveryOptions || [])
            .filter((option) => option.isActive !== false)
            .map((option) => ({
                id: option.id,
                name: option.name,
                chargeAdjustment: Number(option.chargeAdjustment) || 0,
                isPickup: Boolean(option.isPickup),
            }));
        res.json({
            configured: methods.length > 0,
            methods,
            deliveryOptions,
            defaultMethodId: config.defaultMethodId || '',
            defaultDeliveryOptionId: config.defaultDeliveryOptionId || '',
        });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @route   POST /api/storefront/quote
// @access  Public — prices a cart exactly as checkout will: product
//          prices from the documents, the coupon through the shared
//          resolver, shipping through the shared calculator.
const quoteCart = async (req, res) => {
    try {
        const { items, city, shippingMethodId, deliveryOptionId, couponCode, email } = req.body || {};
        const { couponLines, subtotal } = await priceCartItems(items);

        let discount = 0;
        let coupon = null;
        const code = typeof couponCode === 'string' ? couponCode.trim() : '';
        if (code) {
            let userId = null;
            const customer = await optionalCustomer(req);
            if (customer) userId = customer._id;
            else if (email) {
                const byEmail = await User.findOne({ email: String(email).trim().toLowerCase(), ...NOT_DELETED }).select('_id').lean();
                if (byEmail) userId = byEmail._id;
            }
            const resolved = await resolveCoupon(code, { subtotal, userId, lines: couponLines });
            discount = resolved.discount;
            coupon = { code: resolved.coupon.code, discount };
        }

        const config = await getShippingConfig();
        const quote = computeShippingCharge(config, {
            subtotal,
            methodId: shippingMethodId,
            deliveryOptionId,
            city,
        });
        const shippingCost = quote.configured ? quote.charge : 0;
        res.json({
            subtotal,
            discount,
            shippingCost,
            total: roundMoney(subtotal - discount + shippingCost),
            coupon,
            shipping: quote.configured
                ? {
                    methodId: quote.methodId,
                    methodName: quote.methodName,
                    deliveryOptionId: quote.deliveryOptionId,
                    deliveryOptionName: quote.deliveryOptionName,
                    zoneName: quote.zoneName,
                    freeApplied: quote.freeApplied,
                }
                : null,
        });
    } catch (error) {
        sendError(res, error, 400);
    }
};

// ── Customers ──────────────────────────────────────────────────────
// Storefront customers are User documents with the 'Customer' role
// (the same records the admin Customers page lists). A guest checkout
// is matched by email; a new guest gets an account whose password is
// random and never disclosed — the account exists so the order has an
// owner and the address book/history have a home.
async function findOrCreateCustomer(customer = {}) {
    const email = String(customer.email || '').trim().toLowerCase();
    if (!email) return null;
    const existing = await User.findOne({ email, ...NOT_DELETED });
    if (existing) {
        if (existing.role !== 'Customer') {
            throw new Error('This email is already registered with an account.');
        }
        return existing;
    }
    const firstName = String(customer.firstName || '').trim();
    const lastName = String(customer.lastName || '').trim();
    const usernameBase = (email.split('@')[0] || 'guest').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24) || 'guest';
    return new User({
        username: `${usernameBase}-${crypto.randomBytes(2).toString('hex')}`,
        email,
        // Random, never disclosed; the model's pre-save hook hashes it.
        password: crypto.randomBytes(24).toString('hex'),
        firstName,
        lastName,
        phone: String(customer.phone || '').trim(),
        role: 'Customer',
    }).save();
}

// The signed-in customer behind a Bearer token, or null. Session
// tokens are shared with the admin (same signer), so the role check
// is what keeps a staff token from acting as a shopper here — and a
// purpose-scoped temp token never counts as a session.
async function optionalCustomer(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    try {
        const decoded = jwt.verify(header.slice(7), await getJwtSecret());
        if (decoded.purpose) return null;
        const user = await User.findOne({ _id: decoded.id, ...NOT_DELETED });
        return user && user.role === 'Customer' && user.isActive !== false ? user : null;
    } catch {
        return null;
    }
}

// Runs an existing (req, res) controller with a captured response so
// the storefront can reuse it without an HTTP round-trip. The inner
// controllers already translate their own errors; the fallback here
// translates too, so a raw system message can never ride out.
function invoke(controller, body) {
    return new Promise((resolve) => {
        const mockRes = {
            _code: 200,
            status(code) { this._code = code; return this; },
            json(payload) { resolve({ code: this._code, payload }); return this; },
        };
        Promise.resolve(controller({ body }, mockRes)).catch((error) =>
            resolve({ code: 500, payload: { message: translateError(error, 500).message } })
        );
    });
}

// @desc    Place an order from the storefront (guest or signed-in)
// @route   POST /api/storefront/orders
// @access  Public — placement itself is createOrder: totals, stock,
//          coupon and shipping are ALL recomputed there.
const placeOrder = async (req, res) => {
    try {
        const { customer, shippingAddress, items, paymentMethod, couponCode, shippingMethodId, deliveryOptionId } = req.body || {};

        const signedIn = await optionalCustomer(req);
        const guest = customer || {};
        if (!signedIn && (!String(guest.firstName || '').trim() || !String(guest.email || '').trim())) {
            return res.status(400).json({ message: 'Your name and email are required to place an order.' });
        }
        const addr = shippingAddress || {};
        for (const field of ['street', 'city', 'state', 'zipCode', 'country']) {
            if (!String(addr[field] || '').trim()) {
                return res.status(400).json({ message: 'Please complete the shipping address.' });
            }
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'Your cart is empty.' });
        }
        // Purchasability is checked here (published + live); pricing,
        // stock and totals are createOrder's job below.
        await priceCartItems(items);

        const user = signedIn || (await findOrCreateCustomer({
            firstName: guest.firstName,
            lastName: guest.lastName,
            email: guest.email,
            phone: guest.phone,
        }));
        if (!user) return res.status(400).json({ message: 'A valid email is required.' });

        const result = await invoke(createOrder, {
            user: user._id,
            items: items.map((item) => ({ product: item.product, quantity: parseInt(item.quantity, 10) || 0 })),
            tax: 0,
            shippingAddress: addr,
            billingAddress: addr,
            paymentMethod: String(paymentMethod || 'Cash on Delivery'),
            paymentStatus: 'pending',
            ...(typeof couponCode === 'string' && couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
            ...(shippingMethodId ? { shippingMethodId: String(shippingMethodId) } : {}),
            ...(deliveryOptionId ? { deliveryOptionId: String(deliveryOptionId) } : {}),
        });
        if (result.code >= 400) {
            return res.status(result.code).json(result.payload);
        }
        const order = result.payload || {};
        return res.status(201).json({
            _id: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
            subtotal: order.subtotal,
            discount: order.discount,
            shippingCost: order.shippingCost,
            total: order.total,
            items: (order.items || []).map((item) => ({
                name: item.name, price: item.price, quantity: item.quantity, image: item.image || '',
            })),
            createdAt: order.createdAt,
        });
    } catch (error) {
        sendError(res, error, 400);
    }
};

// The storefront's own origin, for the payment return URLs Stripe
// requires to be absolute. The shopper's browser calls this API
// cross-origin, so its Origin (or Referer) IS the storefront; the
// STOREFRONT_URL env is a last-resort fallback. Anything that does
// not parse as http(s) is ignored.
const storefrontOrigin = (req) => {
    const candidates = [req.headers.origin, req.headers.referer, process.env.STOREFRONT_URL];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            const url = new URL(String(candidate));
            if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
        } catch {
            // Not a URL — try the next candidate.
        }
    }
    return '';
};

// @desc    Start Stripe Checkout for an already-placed storefront
//          order: creates the hosted-page session and returns its
//          URL for the browser to redirect to. Amount, currency and
//          identity come ONLY from the stored order — the client
//          names the order, never a price.
// @route   POST /api/storefront/orders/:id/stripe-session
// @access  Public
const createStripeSession = async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[a-f0-9]{24}$/i.test(String(id || ''))) {
            return res.status(404).json({ message: 'Order not found.' });
        }
        const order = await Order.findOne({ _id: id, ...NOT_DELETED });
        if (!order) return res.status(404).json({ message: 'Order not found.' });
        if (order.paymentStatus === 'paid') {
            return res.status(400).json({ message: 'This order is already paid.' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ message: 'This order was cancelled.' });
        }
        if (!isStripePaymentMethod(order.paymentMethod)) {
            return res.status(400).json({ message: 'This order was not placed with online card payment.' });
        }
        const stripe = await resolveStripeCheckout();
        if (!stripe) {
            return res.status(503).json({ message: 'Online card payment is not available right now.' });
        }
        if (!(Number(order.total) > 0)) {
            return res.status(400).json({ message: 'This order has no amount to pay.' });
        }
        const origin = storefrontOrigin(req);
        if (!origin) {
            return res.status(400).json({ message: 'The store address for returning from payment could not be determined.' });
        }
        const settings = await Setting.findOne().sort({ createdAt: 1 }).select('general').lean();
        const currency = settings?.general?.currency || 'USD';

        let session;
        try {
            session = await createCheckoutSession({ config: stripe, order, currency, origin });
        } catch {
            // The real Stripe reason was logged in the util; the
            // shopper gets one clean sentence and the order simply
            // stays placed + unpaid.
            return res.status(502).json({ message: 'Online payment could not be started — your order is placed but unpaid.' });
        }
        // The session id becomes the order's paymentId — the first
        // key the webhook matcher tries for checkout.session.completed.
        order.paymentId = session.id;
        await order.save();
        return res.json({ url: session.url });
    } catch (error) {
        return sendError(res, error, 500);
    }
};

// @desc    Track an order without an account: order number + the
//          email the order was placed with. Both must match — the
//          answer never confirms which one was wrong.
// @route   POST /api/storefront/track
// @access  Public
const trackOrder = async (req, res) => {
    try {
        const orderNumber = String(req.body?.orderNumber || '').trim().toUpperCase();
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!orderNumber || !email) {
            return res.status(400).json({ message: 'Enter your order number and email.' });
        }
        const order = await Order.findOne({ orderNumber, ...NOT_DELETED })
            .populate('user', 'email')
            .lean();
        if (!order || String(order.user?.email || '').toLowerCase() !== email) {
            return res.status(404).json({ message: 'No order matches that order number and email.' });
        }
        const config = await getShippingConfig();
        res.json({
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
            items: (order.items || []).map((item) => ({
                name: item.name, price: item.price, quantity: item.quantity, image: item.image || '',
            })),
            subtotal: order.subtotal,
            discount: order.discount,
            shippingCost: order.shippingCost,
            total: order.total,
            createdAt: order.createdAt,
            city: order.shippingAddress?.city || '',
            country: order.shippingAddress?.country || '',
            shipment: shipmentBlock(config, order),
        });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @desc    Submit a product review from the storefront (lands in the
//          admin moderation queue as 'pending')
// @route   POST /api/storefront/reviews
// @access  Public
const submitReview = async (req, res) => {
    try {
        const { product, rating, title, content, customer } = req.body || {};
        if (!product || !rating || !String(title || '').trim() || !String(content || '').trim()) {
            return res.status(400).json({ message: 'Please complete the review form.' });
        }
        if (!customer || !String(customer.firstName || '').trim() || !String(customer.email || '').trim()) {
            return res.status(400).json({ message: 'Your name and email are required to leave a review.' });
        }
        const target = await Product.findOne({ _id: product, ...PUBLISHED }).select('_id').lean();
        if (!target) return res.status(400).json({ message: 'This product is not available.' });
        const user = await findOrCreateCustomer(customer);
        if (!user) return res.status(400).json({ message: 'A valid email is required.' });

        const result = await invoke(createReview, {
            product,
            user: user._id,
            rating: Number(rating),
            title: String(title).trim(),
            content: String(content).trim(),
            status: 'pending',
        });
        if (result.code >= 400) return res.status(result.code).json(result.payload);
        return res.status(201).json({ message: 'Thank you — your review is awaiting approval.' });
    } catch (error) {
        sendError(res, error, 400);
    }
};

// ── Customer accounts ──────────────────────────────────────────────
// Customer sign-in is deliberately SEPARATE from the admin login:
// no staff 2FA enrolment, no Settings Lock, and staff accounts are
// refused here (the admin login refuses customers the same way).
// Tokens are the platform's ordinary session JWTs (same signer), so
// the shared `protect` middleware verifies them; the role check in
// requireCustomer is what scopes them to the storefront.
const customerSession = async (user) => ({
    _id: user._id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    token: jwt.sign({ id: user._id }, await getJwtSignSecret(), { expiresIn: '30d' }),
});

const publicCustomer = (user) => ({
    _id: user._id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email,
    phone: user.phone || '',
    avatar: user.avatar,
    role: user.role,
    addresses: (user.addresses || []).map((address) => ({
        street: address.street, city: address.city, state: address.state,
        zipCode: address.zipCode, country: address.country, isDefault: Boolean(address.isDefault),
    })),
    createdAt: user.createdAt,
});

// Route guard for the account endpoints: runs after `protect` (which
// loaded req.user from the session token) and keeps staff tokens out.
const requireCustomer = (req, res, next) => {
    if (!req.user || req.user.role !== 'Customer') {
        return res.status(403).json({ message: 'This area is for customer accounts.' });
    }
    if (req.user.isActive === false) {
        return res.status(403).json({ message: 'This account has been deactivated.' });
    }
    return next();
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @route   POST /api/storefront/auth/register
// @access  Public
const registerCustomer = async (req, res) => {
    try {
        const { firstName, lastName, email, password, phone } = req.body || {};
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!String(firstName || '').trim() || !cleanEmail || !String(password || '')) {
            return res.status(400).json({ message: 'Please fill all required fields.' });
        }
        if (!EMAIL_PATTERN.test(cleanEmail)) {
            return res.status(400).json({ message: 'Enter a valid email address.' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ message: 'The password must be at least 6 characters.' });
        }
        const existing = await User.findOne({ email: cleanEmail, ...NOT_DELETED }).select('_id').lean();
        if (existing) {
            return res.status(400).json({ message: 'An account with this email already exists — sign in instead.' });
        }
        const usernameBase = (cleanEmail.split('@')[0] || 'customer').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 24) || 'customer';
        const user = await new User({
            username: `${usernameBase}-${crypto.randomBytes(2).toString('hex')}`,
            email: cleanEmail,
            password: String(password),
            firstName: String(firstName).trim(),
            lastName: String(lastName || '').trim(),
            phone: String(phone || '').trim(),
            role: 'Customer',
        }).save();
        return res.status(201).json(await customerSession(user));
    } catch (error) {
        sendError(res, error, 400);
    }
};

// @route   POST /api/storefront/auth/login
// @access  Public — password only; the staff 2FA flow never applies
//          to customer accounts.
const loginCustomer = async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        if (!email || !password) {
            return res.status(400).json({ message: 'Enter your email and password.' });
        }
        const user = await User.findOne({ email, ...NOT_DELETED }).select('+password');
        if (!user || user.role !== 'Customer') {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        if (user.isActive === false) {
            return res.status(403).json({ message: 'This account has been deactivated.' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        return res.json(await customerSession(user));
    } catch (error) {
        if (error.code === 'JWT_SIGNING_DISABLED') return sendError(res, error, 403);
        return sendError(res, error, 500);
    }
};

// The signed-in customer's cart + wishlist, populated with the
// catalog shape so the account pages render without a second call.
// Entries whose product was deleted fall away (delete-impact already
// removes them at delete time; this is the belt to that suspenders).
const populatedLists = async (user) => {
    const populated = await User.findById(user._id)
        .populate({ path: 'cart.product', select: 'name slug price comparePrice image images stock status category', populate: { path: 'category', select: 'name slug' } })
        .populate({ path: 'wishlist', select: 'name slug price comparePrice image images stock status category', populate: { path: 'category', select: 'name slug' } })
        .lean();
    const cart = (populated?.cart || [])
        .filter((entry) => entry.product)
        .map((entry) => ({ product: shapeCatalogProduct(entry.product), quantity: entry.quantity || 1 }));
    const wishlist = (populated?.wishlist || []).filter(Boolean).map(shapeCatalogProduct);
    return { cart, wishlist };
};

// @route   GET /api/storefront/me
// @access  Customer
const getMe = async (req, res) => {
    try {
        const { cart, wishlist } = await populatedLists(req.user);
        res.json({ ...publicCustomer(req.user), cart, wishlist });
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @route   PUT /api/storefront/me
// @access  Customer — profile fields and the address book only; role,
//          email and security fields are not writable from here.
const updateMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'Account not found.' });
        const { firstName, lastName, phone, addresses } = req.body || {};
        if (firstName !== undefined) user.firstName = String(firstName).trim();
        if (lastName !== undefined) user.lastName = String(lastName).trim();
        if (phone !== undefined) user.phone = String(phone).trim();
        if (addresses !== undefined) {
            if (!Array.isArray(addresses)) {
                return res.status(400).json({ message: 'Addresses must be a list.' });
            }
            for (const address of addresses) {
                for (const field of ['street', 'city', 'state', 'zipCode', 'country']) {
                    if (!String(address?.[field] || '').trim()) {
                        return res.status(400).json({ message: 'Please complete every address.' });
                    }
                }
            }
            user.addresses = addresses.map((address) => ({
                street: String(address.street).trim(),
                city: String(address.city).trim(),
                state: String(address.state).trim(),
                zipCode: String(address.zipCode).trim(),
                country: String(address.country).trim(),
                isDefault: Boolean(address.isDefault),
            }));
        }
        await user.save();
        const { cart, wishlist } = await populatedLists(user);
        return res.json({ ...publicCustomer(user), cart, wishlist });
    } catch (error) {
        sendError(res, error, 400);
    }
};

// @route   PUT /api/storefront/me/cart
// @access  Customer — replaces the saved cart (the storefront syncs
//          its local cart here while signed in).
const updateCart = async (req, res) => {
    try {
        const { items } = req.body || {};
        if (!Array.isArray(items)) {
            return res.status(400).json({ message: 'Cart items must be a list.' });
        }
        const cart = [];
        for (const item of items) {
            const quantity = parseInt(item?.quantity, 10);
            if (!item?.product || !Number.isFinite(quantity) || quantity < 1) continue;
            const product = await Product.findOne({ _id: item.product, ...NOT_DELETED }).select('_id').lean();
            if (product) cart.push({ product: product._id, quantity });
        }
        const user = await User.findById(req.user._id);
        user.cart = cart;
        await user.save();
        const { cart: populated } = await populatedLists(user);
        return res.json({ cart: populated });
    } catch (error) {
        sendError(res, error, 400);
    }
};

// @route   PUT /api/storefront/me/wishlist
// @access  Customer — replaces the wishlist with the given products.
const updateWishlist = async (req, res) => {
    try {
        const { productIds } = req.body || {};
        if (!Array.isArray(productIds)) {
            return res.status(400).json({ message: 'Wishlist items must be a list.' });
        }
        const valid = await Product.find({ _id: { $in: productIds }, ...NOT_DELETED }).select('_id').lean();
        const validIds = new Set(valid.map((entry) => String(entry._id)));
        const user = await User.findById(req.user._id);
        user.wishlist = productIds.filter((id) => validIds.has(String(id)));
        await user.save();
        const { wishlist } = await populatedLists(user);
        return res.json({ wishlist });
    } catch (error) {
        sendError(res, error, 400);
    }
};

const shapeMyOrder = async (order, config) => {
    const obj = typeof order.toObject === 'function' ? order.toObject() : { ...order };
    // Item names ride the snapshot taken at order time; legacy lines
    // that predate it resolve from the product record in ANY state
    // (a deleted product still names the line — customers never see
    // a "deleted" marker, the name simply keeps displaying).
    const legacyIds = [...new Set(
        (obj.items || []).filter((item) => !item.name && item.product).map((item) => String(item.product)),
    )];
    const legacyNames = new Map();
    if (legacyIds.length) {
        const products = await Product.find({ _id: { $in: legacyIds } }).select('name').lean();
        for (const product of products) legacyNames.set(String(product._id), product.name);
    }
    return {
        _id: obj._id,
        orderNumber: obj.orderNumber,
        status: obj.status,
        paymentStatus: obj.paymentStatus,
        paymentMethod: obj.paymentMethod,
        items: (obj.items || []).map((item) => ({
            name: item.name || legacyNames.get(String(item.product)) || '',
            price: item.price, quantity: item.quantity, image: item.image || '',
        })),
        subtotal: obj.subtotal,
        discount: obj.discount,
        shippingCost: obj.shippingCost,
        total: obj.total,
        shippingAddress: obj.shippingAddress || null,
        createdAt: obj.createdAt,
        shipment: shipmentBlock(config, obj),
    };
};

// @route   GET /api/storefront/me/orders
// @access  Customer
const getMyOrders = async (req, res) => {
    try {
        const config = await getShippingConfig();
        const orders = await Order.find({ user: req.user._id, ...NOT_DELETED }).sort({ createdAt: -1 });
        const shaped = [];
        for (const order of orders) shaped.push(await shapeMyOrder(order, config));
        res.json(shaped);
    } catch (error) {
        sendError(res, error, 500);
    }
};

// @route   GET /api/storefront/me/orders/:id
// @access  Customer — only ever the caller's own orders.
const getMyOrder = async (req, res) => {
    try {
        const order = await Order.findOne({ _id: req.params.id, user: req.user._id, ...NOT_DELETED });
        if (!order) return res.status(404).json({ message: 'Order not found.' });
        const config = await getShippingConfig();
        res.json(await shapeMyOrder(order, config));
    } catch (error) {
        sendError(res, error, 500);
    }
};

module.exports = {
    getStoreConfig,
    getCatalogProducts,
    getCatalogProductBySlug,
    getCatalogCategories,
    getProductReviews,
    getShippingOptions,
    quoteCart,
    placeOrder,
    createStripeSession,
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
};
