const mongoose = require('mongoose');

// ── Soft delete (Ahsan's order) ─────────────────────────────────────
// Deleting in the admin no longer removes a record: it is stamped
// with `deletedAt` / `deletedBy` and disappears from every module
// read — lists, details, search, dashboard counts, data export,
// notifications. The record waits in Settings → Deleted Items until
// it is restored or permanently deleted there (controllers/trash).
//
// Business-unique values (a product's slug/SKU, a coupon's redeem
// code, an account's email/username, …) would otherwise stay locked
// by their unique indexes while the record sits in the trash, so a
// fresh record could never reuse them. On soft delete those values
// are swapped for a per-record tombstone and the originals are kept
// in `deletedUniques`; restore puts the originals back, refusing with
// a clear message when another record has taken one meanwhile.
// Server-generated public codes (the 6-char `code` / `publicId`) are
// NOT tombstoned: generation already checks the whole collection, so
// a new record can never collide with a trashed one, and a restored
// record keeps its original public code.

/** Fields whose unique index would block re-creation while trashed. */
const UNIQUE_FIELDS = {
    Product: ['slug', 'sku'],
    Category: ['slug'],
    Brand: ['slug'],
    Coupon: ['code'],
    User: ['email', 'username'],
};

/** Query fragment matching every record that is NOT soft-deleted
 *  (legacy records carry no `deletedAt` field at all — a null match
 *  covers missing and null alike). */
const NOT_DELETED = { deletedAt: null };

const tombstoneFor = (field, id) => {
    const hex = String(id);
    switch (field) {
        case 'email':
            return `deleted-${hex}@deleted.invalid`;
        case 'username':
            // The username column caps at 30 characters.
            return `del_${hex}`.slice(0, 30);
        case 'code':
            // Coupon redeem codes are stored uppercase.
            return `DELETED-${hex}`;
        default:
            return `deleted-${hex}`;
    }
};

/** Adds the soft-delete fields to a module schema. */
const addSoftDeleteSupport = (schema) => {
    schema.add({
        deletedAt: { type: Date, default: null },
        deletedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        // Original business-unique values, keyed by field name, kept
        // only while the record is trashed (see the header note).
        deletedUniques: { type: Map, of: String },
    });
    schema.index({ deletedAt: 1 });
};

/** True for models that carry the soft-delete fields — lets shared
 *  code (the generic controller) soft-delete those models and keep
 *  hard-deleting the rest exactly as before. */
const supportsSoftDelete = (Model) => Boolean(Model?.schema?.path('deletedAt'));

/** Stamps the record deleted and tombstones its business-unique
 *  values. The caller saves. */
const applySoftDelete = (Model, doc, userId) => {
    const fields = UNIQUE_FIELDS[Model.modelName] || [];
    const originals = {};
    for (const field of fields) {
        const value = doc.get(field);
        if (typeof value === 'string' && value) {
            originals[field] = value;
            doc.set(field, tombstoneFor(field, doc._id));
        }
    }
    if (Object.keys(originals).length) doc.set('deletedUniques', originals);
    doc.set('deletedAt', new Date());
    doc.set('deletedBy', userId || null);
    return doc;
};

/** Works out which values a restore must put back. Throws a clear
 *  Error when another record now holds one of the originals — the
 *  restore must never steal a live record's slug/code/email. */
const planRestore = async (Model, doc) => {
    const stored = doc.get('deletedUniques');
    const originals = {};
    if (stored) {
        // A Mongoose Map (document reads) iterates like a native
        // Map; a lean/plain object spreads. Spreading a Map would
        // silently yield nothing, so the Map path must come first.
        if (typeof stored.forEach === 'function') {
            stored.forEach((value, key) => {
                originals[key] = value;
            });
        } else if (typeof stored === 'object') {
            Object.assign(originals, stored);
        }
    }
    const restore = {};
    for (const [field, value] of Object.entries(originals)) {
        // eslint-disable-next-line no-await-in-loop
        const clash = await Model.exists({ [field]: value, _id: { $ne: doc._id } });
        if (clash) {
            throw new Error(
                `Another record now uses this ${field} ("${value}") — rename that record, or permanently delete this item instead of restoring it.`,
            );
        }
        restore[field] = value;
    }
    return restore;
};

/** Puts the originals back and clears the trash stamps. The caller
 *  saves (and runs any module side effects, e.g. order stock). */
const applyRestore = (doc, restoreValues) => {
    for (const [field, value] of Object.entries(restoreValues)) {
        doc.set(field, value);
    }
    doc.set('deletedUniques', undefined);
    doc.set('deletedAt', null);
    doc.set('deletedBy', null);
    return doc;
};

module.exports = {
    UNIQUE_FIELDS,
    NOT_DELETED,
    addSoftDeleteSupport,
    supportsSoftDelete,
    applySoftDelete,
    planRestore,
    applyRestore,
};
