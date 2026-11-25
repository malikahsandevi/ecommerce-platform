// ── Delete impact: link warnings + detach / re-link ───────────────
// Ahsan's order (2026-11-24): deleting a record must WARN how many
// things it is linked to, and on delete it is REMOVED from wherever
// it was used — his example: media must say how many products use
// it, and deleting it takes it out of those places.
//
// Three pieces share one reference model:
//   • computeDeleteImpact — the live links of a record, as labelled
//     counts for GET /api/:module/:id/delete-impact. Links are
//     either 'remove' (the delete detaches them) or 'keep'
//     (historical records — orders, reviews — which are NEVER
//     rewritten; the warning says their history stays).
//   • detachForDelete — runs at the moment of the soft delete:
//     performs every 'remove' detachment on LIVE records and
//     returns a snapshot of exactly what was taken from where.
//     The caller stores it on the trashed record as `deletedLinks`.
//   • relinkFromSnapshot — runs on restore from Deleted Items:
//     puts the snapshot's links back, conservatively — a gallery
//     entry returns at its original position unless the product
//     already references the media again; a product regains its
//     category/brand ONLY while it is still unassigned, so a newer
//     assignment made while the record was trashed always wins.
//     Permanent delete discards the snapshot with the record, and
//     records trashed before snapshots existed restore as before.
//
// Reference model (audited against the schemas and the media usage
// endpoint, which resolves the same links for its "Used In" list):
//   • A product uses a media item when a gallery entry points at it
//     by `images.mediaId`, or by URL — the legacy top-level `image`
//     mirror and gallery entries saved before mediaId existed only
//     carry the URL. Categories (`image`) and brands (`logo`) hold
//     a single image URL and no mediaId, so URL is their only link.
//   • Product.brand is OPTIONAL in the schema, so brands detach
//     exactly like categories (this supersedes the e006341 delete
//     block for both: warn + detach replaces refuse).
//   • A customer's product links live on the User record: cart
//     entries (`cart.product`), `favorites`, `liked`, `wishlist`.
//   • A customer's favorite categories live on the same record
//     (`favoriteCategories`, at most 3) — a category delete takes
//     the category out of those lists, and a restore puts it back
//     only for customers who have not re-added it meanwhile (and
//     only while their list still has room under the cap of 3).
//   • A review's media live on the Review record (`media`) as
//     Media ObjectIds — ids, not URLs, so a media delete matches
//     reviews by id alone (unlike product galleries, which match
//     by mediaId OR URL). A restore re-inserts the id at its
//     original positions unless the review references it again.
const { NOT_DELETED, applySoftDelete } = require('./softDelete');
const { roleHasPermission } = require('./permissions');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');

const link = (key, label, singular, count, action) => ({ key, label, singular, count, action });
const onlyCounted = (links) => links.filter((entry) => entry.count > 0);

// ── Media ↔ products ────────────────────────────────────────────────
const mediaProductFilter = (media) => {
    const or = [{ 'images.mediaId': media._id }];
    if (media.url) or.push({ image: media.url }, { 'images.url': media.url });
    return { $and: [{ $or: or }, NOT_DELETED] };
};

const entryReferencesMedia = (entry, media) => {
    if (!entry) return false;
    if (entry.mediaId && media._id && String(entry.mediaId) === String(media._id)) return true;
    return Boolean(media.url) && entry.url === media.url;
};

/** Restores the stored gallery contract after entries were removed
 *  or re-inserted: exactly one main (the first flagged entry, else
 *  the first entry), the main entry first, and the top-level `image`
 *  mirror pointing at the main entry's URL ('' when none remain) —
 *  the same shape productController.normalizeGallery writes. */
