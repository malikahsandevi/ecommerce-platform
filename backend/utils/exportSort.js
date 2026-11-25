'use strict';

/**
 * Export row ordering (Part 4) — the .xlsx follows the order the
 * admin table currently shows. The panel sends its active sort
 * (sortKey/sortDir, the mapped column keys from each module config's
 * sortableColumns); this map mirrors those columns against the
 * export's plain rows. No key (or an unknown one) = the table's
 * default order: newest first (createdAt desc). Rows missing the
 * sorted value land last in both directions, exactly as in the panel.
 */

const personName = (user) => {
    if (!user || typeof user !== 'object') return '';
    const joined = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    return joined || user.name || user.username || user.email || '';
};

const str = (get) => ({ get, type: 'string' });
const num = (get) => ({ get, type: 'number' });

const SORTS = {
    products: {
        name: str((r) => r.name),
        price: num((r) => r.price),
        stock: num((r) => r.stock),
        status: str((r) => r.status),
    },
    orders: {
        customer: str((r) => personName(r.user)),
        totalAmount: num((r) => r.total),
        paymentStatus: str((r) => r.paymentStatus),
        status: str((r) => r.status),
    },
    categories: {
        name: str((r) => r.name),
        sortOrder: num((r) => r.sortOrder),
        status: str((r) => r.status),
    },
    brands: {
        name: str((r) => r.name),
        status: str((r) => r.status),
    },
    coupons: {
        value: num((r) => r.discountValue),
        status: str((r) => r.status),
    },
    customers: {
        name: str((r) => personName(r)),
        status: str((r) => r.status),
    },
    reviews: {
        productName: str((r) => r.product?.name),
        customerName: str((r) => personName(r.user)),
        rating: num((r) => r.rating),
        status: str((r) => r.status),
    },
    media: {
        name: str((r) => r.originalName || r.filename),
        size: num((r) => r.size),
        status: str((r) => r.status),
    },
};

const isMissing = (value) =>
    value === undefined || value === null || value === '';

function sortExportRows(segment, rows, sortKey, sortDir) {
    const spec = sortKey ? SORTS[segment]?.[sortKey] : undefined;
    const get = spec ? spec.get : (r) => r.createdAt;
    const type = spec ? spec.type : 'date';
    const dir = spec ? (sortDir === 'asc' ? 'asc' : 'desc') : 'desc';
    return [...rows].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        const missingA = isMissing(va);
        const missingB = isMissing(vb);
        if (missingA || missingB)
            return missingA === missingB ? 0 : missingA ? 1 : -1;
        let cmp;
        if (type === 'number') cmp = Number(va) - Number(vb);
        else if (type === 'date')
            cmp = new Date(va).getTime() - new Date(vb).getTime();
        else
            cmp = String(va).localeCompare(String(vb), undefined, {
                sensitivity: 'base',
            });
        return dir === 'asc' ? cmp : -cmp;
    });
}

module.exports = { sortExportRows };
