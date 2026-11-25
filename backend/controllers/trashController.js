// ── Settings → Deleted Items (Ahsan's order) ───────────────────────
// Every module delete in the admin is a SOFT delete: the record is
// stamped and hidden everywhere (see utils/softDelete) and waits
// here. This controller serves the Deleted Items section: the list
// of everything trashed, Restore (the record goes back exactly as it
// was, with its module's reversible side effects re-applied), and
// Delete Permanently (the real removal — for media that includes
// destroying the Cloudinary asset, which the soft delete deliberately
// spared).
//
// Guards live in routes/trash.js: staff + Settings view + the
// Settings Lock entry proof for the list; the item's OWN module
// Delete permission plus the Settings Lock per-save password check
// for both actions.
const {
    Product,
    Category,
    Brand,
    Coupon,
    Order,
    User,
    Review,
    Media,
    Setting,
} = require('../models');
const { planRestore, applyRestore, NOT_DELETED } = require('../utils/softDelete');
const { relinkFromSnapshot } = require('../utils/deleteImpact');
const { withTransaction } = require('../utils/transactions');
const { adjustStock, statusReturnsStock, syncCouponUse } = require('./orderController');
const { syncProductRating } = require('./reviewController');
const {
    refreshCredentials,
    getStorageEntryBySlug,
    getStorageEntryByCloudName,
    getDefaultStorageEntry,
} = require('../utils/credentials');
const { parseCloudinaryUrl, destroyAsset } = require('../utils/cloudinaryUrl');
const { getDefinition } = require('../config/services');
const { sendError } = require('../utils/apiError');

const PAYMENT_SA_ONLY_MESSAGE = 'Only Super Admin can manage payment methods.';

const personName = (user) => {
    if (!user) return '';
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.username || user.email || '';
};

/** The original value of a tombstoned field, as kept at delete time. */
const originalOf = (doc, field) => {
    const stored = doc?.deletedUniques;
    if (!stored) return undefined;
    const value = typeof stored.get === 'function' ? stored.get(field) : stored[field];
    return value || undefined;
};

// Module registry, keyed by the URL segment the panel uses. `name`
// and `code` shape the row the Deleted Items list shows; user records
// split into Customers / Users by role, exactly like the panel's own
// modules split the same collection.
const MODULES = {
    products: {
        label: 'Products',
        Model: Product,
        name: (doc) => doc.name,
        code: (doc) => doc.code,
    },
    categories: {
        label: 'Categories',
        Model: Category,
        name: (doc) => doc.name,
        code: (doc) => doc.code,
    },
    brands: {
        label: 'Brands',
        Model: Brand,
        name: (doc) => doc.name,
        code: (doc) => doc.code,
    },
    coupons: {
        label: 'Coupons',
        Model: Coupon,
        // The stored redeem code is a tombstone while trashed — the
        // row shows the code the coupon actually carried.
        name: (doc) => originalOf(doc, 'code') || doc.code,
        code: (doc) => doc.publicId,
    },
    orders: {
        label: 'Orders',
        Model: Order,
        name: (doc) => doc.orderNumber,
        code: (doc) => doc.code,
    },
    customers: {
        label: 'Customers',
        Model: User,
        match: { role: 'Customer' },
        person: true,
        name: (doc) => personName(doc) || originalOf(doc, 'email') || doc.email,
        code: (doc) => doc.code,
    },
    users: {
        label: 'Users',
        Model: User,
        match: { role: { $ne: 'Customer' } },
        person: true,
        name: (doc) => personName(doc) || originalOf(doc, 'email') || doc.email,
        code: (doc) => doc.code,
    },
    reviews: {
        label: 'Reviews',
        Model: Review,
        name: (doc) =>
            `${doc.rating}★ review${doc.product?.name ? ` on ${doc.product.name}` : ''}`,
        code: (doc) => doc.code,
    },
    media: {
        label: 'Media',
        Model: Media,
        name: (doc) => doc.originalName || doc.filename,
        code: (doc) => doc.code,
    },
};

const TRASHED = { deletedAt: { $ne: null } };