const normalizeStoredGallery = (product) => {
    const entries = (product.images || []).map((entry) =>
        entry && typeof entry.toObject === 'function' ? entry.toObject() : entry,
    );
    if (!entries.length) {
        product.images = [];
        product.image = '';
        return;
    }
    let mainIndex = entries.findIndex((entry) => entry.isMain || entry.isPrimary);
    if (mainIndex < 0) mainIndex = 0;
    const ordered = [entries[mainIndex], ...entries.filter((_, i) => i !== mainIndex)];
    ordered.forEach((entry, i) => {
        entry.isMain = i === 0;
        entry.isPrimary = i === 0;
    });
    product.images = ordered;
    product.image = ordered[0]?.url || '';
};

// ── Impact (the warning's numbers) ──────────────────────────────────
const computeDeleteImpact = async (moduleKey, doc) => {
    switch (moduleKey) {
        case 'media': {
            const [products, categories, brands, reviews] = await Promise.all([
                Product.countDocuments(mediaProductFilter(doc)),
                doc.url ? Category.countDocuments({ image: doc.url, ...NOT_DELETED }) : 0,
                doc.url ? Brand.countDocuments({ logo: doc.url, ...NOT_DELETED }) : 0,
                Review.countDocuments({ media: doc._id, ...NOT_DELETED }),
            ]);
            return onlyCounted([
                link('products', 'products', 'product', products, 'remove'),
                link('categories', 'categories', 'category', categories, 'remove'),
                link('brands', 'brands', 'brand', brands, 'remove'),
                link('reviews', 'reviews', 'review', reviews, 'remove'),
            ]);
        }
        case 'categories': {
            const [products, subcategories, favoriteLists, coupons] = await Promise.all([
                Product.countDocuments({ category: doc._id, ...NOT_DELETED }),
                Category.countDocuments({ parent: doc._id, ...NOT_DELETED }),
                User.countDocuments({ favoriteCategories: doc._id, ...NOT_DELETED }),
                Coupon.countDocuments({ applicableCategories: doc._id, ...NOT_DELETED }),
            ]);
            return onlyCounted([
                link('products', 'products', 'product', products, 'remove'),
                // 'promote': the children are not removed from
                // anywhere — losing their parent makes them main
                // categories, and the dialog says exactly that.
                link('subcategories', 'subcategories', 'subcategory', subcategories, 'promote'),
                link('favoriteCategories', 'favorite category lists', 'favorite category list', favoriteLists, 'remove'),
                link('coupons', 'coupons', 'coupon', coupons, 'remove'),
            ]);
        }
        case 'brands': {
            const products = await Product.countDocuments({ brand: doc._id, ...NOT_DELETED });
            return onlyCounted([link('products', 'products', 'product', products, 'remove')]);
        }
        case 'products': {
            const [carts, favoriteUsers, likedUsers, wishlists, orders, reviews, coupons] =
                await Promise.all([
                    User.countDocuments({ 'cart.product': doc._id, ...NOT_DELETED }),
                    User.find({ favorites: doc._id, ...NOT_DELETED }).distinct('_id'),
                    User.find({ liked: doc._id, ...NOT_DELETED }).distinct('_id'),
                    User.countDocuments({ wishlist: doc._id, ...NOT_DELETED }),
                    Order.countDocuments({ 'items.product': doc._id, ...NOT_DELETED }),
                    Review.countDocuments({ product: doc._id, ...NOT_DELETED }),
                    Coupon.countDocuments({ applicableProducts: doc._id, ...NOT_DELETED }),
                ]);
            // favorites + liked are one warning line ("favorites
            // lists") — a customer holding it in both counts once.
            const favorites = new Set([
                ...favoriteUsers.map(String),
                ...likedUsers.map(String),
            ]).size;
            return onlyCounted([
                link('carts', 'customer carts', 'customer cart', carts, 'remove'),
                link('favorites', 'favorites lists', 'favorites list', favorites, 'remove'),
                link('wishlists', 'wishlists', 'wishlist', wishlists, 'remove'),
                link('coupons', 'coupons', 'coupon', coupons, 'remove'),
                link('orders', 'orders', 'order', orders, 'keep'),
                link('reviews', 'reviews', 'review', reviews, 'keep'),
            ]);
        }
        case 'coupons': {
            const orders = await Order.countDocuments({ coupon: doc._id, ...NOT_DELETED });
            return onlyCounted([link('orders', 'orders', 'order', orders, 'keep')]);
        }
        case 'customers': {
            const [orders, reviews, coupons] = await Promise.all([
                Order.countDocuments({ user: doc._id, ...NOT_DELETED }),
                Review.countDocuments({ user: doc._id, ...NOT_DELETED }),
                Coupon.countDocuments({ applicableUsers: doc._id, ...NOT_DELETED }),
            ]);
            return onlyCounted([
                link('coupons', 'coupons', 'coupon', coupons, 'remove'),
                link('orders', 'orders', 'order', orders, 'keep'),
                link('reviews', 'reviews', 'review', reviews, 'keep'),
            ]);
        }
        default:
            return [];
    }
};

