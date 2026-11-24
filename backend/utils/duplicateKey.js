// Duplicate unique-field errors (MongoDB E11000) must reach the
// caller as a clean, human sentence — never as the raw driver text
// ("E11000 duplicate key error collection: … index: slug_1 dup key…"),
// which the panel would otherwise toast verbatim. The field name is
// read from the error's keyValue/keyPattern when present.
const FIELD_LABELS = {
    slug: 'slug',
    sku: 'SKU',
    code: 'code',
    email: 'email',
    username: 'username',
    orderNumber: 'order number',
    publicId: 'public code',
};

const duplicateKeyField = (error) => {
    if (!error || error.code !== 11000) return null;
    const source = error.keyValue || error.keyPattern || {};
    const field = Object.keys(source)[0];
    if (field) return field;
    // Fall back to parsing the index name out of the message.
    const match = /index: ([A-Za-z0-9]+)_1\b/.exec(error.message || '');
    return match ? match[1] : null;
};

const duplicateKeyMessage = (error, noun = 'record') => {
    const field = duplicateKeyField(error);
    if (!field) return null;
    const label = FIELD_LABELS[field] || field;
    return `Another ${noun} already uses this ${label} — change it and try again.`;
};

module.exports = { duplicateKeyField, duplicateKeyMessage };
