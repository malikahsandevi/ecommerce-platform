// Courier live-tracking sync — the normalized adapter framework.
//
// ONE interface for every courier: getTrackingStatus(courier,
// trackingNumber) resolves to one of
//   shipped | out_for_delivery | delivered | returned | unknown
// or to a plain-language failure ({ ok: false, message }) a staff
// member can act on. Behind it sits ONE generic HTTP adapter wired
// to the courier profile's own configuration (Settings → Shipping →
// Couriers): GET {apiBaseUrl}/tracking/{trackingNumber} with the
// profile's API key (X-API-Key + Bearer) or username + password
// (Basic) as the credential.
//
// HONESTY RULES (a system sold to a real customer):
//   - A courier with NO API address or NO credential is never
//     scraped and never guessed about — the sync answers plainly
//     that live tracking needs that courier's API credentials in
//     Settings → Shipping.
//   - A response whose status text matches nothing known maps to
//     'unknown', never to an invented state.
//   - Network / HTTP failures answer with a clean message; nothing
//     here throws into a request.

/** Maps a courier's free-form status text onto the normalized set.
 *  Conservative on purpose: 'out for delivery' is tested BEFORE
 *  'delivered' (it contains the word), and anything unrecognized —
 *  including 'booked' / 'pending' style early states — is 'unknown'
 *  rather than a guess. */
const mapCourierStatus = (raw) => {
    if (raw === undefined || raw === null) return 'unknown';
    const text = String(raw).toLowerCase().replace(/[_-]+/g, ' ').trim();
    if (!text) return 'unknown';
    if (text.includes('out for delivery')) return 'out_for_delivery';
    if (text.includes('deliver')) return 'delivered';
    if (text.includes('return')) return 'returned';
    if (
        text.includes('ship') ||
        text.includes('transit') ||
        text.includes('picked') ||
        text.includes('dispatch') ||
        text.includes('enroute') ||
        text.includes('en route') ||
        text.includes('on its way') ||
        text.includes('on the way')
    ) {
        return 'shipped';
    }
    return 'unknown';
};

/** Pulls the status string out of a courier API response body,
 *  looking at the field names real tracking APIs use. */
const extractStatusString = (body) => {
    if (!body || typeof body !== 'object') return '';
    const candidates = [
        body.status,
        body.trackingStatus,
        body.currentStatus,
        body.shipmentStatus,
        body.state,
        body.data?.status,
        body.data?.trackingStatus,
        body.data?.currentStatus,
        body.data?.state,
        body.result?.status,
        body.tracking?.status,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
    }
    return '';
};

const hasApiCredentials = (courier) => {
    const base = String(courier?.apiBaseUrl || '').trim();
    if (!base) return false;
    const key = String(courier?.apiKey || '').trim();
    const username = String(courier?.apiUsername || '').trim();
    const password = String(courier?.apiPassword || '').trim();
    return Boolean(key || (username && password));
};

/**
 * Asks the courier for a parcel's current status.
 * Returns { ok: true, status, rawStatus } or
 * { ok: false, code: 'NO_COURIER' | 'NO_CREDENTIALS' | 'SYNC_FAILED', message }.
 */
const getTrackingStatus = async (courier, trackingNumber) => {
    if (!courier) {
        return {
            ok: false,
            code: 'NO_COURIER',
            message: 'No courier is assigned to this order yet.',
        };
    }
    if (!hasApiCredentials(courier)) {
        return {
            ok: false,
            code: 'NO_CREDENTIALS',
            message: `Live tracking for ${courier.name} needs that courier's API credentials — add them in Settings → Shipping.`,
        };
    }
    const base = String(courier.apiBaseUrl).trim().replace(/\/+$/, '');
    const url = `${base}/tracking/${encodeURIComponent(String(trackingNumber || '').trim())}`;
    const headers = { Accept: 'application/json' };
    const key = String(courier.apiKey || '').trim();
    if (key) {
        headers['X-API-Key'] = key;
        headers.Authorization = `Bearer ${key}`;
    } else {
        const basic = Buffer.from(
            `${String(courier.apiUsername).trim()}:${String(courier.apiPassword)}`,
        ).toString('base64');
        headers.Authorization = `Basic ${basic}`;
    }
    try {
        const response = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            return {
                ok: false,
                code: 'SYNC_FAILED',
                message: `${courier.name} could not report tracking just now. Try again later.`,
            };
        }
        const body = await response.json().catch(() => null);
        const rawStatus = extractStatusString(body);
        return { ok: true, status: mapCourierStatus(rawStatus), rawStatus };
    } catch {
        return {
            ok: false,
            code: 'SYNC_FAILED',
            message: `Could not reach ${courier.name} for tracking. Check the courier's API address in Settings → Shipping.`,
        };
    }
};

module.exports = { getTrackingStatus, mapCourierStatus, extractStatusString, hasApiCredentials };