// ── Detach (at soft-delete time) ────────────────────────────────────
const detachMedia = async (media) => {
    const snapshot = { products: [], categories: [], brands: [], reviews: [] };

    const products = await Product.find(mediaProductFilter(media));
    for (const product of products) {
        const removed = [];
        const kept = [];
        (product.images || []).forEach((entry, index) => {
            if (entryReferencesMedia(entry, media)) {
                removed.push({ index, entry: entry.toObject() });
            } else {
                kept.push(entry);
            }
        });
        // The legacy single-image mirror can point at the media with
        // no gallery entry carrying it — that link must go too.
        const mirror = Boolean(media.url) && product.image === media.url;
        if (!removed.length && !mirror) continue;
        snapshot.products.push({
            product: String(product._id),
            entries: removed,
            mirror,
        });
        product.images = kept;
        normalizeStoredGallery(product);
        // eslint-disable-next-line no-await-in-loop
        await product.save();
    }

    if (media.url) {
        const categories = await Category.find({ image: media.url, ...NOT_DELETED }).select('_id');
        if (categories.length) {
            snapshot.categories = categories.map((category) => String(category._id));
            await Category.updateMany(
                { _id: { $in: snapshot.categories } },
                { $set: { image: '' } },
            );
        }
        const brands = await Brand.find({ logo: media.url, ...NOT_DELETED }).select('_id');
        if (brands.length) {
            snapshot.brands = brands.map((brand) => String(brand._id));
            await Brand.updateMany(
                { _id: { $in: snapshot.brands } },
                { $set: { logo: '' } },
            );
        }
    }

    // Reviews reference the media by id (Review.media) — take the id
    // out of every live review, remembering the positions it held.
    const reviews = await Review.find({ media: media._id, ...NOT_DELETED });
    for (const review of reviews) {
        const indices = [];
        (review.media || []).forEach((id, index) => {
            if (String(id) === String(media._id)) indices.push(index);
        });
        if (!indices.length) continue;
        snapshot.reviews.push({ review: String(review._id), indices });
        review.media = review.media.filter((id) => String(id) !== String(media._id));
        // eslint-disable-next-line no-await-in-loop
        await review.save();
    }

    return snapshot.products.length ||
        snapshot.categories.length ||
        snapshot.brands.length ||
        snapshot.reviews.length
        ? snapshot
        : null;
};

const detachCategory = async (category) => {
    const [productIds, subcategoryIds, favoriteUserIds, couponIds] = await Promise.all([
        Product.find({ category: category._id, ...NOT_DELETED }).distinct('_id'),
        Category.find({ parent: category._id, ...NOT_DELETED }).distinct('_id'),
        User.find({ favoriteCategories: category._id, ...NOT_DELETED }).distinct('_id'),
        Coupon.find({ applicableCategories: category._id, ...NOT_DELETED }).distinct('_id'),
    ]);
    if (!productIds.length && !subcategoryIds.length && !favoriteUserIds.length && !couponIds.length) return null;
    if (productIds.length) {
        await Product.updateMany(
            { _id: { $in: productIds } },
            { $set: { category: null } },
        );
    }
    if (subcategoryIds.length) {
        await Category.updateMany(
            { _id: { $in: subcategoryIds } },
            { $set: { parent: null } },
        );
    }
    if (favoriteUserIds.length) {
        await User.updateMany(
            { _id: { $in: favoriteUserIds } },
            { $pull: { favoriteCategories: category._id } },
        );
    }
    // Coupon scopes are a use, not history: the category leaves
    // every coupon's applicableCategories (snapshot restores it).
    if (couponIds.length) {
        await Coupon.updateMany(
            { _id: { $in: couponIds } },
            { $pull: { applicableCategories: category._id } },
        );
    }
    return {
        products: productIds.map(String),
        subcategories: subcategoryIds.map(String),
        favoriteCategories: favoriteUserIds.map(String),
        coupons: couponIds.map(String),
    };
};

