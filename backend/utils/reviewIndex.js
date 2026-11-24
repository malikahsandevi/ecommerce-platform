// ── Review (user, product) index migration ──────────────────────────
// Reviews originally carried a plain unique (user, product) index.
// A soft-deleted review keeps its user/product pair, so that index
// made a trashed review block the customer from ever posting a fresh
// review for the same product — and the refusal pointed at a review
// sitting in Deleted Items, invisible to everyone. The schema now
// declares a PARTIAL unique index over live reviews only
// (models/Review.js), but MongoDB never replaces an existing index
// whose options differ, so the legacy index has to be dropped once,
// here, and the partial one ensured in its place.
//
// Idempotent and narrowly targeted, in the same once-per-process
// shape as the credentials migration (utils/credentials.js): only an
// index on exactly { user: 1, product: 1 } that is unique WITHOUT a
// partial filter counts as the legacy one — no blanket index sync,
// no other index is ever dropped. A failure is logged and retried on
// the next request; it never blocks the request that triggered it.
const Review = require('../models/Review');

let migrated = false;
let migrationPromise = null;

const isLegacyPairIndex = (index) => {
    const key = index.key || {};
    return (
        index.unique === true &&
        !index.partialFilterExpression &&
        Object.keys(key).length === 2 &&
        key.user === 1 &&
        key.product === 1
    );
};

const ensureReviewIndex = async () => {
    if (migrated) return;
    if (!migrationPromise) {
        migrationPromise = (async () => {
            const collection = Review.collection;
            const indexes = await collection.indexes();
            for (const index of indexes) {
                if (isLegacyPairIndex(index)) {
                    // eslint-disable-next-line no-await-in-loop
                    await collection.dropIndex(index.name);
                }
            }
            await collection.createIndex(
                { user: 1, product: 1 },
                { unique: true, partialFilterExpression: { deletedAt: null } },
            );
            migrated = true;
        })().catch((error) => {
            console.error(`Review index migration failed: ${error.message}`);
            migrationPromise = null;
        });
    }
    return migrationPromise;
};

module.exports = { ensureReviewIndex };
