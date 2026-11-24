// Data Export — server-side .xlsx generation for every admin list
// module (Ahsan's order). The file contains ALL records matching the
// caller's current search + dropdown filters + date range — the exact
// set the panel's FilterBar pipeline shows, NOT just the visible page
// (see utils/exportFilter.js for the mirrored semantics).
//
// Access is gated in routes/export.js: only Super Admin and Admin may
// export at all (Ahsan's rule), and only while their role's permission
// matrix ticks Export for the module — this controller assumes both
// gates ran.
//
// No secrets ever reach a sheet: the users fetch excludes password /
// TOTP / reset-token fields at the query, and every module's columns
// are an explicit allow-list of display fields.
const ExcelJS = require('exceljs');
const {
    Product,
    Category,
    Brand,
    Coupon,
    Order,
    User,
    Review,
    Media,
    Setting,
} = require('../models');
const { adaptRow, applyExportFilters, dayInTimezone } = require('../utils/exportFilter');
const { NOT_DELETED } = require('../utils/softDelete');
const { sendError } = require('../utils/apiError');

const personName = (user) => {
    if (!user || typeof user !== 'object') return '';
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || user.username || user.email || '';
};

const plain = (docs) => JSON.parse(JSON.stringify(docs));

async function fetchProducts() {
    const docs = await Product.find({ ...NOT_DELETED }).populate('category brand');
    await Product.withCodes(docs);
    return plain(docs);
}