const shapeItem = (segment, def, doc, deleters) => ({
    module: segment,
    moduleLabel: def.label,
    id: String(doc._id),
    name: def.name(doc) || '—',
    code: def.code(doc) || null,
    // Person records (customers / staff) carry their own avatar, so
    // the row can show the person's disc beside their name; every
    // other module's rows carry no avatar field at all.
    ...(def.person ? { avatar: doc.avatar || null } : {}),
    deletedAt: doc.deletedAt,
    deletedBy: doc.deletedBy
        ? {
              name: personName(deleters.get(String(doc.deletedBy))) || null,
              email: deleters.get(String(doc.deletedBy))?.email || null,
              avatar: deleters.get(String(doc.deletedBy))?.avatar || null,
          }
        : null,
});

/** Batch-resolves the accounts that deleted a set of records, so a
 *  row can say WHO deleted it without a query per row. */
const loadDeleters = async (docs) => {
    const ids = [
        ...new Set(
            docs
                .map((doc) => doc.deletedBy)
                .filter(Boolean)
                .map((id) => String(id)),
        ),
    ];
    if (!ids.length) return new Map();
    const users = await User.find({ _id: { $in: ids } })
        .select('firstName lastName username email avatar')
        .lean();
    return new Map(users.map((user) => [String(user._id), user]));
};

// ── List ────────────────────────────────────────────────────────────
const listDeletedItems = async (req, res) => {
    try {
        const requested = String(req.query.module || '').toLowerCase();
        const items = [];

        const segments = requested
            ? requested === 'integrations'
                ? []
                : MODULES[requested]
                  ? [requested]
                  : null
            : Object.keys(MODULES);
        if (segments === null) {
            return res.status(404).json({ message: 'Unknown module.' });
        }

        for (const segment of segments) {
            const def = MODULES[segment];
            const query = { ...TRASHED, ...(def.match || {}) };
            let docs = def.Model.find(query).sort({ deletedAt: -1 });
            if (segment === 'reviews') docs = docs.populate('product', 'name');
            docs = await docs;
            // eslint-disable-next-line no-await-in-loop
            const deleters = await loadDeleters(docs);
            for (const doc of docs) items.push(shapeItem(segment, def, doc, deleters));
        }

        if (!requested || requested === 'integrations') {
            items.push(...(await listDeletedIntegrations(req)));
        }

        items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
        res.json(items);
    } catch (error) {
        sendError(res, error, 500);
    }
};

/** Trashed integration entries live inside the Setting document —
 *  only display metadata ever leaves here (title, slug, category);
 *  credentials are never part of this payload. Payment entries keep
 *  the Super-Admin-only rule: for other roles they are omitted
 *  entirely, exactly like the settings reads omit them. */
const listDeletedIntegrations = async (req) => {
    const setting = await Setting.findOne()
        .sort({ createdAt: 1 })
        .select('deletedIntegrations')
        .lean();
    const entries = setting?.deletedIntegrations || [];
    const visible =
        req.user?.role === 'Super Admin'
            ? entries
            : entries.filter((entry) => entry.usageType !== 'PAYMENT');
    const deleters = await loadDeleters(visible);
    return visible.map((entry) => ({
        module: 'integrations',
        moduleLabel: 'Integrations',
        id: String(entry._id),
        name: entry.title || entry.serviceSlug,
        code: entry.serviceSlug || null,
        deletedAt: entry.deletedAt || null,
        deletedBy: entry.deletedBy
            ? {
                  name: personName(deleters.get(String(entry.deletedBy))) || null,
                  email: deleters.get(String(entry.deletedBy))?.email || null,
                  avatar: deleters.get(String(entry.deletedBy))?.avatar || null,
              }
            : null,
    }));
};

