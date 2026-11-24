const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const mongoose = require('mongoose');
const { logActivity } = require('../utils/activity');
const { NOT_DELETED, applySoftDelete } = require('../utils/softDelete');
const { duplicateKeyMessage } = require('../utils/duplicateKey');

// A duplicate slug/SKU answers with a clean sentence, never the raw
// MongoDB E11000 driver text.
const errorMessage = (error) => duplicateKeyMessage(error, 'product') || error.message;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveReference = async (Model, value, label, required = false) => {
    if (value === undefined || value === null || value === '') {
        if (required) throw new Error(`${label} is required`);
        return undefined;
    }

    const reference = typeof value === 'object' ? value._id || value.name : value;
    if (mongoose.isValidObjectId(reference)) return reference;

    const record = await Model.findOne({
        name: { $regex: `^${escapeRegex(String(reference).trim())}$`, $options: 'i' },
        ...NOT_DELETED
    }).select('_id');

    if (!record) throw new Error(`${label} "${reference}" not found`);
    return record._id;
};

const createSlug = (name) => name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const MAX_PRODUCT_IMAGES = 7;

// One gallery entry in the canonical shape the API speaks: `alt` and
// `isMain`. The legacy names (altText / isPrimary) are mirrored alongside
// so anything still reading the raw document sees the same values.
const canonicalEntry = (entry, isMain) => {
    const out = {
        url: String(entry.url || '').trim(),
        alt: entry.alt ?? entry.altText ?? '',
        isMain: Boolean(isMain),
        altText: entry.alt ?? entry.altText ?? '',
        isPrimary: Boolean(isMain),
    };
    if (entry.publicId) out.publicId = entry.publicId;
    if (entry.mediaId && mongoose.isValidObjectId(entry.mediaId)) {
        out.mediaId = entry.mediaId;
    }
    return out;
};

// Turns whatever the client sent — a gallery array, or the legacy single
// `image` string — into the stored contract: at most 7 entries, exactly
// one main, the main entry FIRST, and the top-level `image` mirroring the
// main URL. Keys absent from the request stay absent, so a partial update
// cannot wipe the gallery by omission.
const normalizeGallery = (data, normalized) => {
    if (Array.isArray(data.images)) {
        const entries = data.images
            .filter((entry) => entry && typeof entry.url === 'string' && entry.url.trim())
            .map((entry) => ({ entry, wantsMain: Boolean(entry.isMain ?? entry.isPrimary) }));

        if (entries.length > MAX_PRODUCT_IMAGES) {
            throw new Error(`A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
        }

        const mainIndex = Math.max(0, entries.findIndex((e) => e.wantsMain));
        const ordered = entries.length
            ? [entries[mainIndex], ...entries.filter((_, i) => i !== mainIndex)]
            : [];

        normalized.images = ordered.map((e, i) => canonicalEntry(e.entry, i === 0));
        normalized.image = normalized.images[0]?.url || '';
        return;
    }

    if (typeof data.image === 'string') {
        const url = data.image.trim();
        normalized.image = url;
        normalized.images = url
            ? [canonicalEntry({ url, alt: data.imageAlt ?? '' }, true)]
            : [];
    }
};

// Responses speak the same contract the writes store. Records written
// before the gallery (altText / isPrimary, main not first, no `image`
// mirror) are reshaped on the way out instead of needing a migration.
const shapeProduct = (product) => {
    if (!product) return product;
    const obj = typeof product.toObject === 'function'
        ? product.toObject()
        : { ...product };

    const raw = Array.isArray(obj.images) ? obj.images : [];
    const entries = raw
        .filter((entry) => entry && entry.url)
        .map((entry) => ({ entry, wantsMain: Boolean(entry.isMain ?? entry.isPrimary) }));
    const mainIndex = Math.max(0, entries.findIndex((e) => e.wantsMain));
    const ordered = entries.length
        ? [entries[mainIndex], ...entries.filter((_, i) => i !== mainIndex)]
        : [];

    obj.images = ordered.map((e, i) => canonicalEntry(e.entry, i === 0));
    obj.image = obj.images[0]?.url || (typeof obj.image === 'string' ? obj.image : '');
    return obj;
};

const normalizeProductInput = async (data) => {
    const normalized = { ...data };

    // The soft-delete stamps are server-owned (soft delete writes
    // them with the tombstone swap; the Deleted Items restore clears
    // them): a create/update body must never carry them — a product
    // born trashed would be invisible everywhere while still holding
    // its slug/SKU, and an update carrying them could trash or
    // un-trash a product while skipping the delete guard entirely.
    delete normalized.deletedAt;
    delete normalized.deletedBy;
    delete normalized.deletedUniques;

    if (data.category !== undefined) {
        normalized.category = await resolveReference(Category, data.category, 'Category', true);
    }
    if (data.brand !== undefined) {
        normalized.brand = await resolveReference(Brand, data.brand, 'Brand');
    }
    if (!normalized.slug && normalized.name) {
        normalized.slug = createSlug(normalized.name);
    }

    normalizeGallery(data, normalized);

    return normalized;
};

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public/Admin
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({ ...NOT_DELETED }).populate('category brand');
        await Product.withCodes(products);
        res.json(products.map(shapeProduct));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Fetch one product
// @route   GET /api/products/:id
// @access  Public/Admin
const getProductById = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, ...NOT_DELETED }).populate('category brand');
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        await Product.withCodes(product);
        res.json(shapeProduct(product));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Admin
const createProduct = async (req, res) => {
    try {
        const product = new Product(await normalizeProductInput(req.body));

        const createdProduct = await product.save();
        res.status(201).json(shapeProduct(createdProduct));
    } catch (error) {
        res.status(400).json({ message: errorMessage(error) });
    }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Admin
const updateProduct = async (req, res) => {
    try {
        const before = await Product.findOne({ _id: req.params.id, ...NOT_DELETED }).select('price name').lean();

        const product = await Product.findOneAndUpdate(
            { _id: req.params.id, ...NOT_DELETED },
            await normalizeProductInput(req.body),
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // A price change is one of the events the dashboard's Recent
        // Activity feed exists for.
        if (before && req.body.price !== undefined && Number(req.body.price) !== before.price) {
            await logActivity(
                'PRICE_UPDATE',
                `Price updated for ${product.name}: $${before.price} → $${product.price}`,
                { productId: product._id }
            );
        }

        res.json(shapeProduct(product));
    } catch (error) {
        res.status(400).json({ message: errorMessage(error) });
    }
};

// @desc    Delete a product (soft — Settings → Deleted Items)
// @route   DELETE /api/products/:id
// @access  Admin
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        applySoftDelete(Product, product, req.user?._id);
        await product.save();
        res.json({ message: 'Product removed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};