const detachBrand = async (brand) => {
    const productIds = await Product.find({ brand: brand._id, ...NOT_DELETED }).distinct('_id');
    if (!productIds.length) return null;
    await Product.updateMany(
        { _id: { $in: productIds } },
        { $set: { brand: null } },
    );
    return { products: productIds.map(String) };
};

const detachProduct = async (product) => {
    const users = await User.find({
        $and: [
            {
                $or: [
                    { 'cart.product': product._id },
                    { favorites: product._id },
                    { liked: product._id },
                    { wishlist: product._id },
                ],
            },
            NOT_DELETED,
        ],
    });
    const snapshot = { cart: [], favorites: [], liked: [], wishlist: [] };
    const isProduct = (id) => String(id) === String(product._id);

    for (const user of users) {
        let changed = false;
        const cartEntry = (user.cart || []).find(
            (entry) => entry.product && isProduct(entry.product),
        );
        if (cartEntry) {
            snapshot.cart.push({
                user: String(user._id),
                quantity: cartEntry.quantity || 1,
            });
            user.cart = user.cart.filter(
                (entry) => !(entry.product && isProduct(entry.product)),
            );
            changed = true;
        }
        for (const field of ['favorites', 'liked', 'wishlist']) {
            if ((user[field] || []).some(isProduct)) {
                snapshot[field].push(String(user._id));
                user[field] = user[field].filter((id) => !isProduct(id));
                changed = true;
            }
        }
        // eslint-disable-next-line no-await-in-loop
        if (changed) await user.save();
    }

    // Coupon scopes: the product leaves every coupon's
    // applicableProducts (snapshot restores it).
    const couponIds = await Coupon.find({ applicableProducts: product._id, ...NOT_DELETED }).distinct('_id');
    if (couponIds.length) {
        snapshot.coupons = couponIds.map(String);
        await Coupon.updateMany(
            { _id: { $in: couponIds } },
            { $pull: { applicableProducts: product._id } },
        );
    }

    return snapshot.cart.length ||
        snapshot.favorites.length ||
        snapshot.liked.length ||
        snapshot.wishlist.length ||
        snapshot.coupons?.length
        ? snapshot
        : null;
};

/** A customer's only detachable link is coupon scoping — their
 *  orders and reviews are history and are never touched. */
const detachCustomer = async (customer) => {
    const couponIds = await Coupon.find({ applicableUsers: customer._id, ...NOT_DELETED }).distinct('_id');
    if (!couponIds.length) return null;
    await Coupon.updateMany(
        { _id: { $in: couponIds } },
        { $pull: { applicableUsers: customer._id } },
    );
    return { coupons: couponIds.map(String) };
};

/** Performs the module's detachments and returns the snapshot to
 *  store on the trashed record (null when nothing was linked). */
const detachForDelete = async (moduleKey, doc) => {
    switch (moduleKey) {
        case 'media':
            return detachMedia(doc);
        case 'categories':
            return detachCategory(doc);
        case 'brands':
            return detachBrand(doc);
        case 'products':
            return detachProduct(doc);
        case 'customers':
            return detachCustomer(doc);
        default:
            return null;
    }
};

// ── Re-link (at restore time) ───────────────────────────────────────

