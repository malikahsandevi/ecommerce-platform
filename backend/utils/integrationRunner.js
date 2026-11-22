// Shared integration runner — the ONE place outbound service calls
// are built and sent. Used by POST /api/settings/execute (the panel's
// Test button) and by middleware/setting.js's runIntegration helper.
//
// Resolution comes from config/services/index.js (the gate): an entry
// whose activation toggle is OFF is refused here as well, preset
// sub-services are called at their definition's FIXED provider base
// with the definition's auth style, and only CUSTOM / legacy entries
// use an admin-typed base URL — always behind the SSRF guard below
// (public http(s) only, loopback/private refused, 10s timeout).
const axios = require('axios');

class RunnerError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const fillPlaceholders = (text, values) =>
    String(text || '').replace(/\{(\w+)\}/g, (_, key) =>
        encodeURIComponent(String(values[key] ?? '')),
    );

// Header maps arrive as a Mongoose Map on document reads and as a
// plain object on lean reads — accept both.
const toPlainObject = (value) => {
    if (!value) return {};
    if (value instanceof Map) return Object.fromEntries(value);
    if (typeof value === 'object') return { ...value };
    return {};
};

const resolveBaseUrl = (definition, values) => {
    const base = definition?.baseUrl;
    if (!base) return '';
    if (typeof base === 'string') return fillPlaceholders(base, values);
    if (base.byField) {
        const chosen = base.map?.[values[base.byField]] || base.default || '';
        return fillPlaceholders(chosen, values);
    }
    return '';
};

// SSRF guard: integrations may only call public http(s) services —
// never loopback / private-network addresses on the host.
const assertPublicUrl = (url) => {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new RunnerError(400, 'Integration URL is invalid.');
    }
    const host = parsed.hostname.toLowerCase();
    const isPrivateHost =
        host === 'localhost' ||
        host.endsWith('.local') ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host === '::1';
    if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost) {
        throw new RunnerError(400, 'Integration URL must be a public http(s) address.');
    }
    return parsed;
};

// Builds headers/params for a preset definition's auth style. The
// clientCredentials style is two-step and handled in executeEntryCall.
const applyPresetAuth = (definition, values, headers, params) => {
    const auth = definition.auth || { style: 'none' };
    switch (auth.style) {
        case 'basic': {
            const user = auth.userLiteral ?? values[auth.userKey] ?? '';
            const pass = auth.passLiteral ?? values[auth.passKey] ?? '';
            headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
            break;
        }
        case 'bearer':
            headers.Authorization = `Bearer ${values[auth.tokenKey] ?? ''}`;
            break;
        case 'apiKeyHeader':
            headers[auth.header] = values[auth.key] ?? '';
            break;
        case 'tokenHeader':
            headers[auth.header] = `${auth.prefix || ''}${values[auth.key] ?? ''}`;
            break;
        case 'queryKey':
            params[auth.param] = values[auth.key] ?? '';
            break;
        case 'queryParams':
            for (const [param, fieldKey] of Object.entries(auth.params || {})) {
                params[param] = values[fieldKey] ?? '';
            }
            break;
        default:
            break; // none / smtp / oauth / internal / aws-sigv4: no generic header auth
    }
};

const applyGenericAuth = (entry, headers) => {
    const creds = entry.authCredentials || {};
    switch (entry.authType) {
        case 'BEARER_TOKEN':
            headers.Authorization = `Bearer ${creds.apiKey || ''}`;
            break;
        case 'API_KEY':
        case 'CUSTOM_HEADER':
            headers[creds.headerKey || 'X-API-KEY'] = creds.apiKey || '';
            break;
        case 'BASIC':
            headers.Authorization = `Basic ${Buffer.from(
                `${creds.username || ''}:${creds.password || ''}`,
            ).toString('base64')}`;
            break;
        default:
            break;
    }
};

/**
 * Executes one endpoint of a resolved service entry.
 * `entry` is the normalized shape from config/services/index.js
 * (allEntries/findEntry) — or any object with the same fields.
 * Throws RunnerError with an HTTP-ish status on every refusal.
 */
