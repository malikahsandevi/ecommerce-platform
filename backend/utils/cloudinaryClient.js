// Per-entry Cloudinary client.
//
// The Cloudinary Node SDK is a process-wide SINGLETON configured with
// ONE account (config/cloudinary.js + utils/credentials.js) — it can
// only ever speak for the original entry. Storage entries beyond the
// first ("Cloudinary 2", "Cloudinary 3", …) are served through this
// small REST client instead: same Cloudinary API, but every call takes
// the target entry's own { cloudName, apiKey, apiSecret }.
//
// Request signing reuses the SDK's own api_sign_request with the
// entry's secret, so signed parameters are identical to what the SDK
// would produce for that account. Delivery-URL signing replicates the
// SDK's algorithm exactly (verified byte-for-byte against
// cloudinary.url with sign_url for image, video and raw assets).
const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');

const API_BASE = 'https://api.cloudinary.com/v1_1';
const DEFAULT_TIMEOUT_MS = 10_000;

const basicAuth = (creds) =>
    'Basic ' + Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

const parseBody = async (response) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { error: { message: text || `HTTP ${response.status}` } };
    }
};

const throwIfError = (body, fallback) => {
    if (body && body.error) {
        throw new Error(body.error.message || fallback);
    }
    return body;
};

/** Signed form parameters for a write call (upload / destroy / rename). */
const signedForm = (creds, params) => {
    const form = new URLSearchParams();
    const toSign = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        form.append(key, String(value));
        toSign[key] = value;
    }
    form.append('api_key', creds.apiKey);
    form.append('signature', cloudinary.utils.api_sign_request(toSign, creds.apiSecret));
    return form;
};

/** GET /usage — the account's own storage usage + credit quota. */
async function usage(creds, timeoutMs = 4_000) {
    const response = await fetchWithTimeout(
        `${API_BASE}/${creds.cloudName}/usage`,
        { headers: { Authorization: basicAuth(creds) } },
        timeoutMs,
    );
    const body = throwIfError(await parseBody(response), 'Cloudinary usage request failed.');
    return {
        plan: body.plan || null,
        storageUsedBytes: body.storage?.usage ?? null,
        creditsUsed: body.credits?.usage ?? null,
        creditsLimit: body.credits?.limit ?? null,
        creditsUsedPercent: body.credits?.used_percent ?? null,
        resources: body.resources ?? null,
    };
}

/** GET /resources/:resource_type/:type/:public_id — one asset's facts. */
async function resource(creds, publicId, { resourceType = 'image', type = 'authenticated' } = {}) {
    const response = await fetchWithTimeout(
        `${API_BASE}/${creds.cloudName}/resources/${resourceType}/${type}/${publicId}`,
        { headers: { Authorization: basicAuth(creds) } },
    );
    return throwIfError(await parseBody(response), 'Cloudinary resource request failed.');
}

/** POST /:resource_type/destroy — remove one asset (one delivery type). */
async function destroy(creds, publicId, { resourceType = 'image', type = 'authenticated', invalidate = true } = {}) {
    const form = signedForm(creds, {
        public_id: publicId,
        timestamp: Math.round(Date.now() / 1000),
        type,
        invalidate: invalidate ? 'true' : undefined,
    });
    const response = await fetchWithTimeout(`${API_BASE}/${creds.cloudName}/${resourceType}/destroy`, {
        method: 'POST',
        body: form,
    });
    return throwIfError(await parseBody(response), 'Cloudinary destroy request failed.');
}

/** Destroy an asset in whichever delivery type it exists (best effort). */
async function destroyAnyType(creds, publicId, resourceType) {
    for (const type of ['authenticated', 'upload']) {
        try {
            const result = await destroy(creds, publicId, { resourceType, type });
            if (result && result.result === 'ok') return result;
        } catch {
            /* try the other type */
        }
    }
    return { result: 'not found' };
}

/** POST /:resource_type/upload — `file` is a data URL or a remote URL. */
async function upload(creds, file, params = {}) {
    const form = signedForm(creds, {
        ...params,
        timestamp: Math.round(Date.now() / 1000),
    });
    form.append('file', file);
    const resourceType = params.resource_type || 'auto';
    const response = await fetchWithTimeout(
        `${API_BASE}/${creds.cloudName}/${resourceType}/upload`,
        { method: 'POST', body: form },
        60_000,
    );
    return throwIfError(await parseBody(response), 'Cloudinary upload request failed.');
}

/**
 * Make sure an asset exists as an authenticated-type copy on THIS
 * entry's account and the public copy is gone — the REST twin of
 * utils/cloudinaryUrl.js's ensureAuthenticatedAsset.
 */
async function ensureAuthenticatedAsset(creds, { publicId, resourceType, sourceUrl }) {
    let authed = null;
    try {
        authed = await resource(creds, publicId, { resourceType, type: 'authenticated' });
    } catch {
        authed = null;
    }
    if (!authed) {
        if (!sourceUrl) {
            throw new Error(`No source URL to migrate asset ${publicId}`);
        }
        authed = await upload(creds, sourceUrl, {
            public_id: publicId,
            resource_type: resourceType,
            type: 'authenticated',
        });
    }
    try {
        await destroy(creds, publicId, { resourceType, type: 'upload', invalidate: true });
    } catch {
        /* the authenticated copy is already authoritative */
    }
    return authed;
}

/**
 * A signed delivery URL for an asset on this entry's account — the
 * same string the SDK produces for the singleton account (SHA-1 of
 * "<public_id>[.<format>]" + secret, base64url, first 8 chars).
 */
function signedUrl(creds, { resourceType, publicId, format }) {
    const suffix = format ? `.${format}` : '';
    const signature = crypto
        .createHash('sha1')
        .update(`${publicId}${suffix}${creds.apiSecret}`)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
        .slice(0, 8);
    return `https://res.cloudinary.com/${creds.cloudName}/${resourceType}/authenticated/s--${signature}--/${publicId}${suffix}`;
}

module.exports = {
    usage,
    resource,
    destroy,
    destroyAnyType,
    upload,
    ensureAuthenticatedAsset,
    signedUrl,
};
