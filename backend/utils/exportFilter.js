// Data Export filtering — a faithful server-side mirror of the admin
// panel's client-side list pipeline, so an export contains exactly the
// records the admin sees under the same search + filters + date range:
//
//   1. Row adaptation — admin/services/resourceRegistry.ts `adaptRow`
//      (status derived from isActive / coupon dates / media status).
//   2. Search — admin/components/ui/SearchBar.tsx: the query splits
//      into words and EVERY word must appear in the record's combined
//      searchable text (field values flattened deeply, depth ≤ 3).
//   3. Dropdown filters — admin/components/models/FilterBar.tsx:
//      String(item[field]) === selected value, or the config's bucket
//      mapper for derived filters (product stock level / price band,
//      media file type) — formulas copied from admin/config/*.ts.
//   4. By-Date range — the record's createdAt day must fall inside
//      [from, to] inclusive, days compared as ISO day strings. The
//      panel compares in the viewer's local day; the store's canonical
//      day is its configured timezone (Setting.general.timeZone), which
//      is what the export uses.
//
// Nothing here invents new semantics — change the panel's rules and
// this file must change with them.

const COUPON_DAY_MS = 24 * 60 * 60 * 1000;

/** Coupon expiry, mirroring utils/coupon.js `couponExpired`: a
 *  date-only validUntil (exactly UTC midnight — what the admin form
 *  saves) covers that whole day and expires at its END; a validUntil
 *  carrying a time compares exactly. */
function couponExpired(validUntil, now = new Date()) {
    if (!validUntil) return false;
    const end = new Date(validUntil).getTime();
    if (Number.isNaN(end)) return false;
    const dateOnly = end % COUPON_DAY_MS === 0;
    return now.getTime() > (dateOnly ? end + COUPON_DAY_MS - 1 : end);
}

/** adaptRow mirror (resourceRegistry.ts). Mutates and returns the row. */
function adaptRow(moduleKey, row) {
    if (!row || typeof row !== 'object') return row;
    switch (moduleKey) {
        case 'users':
        case 'categories':
        case 'brands':
            row.status = row.isActive === false ? 'inactive' : 'active';
            break;
        case 'media':
            row.status =
                row.status ||
                (row.isActive === false ? 'inactive' : 'active');
            break;
        case 'coupons': {
            let status = 'active';
            if (row.isActive === false) status = 'disabled';
            else if (couponExpired(row.validUntil)) status = 'expired';
            row.status = status;
            break;
        }
        default:
            break;
    }
    return row;
}

/** SearchBar's deep value collector (depth-limited flattening). */
function collectValues(val, out, depth) {
    if (val === null || val === undefined || depth > 3) return;
    if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
    ) {
        out.push(String(val));
        return;
    }
    if (Array.isArray(val)) {
        val.forEach((v) => collectValues(v, out, depth + 1));
        return;
    }
    if (typeof val === 'object') {
        Object.values(val).forEach((v) => collectValues(v, out, depth + 1));
    }
}

/** SearchBar match: every query word appears in the combined text. */
function matchesSearch(row, searchableFields, search) {
    const query = String(search || '').trim();
    if (!query) return true;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const parts = [];
    (searchableFields || []).forEach((key) => collectValues(row[key], parts, 0));
    const haystack = parts.join(' ').toLowerCase();
    return tokens.every((token) => haystack.includes(token));
}

// Bucket mappers — copied from the admin route configs / page code.
const BUCKETS = {
    // admin/config/productConfig.ts
    stockLevel(row) {
        const stock = Number(row.stock ?? 0);
        if (stock <= 0) return 'out_of_stock';
        if (stock <= 5) return 'low_stock';
        return 'in_stock';
    },
    priceRange(row) {
        const price = Number(row.price ?? 0);
        if (price < 25) return 'under_25';
        if (price < 50) return '25_50';
        if (price < 100) return '50_100';
        if (price < 250) return '100_250';
        return 'over_250';
    },
    // admin/app/[pages]/page.tsx mediaTypeBucket
    mediaType(row) {
        const mime = String(row.mimeType || row.type || '').toLowerCase();
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        return 'other';
    },
};

// Which dropdown filters use a bucket instead of a plain field match,
// per module (filter id → bucket name). Everything else compares
// String(row[filterId]) === value, exactly like FilterBar.
const FILTER_BUCKETS = {
    products: { stockLevel: 'stockLevel', priceRange: 'priceRange' },
    media: { mediaType: 'mediaType' },
};

function matchesFilters(moduleKey, row, filters) {
    if (!filters || typeof filters !== 'object') return true;
    const buckets = FILTER_BUCKETS[moduleKey] || {};
    for (const [id, rawValue] of Object.entries(filters)) {
        const value = rawValue == null ? '' : String(rawValue);
        if (!value || value === 'all') continue;
        const bucket = buckets[id];
        const actual = bucket ? BUCKETS[bucket](row) : String(row[id]);
        if (actual !== value) return false;
    }
    return true;
}

/** ISO day (yyyy-mm-dd) of an instant in an IANA timezone. */
function dayInTimezone(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

function matchesDateRange(row, from, to, timeZone) {
    if (!from && !to) return true;
    const raw = row.createdAt;
    if (raw == null) return false;
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(d.getTime())) return false;
    const day = dayInTimezone(d, timeZone);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
}

/**
 * Apply the full pipeline to plain-object rows.
 * criteria: { search, filters: {id: value}, from, to } — from/to are
 * yyyy-mm-dd day strings (the panel's presets resolve to a concrete
 * range before the request, exactly like its own pipeline).
 */
function applyExportFilters(moduleKey, rows, criteria, searchableFields, timeZone) {
    const { search, filters, from, to } = criteria || {};
    return rows.filter(
        (row) =>
            matchesSearch(row, searchableFields, search) &&
            matchesFilters(moduleKey, row, filters) &&
            matchesDateRange(row, from, to, timeZone),
    );
}

module.exports = {
    adaptRow,
    applyExportFilters,
    dayInTimezone,
};