/** Coupon scopes regain an id only where it is not already back —
 *  a coupon re-scoped by hand while the record was trashed is never
 *  duplicated. */
const relinkCouponScope = async (couponIds, field, id) => {
    if (!couponIds?.length) return;
    await Coupon.updateMany(
        { _id: { $in: couponIds }, [field]: { $ne: id } },
        { $push: { [field]: id } },
    );
};
const relinkMedia = async (media, snapshot) => {
    for (const item of snapshot.products || []) {
        // eslint-disable-next-line no-await-in-loop
        const product = await Product.findById(item.product);
        if (!product) continue;
        let changed = false;
        const alreadyLinked = (product.images || []).some((entry) =>
            entryReferencesMedia(entry, media),
        );
        if (!alreadyLinked && item.entries?.length) {
            const entries = (product.images || []).map((entry) =>
                entry && typeof entry.toObject === 'function' ? entry.toObject() : entry,
            );
            const sorted = [...item.entries].sort((a, b) => a.index - b.index);
            for (const { index, entry } of sorted) {
                const at = Math.max(0, Math.min(index, entries.length));
                entries.splice(at, 0, entry);
            }
            product.images = entries;
            normalizeStoredGallery(product);
            changed = true;
        }
        // Legacy mirror link: only when the gallery carries nothing
        // and no newer main image was chosen meanwhile.
        if (item.mirror && !(product.images || []).length && !product.image && media.url) {
            product.image = media.url;
            changed = true;
        }
        // eslint-disable-next-line no-await-in-loop
        if (changed) await product.save();
    }

    // Category/brand images come back only into a still-empty slot —
    // an image picked while the media was trashed is never replaced.
    // ($in with '' and null matches empty, null and missing alike.)
    const emptyImage = { $in: ['', null] };
    for (const id of snapshot.categories || []) {
        // eslint-disable-next-line no-await-in-loop
        await Category.updateOne(
            { _id: id, image: emptyImage },
            { $set: { image: media.url } },
        );
    }
    for (const id of snapshot.brands || []) {
        // eslint-disable-next-line no-await-in-loop
        await Brand.updateOne(
            { _id: id, logo: emptyImage },
            { $set: { logo: media.url } },
        );
    }

    // Reviews regain the media id at its original positions, unless
    // the review already references it again (added back meanwhile).
    for (const item of snapshot.reviews || []) {
        // eslint-disable-next-line no-await-in-loop
        const review = await Review.findById(item.review);
        if (!review) continue;
        if ((review.media || []).some((id) => String(id) === String(media._id))) continue;
        const ids = [...(review.media || [])];
        const sorted = [...(item.indices || [])].sort((a, b) => a - b);
        for (const index of sorted) {
            const at = Math.max(0, Math.min(index, ids.length));
            ids.splice(at, 0, media._id);
        }
        review.media = ids;
        // eslint-disable-next-line no-await-in-loop
        await review.save();
    }
};

const relinkCategory = async (category, snapshot) => {
    // Only records that are STILL unassigned get the link back — a
    // product recategorized (or a subcategory re-parented) while this
    // category sat in Deleted Items keeps its newer assignment.
    if (snapshot.products?.length) {
        await Product.updateMany(
            { _id: { $in: snapshot.products }, category: null },
            { $set: { category: category._id } },
        );
    }
    if (snapshot.subcategories?.length) {
        await Category.updateMany(
            { _id: { $in: snapshot.subcategories }, parent: null },
            { $set: { parent: category._id } },
        );
    }
    // Favorite lists regain the category only for customers who
    // still exist, have not re-added it meanwhile, and still have
    // room under the favorite-categories cap (3) — a list the
    // customer refilled while the category was trashed is left as
    // they made it.
    for (const userId of snapshot.favoriteCategories || []) {
        // eslint-disable-next-line no-await-in-loop
        const user = await User.findById(userId);
        if (!user) continue;
        const current = user.favoriteCategories || [];
        if (current.some((id) => String(id) === String(category._id))) continue;
        if (current.length >= 3) continue;
        current.push(category._id);
        user.favoriteCategories = current;
        // eslint-disable-next-line no-await-in-loop
        await user.save();
    }
    await relinkCouponScope(snapshot.coupons, 'applicableCategories', category._id);
};