const executeEntryCall = async ({ entry, definition, endpointName, payload = {}, queryParams = {} }) => {
    if (!entry) throw new RunnerError(404, 'Integration not found.');
    if (!entry.isConnected) {
        throw new RunnerError(404, `Integration '${entry.serviceSlug}' not found or disabled.`);
    }

    const isPreset = Boolean(entry.subService && definition && definition.id !== 'custom');
    const endpoints = isPreset ? definition.endpoints || [] : entry.endpoints || [];
    const endpoint = endpoints.find((e) => e.name === endpointName);
    if (!endpoint) {
        throw new RunnerError(404, `Endpoint '${endpointName}' not found.`);
    }

    // Internal services (the Store Session JWT signer) have no HTTP
    // API to call — their test is a local probe: sign a throwaway
    // token with the saved secret and verify it straight back. That
    // proves the saved secret genuinely works for signing.
    if (isPreset && definition.auth?.style === 'internal') {
        const secret = (entry.values || {}).jwtSecret || '';
        if (!secret) {
            throw new RunnerError(400, `Service '${entry.title || entry.serviceSlug}' has no saved secret to test.`);
        }
        const jwt = require('jsonwebtoken');
        const probe = jwt.sign({ probe: 'store-session' }, secret, { expiresIn: '1m' });
        jwt.verify(probe, secret);
        return {
            status: 'ok',
            check: 'sign+verify',
            message: 'A probe token was signed with the saved JWT secret and verified successfully.',
        };
    }

    const values = entry.values || {};
    // Preset bases resolve from the definition; a custom entry's
    // typed base may carry {key} placeholders filled from its ACTIVE
    // key-value pairs (entry.values already excludes toggled-off
    // pairs — see the gate's entryValues).
    const baseUrl = isPreset ? resolveBaseUrl(definition, values) : fillPlaceholders(String(entry.baseUrl || ''), values);
    if (!baseUrl) {
        throw new RunnerError(400, `Service '${entry.title || entry.serviceSlug}' has no callable API base URL.`);
    }

    const headers = { 'Content-Type': 'application/json' };
    const params = { ...queryParams };
    if (!isPreset) {
        Object.assign(headers, toPlainObject(entry.globalHeaders));
        Object.assign(headers, toPlainObject(endpoint.defaultHeaders));
    }

    let url = `${baseUrl.replace(/\/$/, '')}/${fillPlaceholders(String(endpoint.path || '/').replace(/^\//, ''), values)}`;

    if (isPreset) {
        const auth = definition.auth || { style: 'none' };
        if (auth.style === 'clientCredentials') {
            // Two-step OAuth: exchange the saved id/secret for an
            // access token at the provider's FIXED token path, then
            // call the endpoint with it as a Bearer token.
            const tokenUrl = `${baseUrl.replace(/\/$/, '')}${auth.tokenPath}`;
            assertPublicUrl(tokenUrl);
            try {
                const tokenResponse = await axios({
                    method: 'POST',
                    url: tokenUrl,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Basic ${Buffer.from(
                            `${values[auth.idKey] ?? ''}:${values[auth.secretKey] ?? ''}`,
                        ).toString('base64')}`,
                    },
                    data: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
                    timeout: 10000,
                });
                const accessToken = tokenResponse.data?.access_token;
                if (!accessToken) throw new Error('Provider returned no access token.');
                headers.Authorization = `Bearer ${accessToken}`;
            } catch (error) {
                throw new RunnerError(400, error.response?.data?.error_description || error.response?.data?.message || error.message);
            }
        } else {
            applyPresetAuth(definition, values, headers, params);
        }
    } else {
        applyGenericAuth(entry, headers);
    }

    assertPublicUrl(url);

    try {
        const response = await axios({
            method: endpoint.method || 'POST',
            url,
            headers,
            params,
            timeout: 10000,
            maxContentLength: 1024 * 1024,
            data: ['POST', 'PUT', 'PATCH'].includes(endpoint.method || 'POST') ? payload : undefined,
        });
        return response.data;
    } catch (error) {
        throw new RunnerError(400, error.response?.data?.message || error.response?.data?.error_description || error.message);
    }
};

/**
 * Configuration test for preset sub-services that expose no callable
 * API endpoint (hosted-form gateways, OAuth providers, the S3 family
 * before the storage consumer uses them, …). There is no provider
 * call to make, so the test validates what CAN be proven locally:
 * the entry is fully configured (the caller checks that first) and,
 * where an offline functional probe exists, the saved values really
 * drive the service's library — a SigV4 presigned URL for S3/R2, an
 * SMTP transport build for the mail services.
 */
const runConfigTest = async ({ definition, entry, values }) => {
    const checks = ['Every required field is saved'];
    if (definition.id === 'aws-s3' || definition.id === 'cloudflare-r2') {
        const { buildS3Client } = require('./storageS3');
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const client = buildS3Client(definition.id, values);
        const url = await getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: values.bucket, Key: 'connection-test.txt' }),
            { expiresIn: 60 },
        );
        if (!url.includes('X-Amz-Signature=')) {
            throw new RunnerError(400, 'Presigned URL generation failed for the saved values.');
        }
        checks.push('S3 client built from the saved values and a SigV4 presigned URL was generated');
    }
    if (definition.id === 'smtp' || definition.id === 'hosting-mail') {
        const { buildSmtpTransport } = require('./mailer');
        buildSmtpTransport(values);
        checks.push('SMTP transport builds from the saved host / port / encryption values');
    }
    return {
        status: 'ok',
        mode: 'configuration-test',
        service: definition.name,
        checks,
        message: `${definition.name} has no callable API endpoint — its saved configuration was validated locally instead.`,
    };
};

module.exports = { executeEntryCall, runConfigTest, RunnerError, assertPublicUrl, resolveBaseUrl, fillPlaceholders };
