const express = require('express');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { roleHasPermission } = require('../utils/permissions');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Media = require('../models/Media');
const Order = require('../models/Order');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const { NOT_DELETED } = require('../utils/softDelete');

const router = express.Router();

router.use(protect, requireStaff);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Scope vocabulary of GET /api/search. `module` is the permission module
// whose "view" grant gates the scope; `type` is what the client shows
// as the result tag.
const SCOPES = [
    { name: 'products', module: 'Products', type: 'product' },
    { name: 'categories', module: 'Categories', type: 'category' },
    { name: 'brands', module: 'Brands', type: 'brand' },
    { name: 'media', module: 'Media', type: 'media' },
    { name: 'orders', module: 'Orders', type: 'order' },
    { name: 'customers', module: 'Customers', type: 'customer' },
    { name: 'coupons', module: 'Coupons', type: 'coupon' },
];

// GET /api/search?q=<text>&scope=<all|products|categories|brands|media|orders|customers|coupons>
// Flat, tag-ready results for the TopBar global search. Matching is a
// case-insensitive substring on each resource's identifying fields,
// plus a prefix match on the public code (codes are stored UPPERCASE).
// Scopes the caller may not view are skipped entirely.
router.get('/', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json([]);

        const requested = String(req.query.scope || 'all').toLowerCase();
        const active = SCOPES.filter(
            (scope) => requested === 'all' || scope.name === requested,
        );
        const limit = active.length === 1 ? 12 : 6;

        const rx = { $regex: escapeRegex(q), $options: 'i' };
        const codeRx = { $regex: `^${escapeRegex(q.toUpperCase())}` };

        // A query that could be a (partial) public code: backfill codes
        // on legacy records first, like the media list does, so a code
        // search can find records that never went through a list view.
        if (/^[A-Za-z0-9]{1,6}$/.test(q)) {
            const models = { products: Product, categories: Category, brands: Brand, media: Media, orders: Order, customers: User };
            await Promise.all(
                active.map(async (scope) => {
                    // A coupon's public code lives in `publicId` (its
                    // `code` is the redeem code), so its backfill checks
                    // that field instead.
                    if (scope.name === 'coupons') {
                        const missing = await Coupon.find({
                            $or: [{ publicId: { $exists: false } }, { publicId: null }, { publicId: '' }],
                            ...NOT_DELETED,
                        }).select('_id publicId');
                        if (missing.length) await Coupon.withCodes(missing);
                        return;
                    }
                    const Model = models[scope.name];
                    const missing = await Model.find({
                        $or: [{ code: { $exists: false } }, { code: null }, { code: '' }],
                        ...NOT_DELETED,
                    }).select('_id code');
                    if (missing.length) await Model.withCodes(missing);
                }),
            );
        }

        const byScope = await Promise.all(
            active.map(async (scope) => {
                if (!(await roleHasPermission(req.user.role, scope.module, 'view'))) {
                    return [];
                }
                switch (scope.name) {
                    case 'products': {
                        const docs = await Product.find({
                            $and: [{ $or: [{ name: rx }, { sku: rx }, { code: codeRx }] }, NOT_DELETED],
                        })
                            .select('name sku code image images')
                            .sort({ name: 1 })
                            .limit(limit)
                            .lean();
                        await Product.withCodes(docs);
                        return docs.map((doc) => ({
                            type: 'product',
                            id: String(doc._id),
                            name: doc.name,
                            code: doc.code || null,
                            sku: doc.sku || null,
                            image:
                                doc.image ||
                                doc.images?.find((entry) => entry.isMain)?.url ||
                                doc.images?.[0]?.url ||
                                '',
                        }));
                    }
                    case 'categories': {
                        const docs = await Category.find({
                            $and: [{ $or: [{ name: rx }, { code: codeRx }] }, NOT_DELETED],
                        })
                            .select('name code image')
                            .sort({ name: 1 })
                            .limit(limit)
                            .lean();
                        await Category.withCodes(docs);
                        return docs.map((doc) => ({
                            type: 'category',
                            id: String(doc._id),
                            name: doc.name,
                            code: doc.code || null,
                            sku: null,
                            image: doc.image || '',
                        }));
                    }
                    case 'brands': {
                        const docs = await Brand.find({
                            $and: [{ $or: [{ name: rx }, { code: codeRx }] }, NOT_DELETED],
                        })
                            .select('name code logo')
                            .sort({ name: 1 })
                            .limit(limit)
                            .lean();
                        await Brand.withCodes(docs);
                        return docs.map((doc) => ({
                            type: 'brand',
                            id: String(doc._id),
                            name: doc.name,
                            code: doc.code || null,
                            sku: null,
                            image: doc.logo || '',
                        }));
                    }
                    case 'media': {
                        const docs = await Media.find({
                            $and: [
                                {
                                    $or: [
                                        { originalName: rx },
                                        { filename: rx },
                                        { altText: rx },
                                        { code: codeRx },
                                    ],
                                },
                                NOT_DELETED,
                            ],
                        })
                            .select('originalName filename code url mimeType')
                            .sort({ createdAt: -1 })
                            .limit(limit)
                            .lean();
                        await Media.withCodes(docs);
                        return docs.map((doc) => ({
                            type: 'media',
                            id: String(doc._id),
                            name: doc.originalName || doc.filename,
                            code: doc.code || null,
                            sku: null,
                            image: doc.mimeType?.startsWith('image/') ? doc.url : '',
                        }));
                    }
                    case 'orders': {
                        // Matched by order number. `search` is the term
                        // the Orders page pre-applies to its search box
                        // on click-through (the notification pattern);
                        // `customer` + `total` are the context line.
                        const docs = await Order.find({
                            $and: [{ orderNumber: rx }, NOT_DELETED],
                        })
                            .populate('user', 'firstName lastName email')
                            .select('orderNumber total user')
                            .sort({ createdAt: -1 })
                            .limit(limit)
                            .lean();
                        return docs.map((doc) => {
                            const customer = doc.user
                                ? [doc.user.firstName, doc.user.lastName]
                                      .filter(Boolean)
                                      .join(' ')
                                      .trim() || doc.user.email || null
                                : null;
                            return {
                                type: 'order',
                                id: String(doc._id),
                                name: doc.orderNumber,
                                code: null,
                                sku: null,
                                image: '',
                                customer,
                                total: typeof doc.total === 'number' ? doc.total : null,
                                search: doc.orderNumber,
                            };
                        });
                    }
                    case 'customers': {
                        // Customers only — staff accounts never appear
                        // (role 'Customer', the dashboard rule). Matched
                        // by email or name; the click-through carries
                        // the email, like notification click-throughs.
                        const docs = await User.find({
                            $and: [
                                { role: 'Customer' },
                                { $or: [{ email: rx }, { firstName: rx }, { lastName: rx }] },
                                NOT_DELETED,
                            ],
                        })
                            .select('firstName lastName email avatar')
                            .sort({ firstName: 1, lastName: 1 })
                            .limit(limit)
                            .lean();
                        return docs.map((doc) => {
                            const fullName = [doc.firstName, doc.lastName]
                                .filter(Boolean)
                                .join(' ')
                                .trim();
                            return {
                                type: 'customer',
                                id: String(doc._id),
                                name: fullName || doc.email,
                                code: null,
                                sku: null,
                                image:
                                    doc.avatar && doc.avatar.startsWith('http')
                                        ? doc.avatar
                                        : '',
                                detail: doc.email || null,
                                search: doc.email || null,
                            };
                        });
                    }
                    case 'coupons': {
                        // Matched by the redeem code OR the 6-char
                        // publicId, both as case-insensitive substrings;
                        // the publicId rides back as the `#code` context
                        // line, like the other scopes.
                        const docs = await Coupon.find({
                            $and: [{ $or: [{ code: rx }, { publicId: rx }] }, NOT_DELETED],
                        })
                            .select('code publicId')
                            .sort({ code: 1 })
                            .limit(limit)
                            .lean();
                        await Coupon.withCodes(docs);
                        return docs.map((doc) => ({
                            type: 'coupon',
                            id: String(doc._id),
                            name: doc.code,
                            code: doc.publicId || null,
                            sku: null,
                            image: '',
                            search: doc.code,
                        }));
                    }
                    default:
                        return [];
                }
            }),
        );

        res.json(byScope.flat());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