const relinkBrand = async (brand, snapshot) => {
    if (snapshot.products?.length) {
        await Product.updateMany(
            { _id: { $in: snapshot.products }, brand: null },
            { $set: { brand: brand._id } },
        );
    }
};

const relinkProduct = async (product, snapshot) => {
    const isProduct = (id) => String(id) === String(product._id);
    for (const entry of snapshot.cart || []) {
        // eslint-disable-next-line no-await-in-loop
        const user = await User.findById(entry.user);
        if (!user) continue;
        if (!(user.cart || []).some((item) => item.product && isProduct(item.product))) {
            user.cart.push({ product: product._id, quantity: entry.quantity || 1 });
            // eslint-disable-next-line no-await-in-loop
            await user.save();
        }
    }
    for (const field of ['favorites', 'liked', 'wishlist']) {
        for (const userId of snapshot[field] || []) {
            // eslint-disable-next-line no-await-in-loop
            const user = await User.findById(userId);
            if (!user) continue;
            if (!(user[field] || []).some(isProduct)) {
                user[field].push(product._id);
                // eslint-disable-next-line no-await-in-loop
                await user.save();
            }
        }
    }
    await relinkCouponScope(snapshot.coupons, 'applicableProducts', product._id);
};

const relinkCustomer = async (customer, snapshot) => {
    await relinkCouponScope(snapshot.coupons, 'applicableUsers', customer._id);
};

/** Re-applies a snapshot taken by detachForDelete. Modules without
 *  detachments (coupons, reviews, orders) never reach here — their
 *  links are history and were never removed. */
const relinkFromSnapshot = async (moduleKey, doc, snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    switch (moduleKey) {
        case 'media':
            return relinkMedia(doc, snapshot);
        case 'categories':
            return relinkCategory(doc, snapshot);
        case 'brands':
            return relinkBrand(doc, snapshot);
        case 'products':
            return relinkProduct(doc, snapshot);
        case 'customers':
            return relinkCustomer(doc, snapshot);
        default:
            return undefined;
    }
};

// ── Delete All (cascade) ────────────────────────────────────────────
// Ahsan's settled design (Part 5): the delete dialog's third button.
// Delete All soft-deletes the record AND its containment-linked
// records — each landing in Deleted Items, individually restorable,
// each running its own detach so its links snapshot too. Containment
// only: Category → its subcategories (recursively) + the products in
// it and in those subcategories (+ those products' reviews); Brand →
// its products (+ their reviews); Product → its reviews; Customer →
// their reviews. Reference links (coupon scopes, media usages,
// carts/wishlists/favorites) are DETACH-only — never cascaded.
// ORDERS ARE NEVER DELETED — not here, not anywhere in this flow.

const CASCADE_MODELS = { categories: Category, products: Product, reviews: Review };

const cascadeGroup = (module, permissionModule, label, singular, ids) => ({
    module,
    permissionModule,
    label,
    singular,
    ids: [...new Set(ids.map(String))],
});

/** The full cascade set for a record, grouped by module. Computed
 *  fresh at preview time AND again at execution time — the client
 *  never supplies the set. */