// ── Restore ─────────────────────────────────────────────────────────
const restoreItem = async (req, res) => {
    try {
        const segment = String(req.params.module || '').toLowerCase();
        if (segment === 'integrations') return restoreIntegration(req, res);
        const def = MODULES[segment];
        if (!def) return res.status(404).json({ message: 'Unknown module.' });

        const doc = await def.Model.findOne({ _id: req.params.id, ...TRASHED });
        if (!doc) {
            // Restore is idempotent for orders: when a parallel
            // restore (or the first half of a double-click) already
            // brought the order back, the end state this request
            // asked for holds — answer success and move nothing. An
            // order that exists nowhere still answers 404.
            if (segment === 'orders') {
                const live = await Order.findOne({ _id: req.params.id, ...NOT_DELETED });
                if (live) return res.json({ message: 'Item restored.' });
            }
            return res.status(404).json({ message: 'This item is not in Deleted Items.' });
        }

        // A trashed review may only come back while the customer has
        // no LIVE review for the same product: a fresh one posted
        // meanwhile wins, and the restore is refused in plain words
        // here rather than by the partial unique index's raw error.
        if (segment === 'reviews') {
            const clash = await Review.exists({
                user: doc.user,
                product: doc.product,
                _id: { $ne: doc._id },
                ...NOT_DELETED,
            });
            if (clash) {
                return res.status(400).json({
                    message: 'This customer already has a live review for this product.',
                });
            }
        }

        const restoreValues = await planRestore(def.Model, doc);

        // Orders restore through an ATOMIC claim: the conditional
        // update only lands while the order is still trashed, so a
        // burst of parallel restores (or a double-click) produces
        // exactly one winner that re-reserves the stock and
        // re-records the coupon redemption. A loser whose order is
        // live again answers success without moving anything — the
        // restore it asked for has happened, exactly once. (Orders
        // carry no tombstoned unique values, so restoreValues is
        // empty for them and the claim is the whole write.)
        if (segment === 'orders') {
            // The claim and its paired adjustments (stock re-reserve,
            // coupon re-record) run as ONE unit — inside a MongoDB
            // transaction when the deployment supports it
            // (utils/transactions), so a hard crash between them can
            // no longer leave them split; on a standalone server the
            // same steps run sequentially, exactly as before.
            const outcome = await withTransaction(async (session) => {
                const claimed = await Order.findOneAndUpdate(
                    { _id: doc._id, deletedAt: { $ne: null } },
                    {
                        $set: { ...restoreValues, deletedAt: null, deletedBy: null },
                        $unset: { deletedUniques: '' },
                    },
                    { new: true, ...(session ? { session } : {}) }
                );
                if (!claimed) return { lost: true };
                if (!statusReturnsStock(claimed.status)) {
                    await adjustStock(claimed.items, -1, session);
                }
                if (await syncCouponUse(claimed, session)) {
                    await claimed.save(session ? { session } : undefined);
                }
                return { restored: true };
            });
            if (outcome.lost) {
                const live = await Order.findOne({ _id: doc._id, ...NOT_DELETED });
                if (live) return res.json({ message: 'Item restored.' });
                return res.status(404).json({
                    message: 'This item is not in Deleted Items.',
                });
            }
            return res.json({ message: 'Item restored.' });
        }

        // Delete-impact re-link: when the delete detached this
        // record from other records (media out of galleries, a
        // category's products, a product out of carts/favorites),
        // the snapshot it stored as `deletedLinks` goes back —
        // conservatively, never overwriting a newer assignment
        // (utils/deleteImpact). Records trashed before snapshots
        // existed carry none and restore exactly as before. The
        // snapshot is consumed either way: it describes THIS trash
        // episode only.
        const linkModule = {
            media: 'media',
            categories: 'categories',
            brands: 'brands',
            products: 'products',
            customers: 'customers',
        }[segment];
        const linkSnapshot = linkModule ? doc.get('deletedLinks') : undefined;

        applyRestore(doc, restoreValues);
        if (linkSnapshot) {
            await relinkFromSnapshot(linkModule, doc, linkSnapshot);
            doc.set('deletedLinks', undefined);
        }
        try {
            await doc.save();
        } catch (error) {
            // Race guard: a fresh review created between the check
            // above and this save hits the partial unique index —
            // answer in the same plain words, never the raw error.
            if (segment === 'reviews' && error.code === 11000) {
                return res.status(400).json({
                    message: 'This customer already has a live review for this product.',
                });
            }
            throw error;
        }

        // Module side effects the soft delete applied, reversed: a
        // restored review counts toward its product's rating again.
        // (Orders run their side effects inside the atomic claim
        // above and never reach this path.)
        if (segment === 'reviews') {
            await syncProductRating(doc.product);
        }

        res.json({ message: 'Item restored.' });
    } catch (error) {
        sendError(res, error, 400);
    }
};

