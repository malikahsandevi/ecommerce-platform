const crypto = require('crypto');

// Short public codes: exactly 6 characters of CAPITAL letters + digits
// (e.g. "K7X2PA"). Raw Mongo ObjectIds are unusable for humans — nobody
// can read one over the phone or type it into a search box — so every
// main resource carries one of these as its public identifier. `_id`
// stays the internal key; relations and routes are unchanged.
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

const randomCode = () => {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return code;
};

/** Generates a code that is unique within the given model's collection. */
const generateUniqueCode = async (Model, field = 'code') => {
    for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = randomCode();
        // eslint-disable-next-line no-await-in-loop
        if (!(await Model.exists({ [field]: candidate }))) return candidate;
    }
    // Astronomically unlikely with 36^6 combinations — fail loudly rather
    // than loop forever.
    throw new Error('Could not generate a unique code — please retry.');
};

/**
 * Adds the `code` field + generation hook + backfill helper to a schema.
 * - Field: unique + sparse (legacy rows without a code must not collide
 *   on the unique index before they are backfilled).
 * - pre('save'): new documents get a code automatically, on every create
 *   path (generic create, register, direct model saves).
 * - Model.withCodes(docs): serializer helper — any fetched document that
 *   is missing a code gets one generated AND persisted (updateOne), so
 *   simply reading the live list endpoints backfills legacy records
 *   without a migration script. Works for mongoose documents and lean
 *   objects alike.
 * - Option `{ field }`: stores the public code under a different field
 *   name when `code` is already taken by the resource itself — Coupon,
 *   whose `code` is the customer-facing redeem code, keeps its public
 *   ID in `publicId` under exactly the same rules.
 */
const addCodeSupport = (schema, { field = 'code' } = {}) => {
    schema.add({
        [field]: {
            type: String,
            unique: true,
            sparse: true,
            uppercase: true,
            trim: true,
        },
    });
    schema.pre('save', async function () {
        if (this[field] && CODE_PATTERN.test(this[field])) return;
        this[field] = await generateUniqueCode(this.constructor, field);
    });

    schema.statics.withCodes = async function (docs) {
        if (!docs) return docs;
        const list = Array.isArray(docs) ? docs : [docs];
        for (const doc of list) {
            if (!doc) continue;
            const current = typeof doc.get === 'function' ? doc.get(field) : doc[field];
            if (current && CODE_PATTERN.test(current)) continue;
            // eslint-disable-next-line no-await-in-loop
            const code = await generateUniqueCode(this, field);
            // eslint-disable-next-line no-await-in-loop
            await this.updateOne({ _id: doc._id }, { $set: { [field]: code } });
            if (typeof doc.set === 'function') doc.set(field, code);
            else doc[field] = code;
        }
        return docs;
    };
};

module.exports = { addCodeSupport, generateUniqueCode, CODE_PATTERN };