async function fetchCategories() {
    const [rows, counts] = await Promise.all([
        Category.find({ ...NOT_DELETED }).populate('parent', 'name').lean(),
        Product.aggregate([{ $match: { ...NOT_DELETED } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    ]);
    await Category.withCodes(rows);
    const byId = new Map(counts.map((e) => [String(e._id), e.count]));
    return rows.map((r) => ({ ...r, productsCount: byId.get(String(r._id)) || 0 }));
}

async function fetchBrands() {
    const [rows, counts] = await Promise.all([
        Brand.find({ ...NOT_DELETED }).lean(),
        Product.aggregate([{ $match: { ...NOT_DELETED } }, { $group: { _id: '$brand', count: { $sum: 1 } } }]),
    ]);
    await Brand.withCodes(rows);
    const byId = new Map(counts.map((e) => [String(e._id), e.count]));
    return rows.map((r) => ({ ...r, productsCount: byId.get(String(r._id)) || 0 }));
}

async function fetchCoupons() {
    const docs = await Coupon.find({ ...NOT_DELETED });
    await Coupon.withCodes(docs);
    return plain(docs);
}

async function fetchOrders() {
    const docs = await Order.find({ ...NOT_DELETED })
        .populate('user', 'firstName lastName email avatar')
        .populate('coupon', 'code');
    await Order.withCodes(docs);
    return plain(docs);
}

async function fetchUsers() {
    // Credential material is excluded at the query — it can never
    // reach the sheet, whatever columns are defined below.
    const docs = await User.find({ ...NOT_DELETED }).select(
        '-password -twoFactorSecret -passwordResetTokenHash -passwordResetExpires',
    );
    await User.withCodes(docs);
    return plain(docs);
}

async function fetchReviews() {
    const docs = await Review.find({ ...NOT_DELETED })
        .populate('product', 'name')
        .populate('user', 'firstName lastName username email avatar');
    await Review.withCodes(docs);
    return plain(docs);
}

async function fetchMedia() {
    const docs = await Media.find({ ...NOT_DELETED });
    await Media.withCodes(docs);
    return plain(docs);
}

const dateCol = (header, get, width = 18) => ({ header, get, width, type: 'date' });
const numCol = (header, get, width = 12) => ({ header, get, width, type: 'number' });
const textCol = (header, get, width = 18) => ({ header, get, width });

// Module specs keyed by the URL segment the panel requests. `adaptKey`
// is the resourceRegistry endpoint name the row adaptation keys on
// (the Customers page reads the users endpoint).
const SPECS = {
    products: {
        label: 'Products',
        adaptKey: 'products',
        fetch: fetchProducts,
        searchableFields: ['name', 'sku', 'status', 'code', 'category', 'brand'],
        columns: [
            textCol('Code', (r) => r.code, 10),
            textCol('Name', (r) => r.name, 30),
            textCol('SKU', (r) => r.sku, 14),
            textCol('Category', (r) => r.category?.name, 18),
            textCol('Brand', (r) => r.brand?.name, 16),
            numCol('Price', (r) => r.price),
            numCol('Compare Price', (r) => r.comparePrice, 14),
            numCol('Cost Price', (r) => r.costPrice),
            numCol('Stock', (r) => r.stock, 10),
            textCol('Status', (r) => r.status, 14),
            dateCol('Created At', (r) => r.createdAt),
        ],
    },
    categories: {
        label: 'Categories',
        adaptKey: 'categories',
        fetch: fetchCategories,
        searchableFields: ['name', 'slug', 'description', 'code'],
        columns: [
            textCol('Code', (r) => r.code, 10),
            textCol('Name', (r) => r.name, 24),
            textCol('Slug', (r) => r.slug, 20),
            textCol('Parent Category', (r) => r.parent?.name, 20),
            numCol('Sort Order', (r) => r.sortOrder),
            numCol('Products', (r) => r.productsCount, 10),
            textCol('Status', (r) => r.status, 12),
            textCol('Description', (r) => r.description, 36),
            dateCol('Created At', (r) => r.createdAt),
        ],
    },
    brands: {
        label: 'Brands',
        adaptKey: 'brands',
        fetch: fetchBrands,
        searchableFields: ['name', 'slug', 'website', 'code'],
        columns: [
            textCol('Code', (r) => r.code, 10),
            textCol('Name', (r) => r.name, 24),
            textCol('Slug', (r) => r.slug, 20),
            textCol('Website', (r) => r.website, 26),
            numCol('Products', (r) => r.productsCount, 10),
            textCol('Status', (r) => r.status, 12),
            textCol('Description', (r) => r.description, 36),
            dateCol('Created At', (r) => r.createdAt),
        ],
    },
    coupons: {
        label: 'Coupons',
        adaptKey: 'coupons',
        fetch: fetchCoupons,
        searchableFields: ['code', 'publicId', 'discountType', 'description'],
        columns: [
            textCol('ID', (r) => r.publicId, 10),
            textCol('Code', (r) => r.code, 16),
            textCol('Discount Type', (r) => r.discountType, 14),
            numCol('Discount Value', (r) => r.discountValue, 14),
            numCol('Min Purchase', (r) => r.minPurchaseAmount, 13),
            numCol('Max Discount', (r) => r.maxDiscountAmount, 13),
            numCol('Used Count', (r) => r.usedCount, 11),
            numCol('Usage Limit', (r) => r.usageLimit, 12),
            dateCol('Valid From', (r) => r.validFrom),
            dateCol('Valid Until', (r) => r.validUntil),
            textCol('Status', (r) => r.status, 12),
            textCol('Description', (r) => r.description, 30),
            dateCol('Created At', (r) => r.createdAt),
        ],
    },
    orders: {
        label: 'Orders',
        adaptKey: 'orders',
        fetch: fetchOrders,
        searchableFields: ['orderNumber', 'status', 'paymentStatus', 'trackingNumber', 'code', 'user'],
        columns: [
            textCol('Order #', (r) => r.orderNumber, 16),
            textCol('Code', (r) => r.code, 10),
            textCol('Customer', (r) => personName(r.user), 22),
            textCol('Customer Email', (r) => r.user?.email, 26),
            numCol('Items', (r) => (Array.isArray(r.items) ? r.items.length : 0), 8),
            numCol('Subtotal', (r) => r.subtotal),
            numCol('Discount', (r) => r.discount),
            textCol('Coupon', (r) => r.coupon?.code, 12),
            numCol('Tax', (r) => r.tax, 10),
            numCol('Shipping', (r) => r.shippingCost, 11),
            numCol('Total', (r) => r.total),
            textCol('Payment Method', (r) => r.paymentMethod, 15),
            textCol('Payment Status', (r) => r.paymentStatus, 14),
            textCol('Payment ID', (r) => r.paymentId, 16),
            textCol('Status', (r) => r.status, 13),
            textCol('Carrier', (r) => r.shippingCarrier, 14),
            textCol('Tracking Number', (r) => r.trackingNumber, 18),
            dateCol('Order Date', (r) => r.createdAt),
        ],
    },
    customers: {
        label: 'Customers',
        adaptKey: 'users',
        fetch: fetchUsers,
        searchableFields: ['firstName', 'lastName', 'email', 'username', 'phone', 'code'],
        columns: [
            textCol('Code', (r) => r.code, 10),
            textCol('First Name', (r) => r.firstName, 16),
            textCol('Last Name', (r) => r.lastName, 16),
            textCol('Username', (r) => r.username, 16),
            textCol('Email', (r) => r.email, 28),
            textCol('Phone', (r) => r.phone, 16),
            textCol('Role', (r) => r.role, 14),
            textCol('Status', (r) => r.status, 12),
            textCol('Verified', (r) => (r.isVerified ? 'Yes' : 'No'), 10),
            dateCol('Joined', (r) => r.createdAt),
        ],
    },
    reviews: {
        label: 'Reviews',
        adaptKey: 'reviews',
        fetch: fetchReviews,
        searchableFields: ['title', 'content', 'code', 'product', 'user', 'productName', 'customerName'],
        columns: [
            textCol('Code', (r) => r.code, 10),
            textCol('Product', (r) => r.product?.name, 24),
            textCol('Customer', (r) => personName(r.user), 20),
            numCol('Rating', (r) => r.rating, 8),
            textCol('Title', (r) => r.title, 24),
            textCol('Review', (r) => r.content || r.comment, 40),
            textCol('Status', (r) => r.status, 12),
            numCol('Helpful', (r) => r.helpfulCount, 9),
            dateCol('Date', (r) => r.createdAt),
        ],
    },
    media: {
        label: 'Media',
        adaptKey: 'media',
        fetch: fetchMedia,
        searchableFields: ['originalName', 'filename', 'altText', 'mimeType', 'extension', 'code'],
        columns: [
            textCol('Code', (r) => r.code, 10),
            textCol('Name', (r) => r.originalName || r.filename, 28),
            textCol('File Name', (r) => r.filename, 28),
            textCol('Type', (r) => r.mimeType, 22),
            textCol('Extension', (r) => r.extension, 10),
            numCol('Size (Bytes)', (r) => r.size, 13),
            textCol(
                'Dimensions',
                (r) =>
                    r.dimensions?.width && r.dimensions?.height
                        ? `${r.dimensions.width} × ${r.dimensions.height}`
                        : '',
                14,
            ),
            textCol('Storage', (r) => r.storageEntry || r.storageType, 16),
            textCol('Alt Text', (r) => r.altText, 24),
            textCol('URL', (r) => r.url, 40),
            textCol('Status', (r) => r.status, 12),
            dateCol('Uploaded', (r) => r.createdAt),
        ],
    },
};

async function storeTimeZone() {
    try {
        const setting = await Setting.findOne()
            .sort({ createdAt: 1 })
            .select('general.timeZone')
            .lean();
        return setting?.general?.timeZone || 'Asia/Karachi';
    } catch {
        return 'Asia/Karachi';
    }
}

function parseCriteria(req) {
    let filters = {};
    if (req.query.filters) {
        try {
            const parsed = JSON.parse(String(req.query.filters));
            if (parsed && typeof parsed === 'object') filters = parsed;
        } catch {
            filters = {};
        }
    }
    const day = /^\d{4}-\d{2}-\d{2}$/;
    return {
        search: req.query.search ? String(req.query.search) : '',
        filters,
        from: day.test(String(req.query.from || '')) ? String(req.query.from) : '',
        to: day.test(String(req.query.to || '')) ? String(req.query.to) : '',
    };
}

const exportModule = async (req, res) => {
    const segment = String(req.params.module || '').toLowerCase();
    const spec = SPECS[segment];
    if (!spec) {
        return res.status(404).json({ message: 'Unknown export module.' });
    }
    try {
        const timeZone = await storeTimeZone();
        const rows = await spec.fetch();
        rows.forEach((row) => adaptRow(spec.adaptKey, row));
        const filtered = applyExportFilters(
            spec.adaptKey,
            rows,
            parseCriteria(req),
            spec.searchableFields,
            timeZone,
        );

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'E-Commerce Admin';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet(spec.label);
        sheet.columns = spec.columns.map((col) => ({
            header: col.header,
            width: col.width,
        }));
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF374151' },
        };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        filtered.forEach((row) => {
            const values = spec.columns.map((col) => {
                const value = col.get(row);
                if (value === undefined || value === null) return '';
                if (col.type === 'date') {
                    const d = new Date(value);
                    return Number.isNaN(d.getTime()) ? '' : d;
                }
                if (col.type === 'number') {
                    const n = Number(value);
                    return Number.isNaN(n) ? '' : n;
                }
                return String(value);
            });
            sheet.addRow(values);
        });
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            spec.columns.forEach((col, i) => {
                if (col.type === 'date') {
                    row.getCell(i + 1).numFmt = 'yyyy-mm-dd hh:mm';
                }
            });
        });

        const day = dayInTimezone(new Date(), timeZone);
        const filename = `${segment}-export-${day}.xlsx`;
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Export-Count', String(filtered.length));
        return res.send(Buffer.from(buffer));
    } catch (error) {
        return sendError(res, error, 500);
    }
};

module.exports = { exportModule };