const restoreIntegration = async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 });
        if (!settings) return res.status(404).json({ message: 'This item is not in Deleted Items.' });
        const trashed = settings.get('deletedIntegrations') || [];
        const entry = trashed.find((item) => String(item._id) === String(req.params.id));
        if (!entry) return res.status(404).json({ message: 'This item is not in Deleted Items.' });

        // Payment methods are Super-Admin-only — restoring one is
        // managing payment methods.
        if (entry.usageType === 'PAYMENT' && req.user?.role !== 'Super Admin') {
            return res.status(403).json({ message: PAYMENT_SA_ONLY_MESSAGE });
        }

        const live = settings.get('integrations') || [];
        if (live.some((item) => item.serviceSlug === entry.serviceSlug)) {
            return res.status(400).json({
                message: `An active integration already uses the slug "${entry.serviceSlug}" — rename or remove it before restoring this entry.`,
            });
        }
        // Singleton sub-services (e.g. Store Session (JWT)): restoring
        // must not create the second live entry the save path refuses.
        const definition = entry.subService ? getDefinition(entry.subService) : null;
        if (definition?.singleton) {
            const clash = live.find((item) => item.subService === definition.id);
            if (clash) {
                return res.status(400).json({
                    message: `"${definition.name}" is a single-configuration service — an entry already exists ("${clash.title}"). Remove it before restoring this one.`,
                });
            }
        }

        const restored = entry.toObject ? entry.toObject() : { ...entry };
        restored.deletedAt = null;
        restored.deletedBy = null;
        settings.set(
            'deletedIntegrations',
            trashed.filter((item) => String(item._id) !== String(req.params.id)),
        );
        settings.set('integrations', [...live, restored]);
        await settings.save();
        await refreshCredentials(true);
        res.json({ message: 'Item restored.' });
    } catch (error) {
        sendError(res, error, 400);
    }
};

// ── Permanent delete ────────────────────────────────────────────────
/** The storage entry a media record lives on — the same resolution
 *  the media routes use (its stamp, else its URL's cloud, else the
 *  original entry). */
const entryForMedia = async (media) => {
    const bySlug = await getStorageEntryBySlug(media?.storageEntry);
    if (bySlug) return bySlug;
    const parts = parseCloudinaryUrl(media?.url || '');
    const byCloud = parts ? await getStorageEntryByCloudName(parts.cloudName) : null;
    if (byCloud) return byCloud;
    return getDefaultStorageEntry();
};

const permanentlyDeleteItem = async (req, res) => {
    try {
        const segment = String(req.params.module || '').toLowerCase();
        if (segment === 'integrations') return permanentlyDeleteIntegration(req, res);
        const def = MODULES[segment];
        if (!def) return res.status(404).json({ message: 'Unknown module.' });

        const doc = await def.Model.findOne({ _id: req.params.id, ...TRASHED });
        if (!doc) {
            return res.status(404).json({ message: 'This item is not in Deleted Items.' });
        }

        // Media: the permanent delete is where the Cloudinary asset
        // is destroyed — the soft delete deliberately spared it so a
        // restore could bring the file back. Best effort, exactly
        // like the old hard delete: the record goes either way.
        if (segment === 'media' && doc.storageType === 'cloud' && doc.path) {
            try {
                const resourceType = doc.mimeType?.startsWith('video/')
                    ? 'video'
                    : doc.mimeType === 'application/pdf' || doc.mimeType === 'application/msword'
                      ? 'raw'
                      : 'image';
                const entry = await entryForMedia(doc);
                const creds = entry
                    ? { cloudName: entry.cloudName, apiKey: entry.apiKey, apiSecret: entry.apiSecret }
                    : null;
                await destroyAsset(doc.path, resourceType, creds);
            } catch {
                /* the record is still deleted below */
            }
        }

        await doc.deleteOne();
        res.json({ message: 'Item deleted permanently.' });
    } catch (error) {
        sendError(res, error, 500);
    }
};

const permanentlyDeleteIntegration = async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 });
        if (!settings) return res.status(404).json({ message: 'This item is not in Deleted Items.' });
        const trashed = settings.get('deletedIntegrations') || [];
        const entry = trashed.find((item) => String(item._id) === String(req.params.id));
        if (!entry) return res.status(404).json({ message: 'This item is not in Deleted Items.' });

        if (entry.usageType === 'PAYMENT' && req.user?.role !== 'Super Admin') {
            return res.status(403).json({ message: PAYMENT_SA_ONLY_MESSAGE });
        }

        settings.set(
            'deletedIntegrations',
            trashed.filter((item) => String(item._id) !== String(req.params.id)),
        );
        await settings.save();
        res.json({ message: 'Item deleted permanently.' });
    } catch (error) {
        sendError(res, error, 500);
    }
};

module.exports = {
    MODULES,
    listDeletedItems,
    restoreItem,
    permanentlyDeleteItem,
};
