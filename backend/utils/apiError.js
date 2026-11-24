// The ONE translator between thrown errors and API responses.
//
// Ahsan's standing toast rule — "toast me details na do, sirf main
// point do" — starts here: a raw system error must never leave this
// API, because whatever the API sends is what the panel toasts. A
// Mongoose dump ("Order validation failed: billingAddress.zipCode:
// Path `billingAddress.zipCode` is required., …") reached a toast
// verbatim once; this module exists so that class of leak is closed
// at the source, in every controller, middleware and route.
//
// What passes through BYTE-IDENTICAL: the deliberate, hand-written
// human sentences this codebase throws on purpose — coupon refusals,
// stock refusals, "Fill these fields: …", delete guards, sync
// outcomes. Those are plain Errors (or status-carrying RunnerErrors)
// with clean messages, raised inside a 4xx catch that exists to relay
// them. What gets translated: Mongoose/MongoDB-shaped errors, body
// parser failures, and anything unexpected — those become ONE short
// main-point sentence, with the real error logged server-side only.
const { duplicateKeyMessage } = require('./duplicateKey');

const REQUIRED_FIELDS_MESSAGE = 'Please fill all required fields.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NOT_FOUND_MESSAGE = 'Record not found.';

// Shapes that mark a message as system text rather than a human
// sentence written for the caller.
const TECHNICAL_PATTERNS = [
    /Path\s+`/, // Mongoose validator text: Path `x` is required.
    /validation failed/i, // "Order validation failed: …"
    /Cast to\s/i, // "Cast to ObjectId failed for value …"
    /E11000/, // raw duplicate-key driver text
    /duplicate key error/i,
    /Mongo(Server|Network|Parse|WriteConcern|Topology)?Error/,
    /BSON(Type)?Error/,
    /SyntaxError/,
    /\n\s*at\s+[\w$.<>]+\s*\(/, // a stack-trace frame
    /^\s*\{"/, // a JSON dump standing in for a message
];

const isTechnicalMessage = (message) =>
    typeof message === 'string' &&
    TECHNICAL_PATTERNS.some((pattern) => pattern.test(message));

// "billingAddress.zipCode" → "ZIP code"; "salePrice" → "Sale price".
// Only the leaf segment is named — the sentence stays a main point.
const FIELD_LABELS = {
    zipCode: 'ZIP code',
    sku: 'SKU',
    url: 'URL',
    email: 'Email',
};

const fieldLabel = (path) => {
    const segments = String(path || '').split('.').filter((part) => !/^\d+$/.test(part));
    const leaf = segments[segments.length - 1] || 'Field';
    if (FIELD_LABELS[leaf]) return FIELD_LABELS[leaf];
    const words = leaf
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Field';
};

// Leaf validator failures of a Mongoose ValidationError, flattened
// (a nested subdocument error carries its own `errors` map).
const leafErrors = (errors, out = []) => {
    Object.values(errors || {}).forEach((entry) => {
        if (!entry) return;
        if (entry.errors && !entry.kind) leafErrors(entry.errors, out);
        else out.push(entry);
    });
    return out;
};

const validationErrorMessage = (error) => {
    const failures = leafErrors(error?.errors);
    if (!failures.length) return REQUIRED_FIELDS_MESSAGE;
    // Missing fields are the main point whenever any are missing —
    // the exact short sentence Ahsan ordered for that case.
    if (failures.some((entry) => entry.kind === 'required')) {
        return REQUIRED_FIELDS_MESSAGE;
    }
    const first = failures[0];
    const label = fieldLabel(first.path);
    const props = first.properties || {};
    switch (first.kind) {
        case 'min':
            return `${label} must be at least ${props.min}.`;
        case 'max':
            return `${label} must be at most ${props.max}.`;
        case 'minlength':
            return `${label} must be at least ${props.minlength} characters.`;
        case 'maxlength':
            return `${label} must be at most ${props.maxlength} characters.`;
        case 'enum':
            return `${label} has an invalid value.`;
        case 'match':
        case 'regexp':
            return `${label} has an invalid format.`;
        case 'Number':
            return `${label} must be a number.`;
        default:
            return `${label} is invalid.`;
    }
};

// translateError(error, options) → { status, message }
// options: a status number, or { status, noun } — `status` is the
// calling catch block's own intended status (its context: a 4xx catch
// relays deliberate refusals; a 5xx catch is the unexpected path),
// `noun` names the record for duplicate-key sentences.
const translateError = (error, options = {}) => {
    const opts = typeof options === 'number' ? { status: options } : options || {};
    const fallbackStatus = Number(opts.status) || null;
    const noun = opts.noun || 'record';

    if (!error) return { status: fallbackStatus || 500, message: GENERIC_MESSAGE };

    // Duplicate unique value — the established clean sentence.
    if (error.code === 11000) {
        return {
            status: fallbackStatus && fallbackStatus < 500 ? fallbackStatus : 400,
            message:
                duplicateKeyMessage(error, noun) ||
                'Another record already uses this value — change it and try again.',
        };
    }

    if (error.name === 'ValidationError') {
        return { status: 400, message: validationErrorMessage(error) };
    }

    // A malformed ObjectId names no record — "not found", never the
    // raw "Cast to ObjectId failed…" text.
    if (error.name === 'CastError') {
        return { status: 404, message: NOT_FOUND_MESSAGE };
    }

    // Body-parser failures.
    if (error.type === 'entity.parse.failed') {
        return { status: 400, message: 'Invalid request format.' };
    }
    if (error.type === 'entity.too.large') {
        return { status: 413, message: 'Request body is too large.' };
    }

    // The Store Session switch-off error carries its own deliberate
    // sentence (callers turn it into a clean 403).
    if (error.code === 'JWT_SIGNING_DISABLED' && typeof error.message === 'string') {
        return { status: fallbackStatus || 403, message: error.message };
    }

    // Status-carrying errors (RunnerError and friends) were built to
    // be relayed — pass them through unless the text is system-shaped.
    const explicitStatus = Number(error.status || error.statusCode);
    if (explicitStatus >= 400 && explicitStatus < 600) {
        const message = typeof error.message === 'string' ? error.message : '';
        return {
            status: explicitStatus,
            message: message && !isTechnicalMessage(message) ? message : GENERIC_MESSAGE,
        };
    }

    // A plain Error with a clean sentence, caught by a 4xx catch, is
    // this codebase's deliberate-refusal channel — byte-identical.
    const message = typeof error.message === 'string' ? error.message : '';
    const isPlain = !error.name || error.name === 'Error';
    if (isPlain && message && !isTechnicalMessage(message)) {
        if (fallbackStatus && fallbackStatus < 500) {
            return { status: fallbackStatus, message };
        }
    }

    // Everything else is unexpected: one short sentence for the
    // caller, the real error for the server log (see sendError).
    return { status: 500, message: GENERIC_MESSAGE };
};

// Message-only translation, for the rare spots that embed a failure
// inside a larger payload (per-item results) instead of answering
// with it directly.
const translateErrorMessage = (error, noun = 'record') =>
    translateError(error, { status: 400, noun }).message;

// sendError(res, error, options) — the catch-block one-liner:
//   } catch (error) { sendError(res, error, 400); }
const sendError = (res, error, options = {}) => {
    const { status, message } = translateError(error, options);
    if (status >= 500) console.error(error);
    return res.status(status).json({ message });
};

module.exports = {
    translateError,
    translateErrorMessage,
    sendError,
    isTechnicalMessage,
    REQUIRED_FIELDS_MESSAGE,
    GENERIC_MESSAGE,
    NOT_FOUND_MESSAGE,
};