const collectCascade = async (moduleKey, doc) => {
    switch (moduleKey) {
        case 'categories': {
            const descendantIds = [];
            let frontier = [doc._id];
            while (frontier.length) {
                // eslint-disable-next-line no-await-in-loop
                const kids = await Category.find({ parent: { $in: frontier }, ...NOT_DELETED }).distinct('_id');
                if (!kids.length) break;
                descendantIds.push(...kids);
                frontier = kids;
            }
            const productIds = await Product.find({
                category: { $in: [doc._id, ...descendantIds] },
                ...NOT_DELETED,
            }).distinct('_id');
            const reviewIds = productIds.length
                ? await Review.find({ product: { $in: productIds }, ...NOT_DELETED }).distinct('_id')
                : [];
            return [
                cascadeGroup('categories', 'Categories', 'subcategories', 'subcategory', descendantIds),
                cascadeGroup('products', 'Products', 'products', 'product', productIds),
                cascadeGroup('reviews', 'Reviews', 'reviews', 'review', reviewIds),
            ].filter((group) => group.ids.length);
        }
        case 'brands': {
            const productIds = await Product.find({ brand: doc._id, ...NOT_DELETED }).distinct('_id');
            const reviewIds = productIds.length
                ? await Review.find({ product: { $in: productIds }, ...NOT_DELETED }).distinct('_id')
                : [];
            return [
                cascadeGroup('products', 'Products', 'products', 'product', productIds),
                cascadeGroup('reviews', 'Reviews', 'reviews', 'review', reviewIds),
            ].filter((group) => group.ids.length);
        }
        case 'products': {
            const reviewIds = await Review.find({ product: doc._id, ...NOT_DELETED }).distinct('_id');
            return [
                cascadeGroup('reviews', 'Reviews', 'reviews', 'review', reviewIds),
            ].filter((group) => group.ids.length);
        }
        case 'customers': {
            if (doc.role !== 'Customer') return [];
            const reviewIds = await Review.find({ user: doc._id, ...NOT_DELETED }).distinct('_id');
            return [
                cascadeGroup('reviews', 'Reviews', 'reviews', 'review', reviewIds),
            ].filter((group) => group.ids.length);
        }
        default:
            return [];
    }
};

/** Preview for the dialog: counts by module, each flagged with
 *  whether the caller's role may delete that module at all. Modules
 *  the caller cannot delete are EXCLUDED from the execution and the
 *  dialog states that plainly (show, don't remove). */
const computeCascadePreview = async (moduleKey, doc, role) => {
    const groups = await collectCascade(moduleKey, doc);
    const preview = [];
    for (const group of groups) {
        preview.push({
            module: group.module,
            label: group.label,
            singular: group.singular,
            count: group.ids.length,
            // eslint-disable-next-line no-await-in-loop
            allowed: await roleHasPermission(role, group.permissionModule, 'delete'),
        });
    }
    return preview;
};

/** The one soft-delete path every delete flow shares: detach (with
 *  snapshot) + stamp + save. */
const softDeleteRecord = async (Model, moduleKey, doc, userId) => {
    const snapshot = await detachForDelete(moduleKey, doc);
    if (snapshot) doc.set('deletedLinks', snapshot);
    applySoftDelete(Model, doc, userId);
    await doc.save();
};

/** Soft-deletes pre-collected cascade groups, deepest records first
 *  (reviews, then products, then categories) so a parent record's own
 *  detach always sees its children still in place. Records already
 *  gone are skipped. Returns the per-module counts deleted. */
const cascadeDeleteRecords = async (groups, userId) => {
    const order = { reviews: 0, products: 1, categories: 2 };
    const sorted = [...groups].sort((a, b) => (order[a.module] ?? 3) - (order[b.module] ?? 3));
    const deleted = {};
    for (const group of sorted) {
        const Model = CASCADE_MODELS[group.module];
        if (!Model) continue;
        let count = 0;
        for (const id of group.ids) {
            // eslint-disable-next-line no-await-in-loop
            const doc = await Model.findOne({ _id: id, ...NOT_DELETED });
            if (!doc) continue;
            // eslint-disable-next-line no-await-in-loop
            await softDeleteRecord(Model, group.module, doc, userId);
            count += 1;
        }
        if (count) deleted[group.module] = count;
    }
    return deleted;
};

module.exports = {
    computeDeleteImpact,
    detachForDelete,
    relinkFromSnapshot,
    collectCascade,
    computeCascadePreview,
    softDeleteRecord,
    cascadeDeleteRecords,
};
