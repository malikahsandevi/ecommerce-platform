const express = require('express');
const router = express.Router();
const { Media, User, Product, Brand, Category } = require('../models');
const genericController = require('../controllers/genericController')(Media);
const cloudinary = require('../config/cloudinary');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { getCloudinaryCredentials } = require('../utils/credentials');
const { requirePermission } = require('../middleware/permissions');
const {
    parseCloudinaryUrl,
    canonicalUrl,
    signedUrl,
    ensureAuthenticatedAsset,
    destroyAsset,
} = require('../utils/cloudinaryUrl');


const UPLOAD_FOLDER = 'ecommerce-media';

// Storage organization: uploads are saved into a per-purpose folder
// under the one root, so the Cloudinary library stays sorted by what
// an image is FOR. Callers pass a purpose KEY (never a raw folder
// string); unknown or missing purposes land in the general library.
const PURPOSE_FOLDERS = {
    products: `${UPLOAD_FOLDER}/products`,
    categories: `${UPLOAD_FOLDER}/categories`,
    brands: `${UPLOAD_FOLDER}/brands`,
    profiles: `${UPLOAD_FOLDER}/profiles`,
    settings: `${UPLOAD_FOLDER}/settings`,
    library: `${UPLOAD_FOLDER}/library`,
};
const folderForPurpose = (purpose) =>
    PURPOSE_FOLDERS[purpose] || PURPOSE_FOLDERS.library;

// Mime types the Media schema accepts.
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/mov',
    'video/quicktime',
    'application/pdf',
    'application/msword',
];

// GET /api/media/storage — real storage picture for the Media page cards:
// this library's usage grouped by provider, plus the Cloudinary account's
// own usage/quota straight from the Cloudinary Admin API.
router.get('/storage', protect, requirePermission('Media', 'view'), async (req, res) => {
    try {
        const records = await Media.find().select('size url storageType').lean();

        const providerOf = (record) => {
            const url = record.url || '';
            if (url.includes('res.cloudinary.com')) return 'cloudinary';
            if (url.includes('amazonaws.com')) return 'aws';
            if (url.includes('firebasestorage') || url.includes('storage.googleapis.com')) return 'firebase';
            if (record.storageType === 'cloud') return 'cloudinary';
            return 'local';
        };

        const providers = {};
        let libraryBytes = 0;
        for (const record of records) {
            const name = providerOf(record);
            if (!providers[name]) providers[name] = { usedBytes: 0, files: 0 };
            providers[name].usedBytes += record.size || 0;
            providers[name].files += 1;
            libraryBytes += record.size || 0;
        }

        let cloudinaryUsage = null;
        try {
            const usage = await cloudinary.api.usage();
            cloudinaryUsage = {
                plan: usage.plan || null,
                storageUsedBytes: usage.storage?.usage ?? null,
                creditsUsed: usage.credits?.usage ?? null,
                creditsLimit: usage.credits?.limit ?? null,
                creditsUsedPercent: usage.credits?.used_percent ?? null,
                resources: usage.resources ?? null,
            };
        } catch {
            cloudinaryUsage = null; // panel falls back to library-only numbers
        }

        res.json({
            library: { files: records.length, usedBytes: libraryBytes },
            providers,
            cloudinary: cloudinaryUsage,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/media/upload — accepts a base64 data URL, stores the file on
// Cloudinary and registers a Media record. Mounted before /:id so "upload"
// is never treated as a document id.
router.post('/upload', protect, requirePermission('Media', 'create'), express.json({ limit: '15mb' }), async (req, res) => {
    try {
        const { dataUrl, filename, altText, title, description, status } = req.body || {};

        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
            return res.status(400).json({ message: 'A file (base64 data URL) is required.' });
        }

        const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
            return res.status(400).json({ message: `Unsupported file type: ${mimeType || 'unknown'}` });
        }

        // Media.uploadedBy is required — the uploader is the signed-in
        // user from the token (protect already ran). The client-sent id
        // is only a fallback for legacy callers, then the first admin.
        let uploadedBy = req.user?._id || req.body.uploadedBy;
        if (!uploadedBy) {
            const admin = await User.findOne({ role: { $in: ['Super Admin', 'Admin'] } }).select('_id');
            if (!admin) return res.status(400).json({ message: 'No admin user found to own the upload.' });
            uploadedBy = admin._id;
        }

        const result = await cloudinary.uploader.upload(dataUrl, {
            folder: folderForPurpose(req.body?.purpose),
            resource_type: 'auto',
            // Asset protection: new uploads are authenticated-type
            // assets — they only load through signed URLs (see
            // utils/cloudinaryUrl.js).
            type: 'authenticated',
        });

        const originalName = filename || result.original_filename || 'file';
        const extension = (result.format || originalName.split('.').pop() || '').toLowerCase();

        const media = await Media.create({
            filename: result.public_id.split('/').pop(),
            originalName,
            url: canonicalUrl({
                resourceType: result.resource_type,
                publicId: result.public_id,
                format: result.format || extension,
            }),
            path: result.public_id,
            mimeType,
            size: result.bytes || 0,
            extension,
            dimensions: result.width && result.height
                ? { width: result.width, height: result.height }
                : undefined,
            storageType: 'cloud',
            uploadedBy,
            title: title || originalName,
            // No alt written → the file's name becomes the alt text.
            altText: (altText && String(altText).trim()) || originalName,
            description: description || '',
            status: ['published', 'draft', 'archived'].includes(status) ? status : 'published',
        });

        res.status(201).json(media);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/media/upload-signature — direct-to-Cloudinary uploads.
// The backend used to receive every photo as base64 JSON, but on Vercel
// the platform rejects request bodies over ~4.5MB before Express runs,
// so any real photo died with a 413. Now the browser uploads the file
// straight to Cloudinary with this one-time signature and only the small
// registration JSON (below) ever touches the serverless function.
router.get('/upload-signature', protect, requireStaff, requirePermission('Media', 'create'), async (req, res) => {
    const timestamp = Math.round(Date.now() / 1000);
    // The caller's purpose picks the destination folder (storage
    // organization); only the fixed purpose keys are honoured.
    const folder = folderForPurpose(req.query.purpose);
    // Credentials come from the DB store (Settings → Credentials;
    // environment is only the seed/fallback) — a key rotated in the
    // panel signs the very next upload, no redeploy needed.
    const { cloudName, apiKey, apiSecret } = await getCloudinaryCredentials();
    // The delivery type is part of the signed parameters: the browser's
    // direct upload lands as an authenticated-type asset (asset
    // protection — see utils/cloudinaryUrl.js).
    const signature = cloudinary.utils.api_sign_request(
        { folder, timestamp, type: 'authenticated' },
        apiSecret
    );
    res.json({
        signature,
        timestamp,
        apiKey,
        cloudName,
        folder,
        type: 'authenticated',
    });
});

// POST /api/media/register — creates the Media record for a file the
// browser already uploaded directly to Cloudinary. The client only says
// WHERE the file went (publicId); every fact stored (URL, size, format,
// dimensions) is read back from Cloudinary's own API, so a client cannot
// register a record that lies about the file.
router.post('/register', protect, requireStaff, requirePermission('Media', 'create'), async (req, res) => {
    try {
        const { publicId, resourceType, originalName, mimeType, title, altText, description, status } = req.body || {};

        if (!publicId || typeof publicId !== 'string') {
            return res.status(400).json({ message: 'publicId is required.' });
        }

        const lookupType = ['image', 'video', 'raw'].includes(resourceType) ? resourceType : 'image';
        // Asset protection: uploads now land as authenticated-type
        // assets. Verify against that type; if an asset somehow arrived
        // as a public upload-type asset, migrate it on the spot so the
        // library never holds a publicly reachable file.
        let resource;
        try {
            resource = await cloudinary.api.resource(publicId, {
                resource_type: lookupType,
                type: 'authenticated',
            });
        } catch {
            try {
                const pub = await cloudinary.api.resource(publicId, {
                    resource_type: lookupType,
                    type: 'upload',
                });
                resource = await ensureAuthenticatedAsset({
                    publicId,
                    resourceType: lookupType,
                    sourceUrl: pub.secure_url,
                });
            } catch {
                return res.status(400).json({ message: 'The uploaded file could not be verified on Cloudinary.' });
            }
        }

        const format = String(resource.format || '').toLowerCase();
        const derivedMime =
            resource.resource_type === 'video'
                ? format === 'mov'
                    ? 'video/quicktime'
                    : `video/${format}`
                : resource.resource_type === 'raw'
                  ? format === 'pdf'
                      ? 'application/pdf'
                      : 'application/msword'
                  : format === 'jpg'
                    ? 'image/jpeg'
                    : format === 'svg'
                      ? 'image/svg+xml'
                      : `image/${format}`;

        // The browser-reported type wins when the schema accepts it (it is
        // the accurate one for e.g. .mov files); otherwise use the type
        // derived from Cloudinary's format.
        const finalMime = ALLOWED_MIME_TYPES.includes(mimeType) ? mimeType : derivedMime;
        if (!ALLOWED_MIME_TYPES.includes(finalMime)) {
            // A type the library does not accept — remove the orphaned
            // asset instead of leaving it on Cloudinary forever.
            try {
                await destroyAsset(publicId, resource.resource_type);
            } catch { /* best effort */ }
            return res.status(400).json({ message: `Unsupported file type: ${finalMime || 'unknown'}` });
        }

        const fallbackName = publicId.split('/').pop() || 'file';
        const storedOriginalName = originalName || fallbackName;
        const media = await Media.create({
            filename: fallbackName,
            originalName: storedOriginalName,
            url: canonicalUrl({
                resourceType: resource.resource_type || lookupType,
                publicId,
                format,
            }),
            path: publicId,
            mimeType: finalMime,
            size: resource.bytes || 0,
            extension: format,
            dimensions: resource.width && resource.height
                ? { width: resource.width, height: resource.height }
                : undefined,
            storageType: 'cloud',
            uploadedBy: req.user._id,
            title: title || originalName || fallbackName,
            // No alt written → the file's name becomes the alt text.
            altText: (altText && String(altText).trim()) || storedOriginalName,
            description: description || '',
            status: ['published', 'draft', 'archived'].includes(status) ? status : 'published',
        });

        res.status(201).json(media);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// GET /api/media — two modes:
//  • No `search` param: the legacy list (every record, natural order) the
//    Media page has always consumed.
//  • `search` param present (even empty): the library-picker mode —
//    case-insensitive partial match on the file NAME and ALT TEXT, plus an
//    _id match when the query is the start of an ObjectId hex string.
//    Newest first, capped by `limit` (default 60). `kind=image` narrows to
//    images and `status` to one lifecycle state.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listMedia = async (req, res) => {
    try {
        if (req.query.search === undefined) {
            const items = await Media.find();
            await Media.withCodes(items);
            return res.json(items);
        }

        const query = String(req.query.search || '').trim();
        const and = [];

        // A query that could be a (partial) public code: make sure legacy
        // records that never got a code have one before matching, or a
        // code search could never find them.
        if (/^[A-Za-z0-9]{1,6}$/.test(query)) {
            const missing = await Media.find({
                $or: [{ code: { $exists: false } }, { code: null }, { code: '' }],
            }).select('_id code');
            if (missing.length) await Media.withCodes(missing);
        }

        if (req.query.kind === 'image') {
            and.push({ mimeType: { $regex: '^image/', $options: 'i' } });
        }
        if (['published', 'draft', 'archived'].includes(req.query.status)) {
            and.push({ status: req.query.status });
        }

        if (query) {
            const rx = { $regex: escapeRegex(query), $options: 'i' };
            const or = [
                { originalName: rx },
                { filename: rx },
                { altText: rx },
                // Public code match: codes are stored UPPERCASE, so the
                // query is normalised to uppercase first — typing the code
                // in lowercase still finds the file. Prefix match, so a
                // partial code narrows the list as you type.
                { code: { $regex: `^${escapeRegex(query.toUpperCase())}` } },
            ];
            // An ObjectId typed (or pasted) into the search box: match any
            // id that STARTS with the query's hex characters.
            if (/^[0-9a-fA-F]{1,24}$/.test(query)) {
                or.push({
                    $expr: {
                        $regexMatch: {
                            input: { $toString: '$_id' },
                            regex: `^${query}`,
                            options: 'i',
                        },
                    },
                });
            }
            and.push({ $or: or });
        }

        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 200)
            : 60;

        const items = await Media.find(and.length ? { $and: and } : {})
            .sort({ createdAt: -1 })
            .limit(limit);
        await Media.withCodes(items);
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/media/:id/usage — everything using this media item, for the
// Edit Media panel's "Used In" list. A product uses the media when a
// gallery entry points at it by mediaId (the current contract) OR when a
// URL matches — the legacy single-image field and gallery entries saved
// before mediaId existed only have the URL to go on. Brands and
// categories keep a single image URL (Brand.logo, Category.image —
// neither stores a mediaId), so for them the URL match is the only link.
router.get('/:id/usage', async (req, res) => {
    try {
        const media = await Media.findById(req.params.id).select('_id url');
        if (!media) return res.status(404).json({ message: 'Not found' });

        const or = [{ 'images.mediaId': media._id }];
        if (media.url) {
            or.push({ image: media.url }, { 'images.url': media.url });
        }

        const [products, brands, categories] = await Promise.all([
            Product.find({ $or: or })
                .select('name image images status code')
                .sort({ name: 1 })
                .lean(),
            media.url
                ? Brand.find({ logo: media.url })
                      .select('name logo code isActive')
                      .sort({ name: 1 })
                      .lean()
                : [],
            media.url
                ? Category.find({ image: media.url })
                      .select('name image code isActive')
                      .sort({ name: 1 })
                      .lean()
                : [],
        ]);
        await Brand.withCodes(brands);
        await Category.withCodes(categories);

        res.json({
            products: products.map((product) => ({
                _id: product._id,
                code: product.code || null,
                name: product.name,
                image:
                    product.image ||
                    product.images?.find((entry) => entry.isMain)?.url ||
                    product.images?.[0]?.url ||
                    '',
                status: product.status || 'draft',
            })),
            brands: brands.map((brand) => ({
                _id: brand._id,
                code: brand.code || null,
                name: brand.name,
                image: brand.logo || '',
                // Brands/categories carry an isActive flag instead of a
                // status string — expose it as one for the panel.
                status: brand.isActive === false ? 'inactive' : 'active',
            })),
            categories: categories.map((category) => ({
                _id: category._id,
                code: category.code || null,
                name: category.name,
                image: category.image || '',
                status: category.isActive === false ? 'inactive' : 'active',
            })),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/media/:id/file — replace the stored FILE behind a media
// record (the Edit Media panel's optimizer save). The browser uploads
// the optimized file directly to Cloudinary first (same signed flow as
// /register) and sends only the new asset's facts here. The record is
// updated IN PLACE — same _id, same public code — so every link to it
// keeps working; stored URL references elsewhere are rewritten to the
// new URL, and the old Cloudinary asset is destroyed.
router.put('/:id/file', protect, requirePermission('Media', 'edit'), async (req, res) => {
    try {
        const media = await Media.findById(req.params.id);
        if (!media) return res.status(404).json({ message: 'Not found' });

        const { publicId, size, mimeType, format, dimensions, filename } = req.body || {};
        if (!publicId || typeof publicId !== 'string') {
            return res.status(400).json({ message: 'The new file publicId is required.' });
        }
        if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
            return res.status(400).json({ message: `Unsupported file type: ${mimeType}` });
        }

        // Asset protection: the stored URL is derived from Cloudinary's
        // own record of the new asset (never trusted from the client)
        // and kept in the canonical unsigned authenticated form. An
        // asset that arrived as a public upload is migrated on the spot.
        const resourceTypeOf = (mime) =>
            mime?.startsWith('video/')
                ? 'video'
                : mime === 'application/pdf' || mime === 'application/msword'
                  ? 'raw'
                  : 'image';
        const newResourceType = resourceTypeOf(mimeType || media.mimeType);
        let resource;
        try {
            resource = await cloudinary.api.resource(publicId, {
                resource_type: newResourceType,
                type: 'authenticated',
            });
        } catch {
            try {
                const pub = await cloudinary.api.resource(publicId, {
                    resource_type: newResourceType,
                    type: 'upload',
                });
                resource = await ensureAuthenticatedAsset({
                    publicId,
                    resourceType: newResourceType,
                    sourceUrl: pub.secure_url,
                });
            } catch {
                return res.status(400).json({ message: 'The replacement file could not be verified on Cloudinary.' });
            }
        }
        const url = canonicalUrl({
            resourceType: resource.resource_type || newResourceType,
            publicId,
            format: String(resource.format || format || '').toLowerCase(),
        });

        const oldUrl = media.url;
        const oldPath = media.path;
        const oldMimeType = media.mimeType;

        media.url = url;
        media.path = publicId;
        if (typeof resource.bytes === 'number') media.size = resource.bytes;
        else if (typeof size === 'number' && size >= 0) media.size = size;
        if (mimeType) media.mimeType = mimeType;
        if (resource.format) media.extension = String(resource.format).toLowerCase();
        else if (format) media.extension = String(format).toLowerCase();
        if (filename) media.filename = String(filename);
        if (resource.width && resource.height) {
            media.dimensions = { width: resource.width, height: resource.height };
        } else if (dimensions && (dimensions.width || dimensions.height)) {
            media.dimensions = {
                width: dimensions.width || undefined,
                height: dimensions.height || undefined,
            };
        }
        media.storageType = 'cloud';
        await media.save();

        // Rewrite every stored reference to the old URL so nothing keeps
        // pointing at the (about to be destroyed) old asset. Gallery
        // entries are matched by mediaId as well as by URL — an entry
        // linked by id must follow the record to its new URL.
        if (oldUrl && oldUrl !== url) {
            await Product.updateMany(
                { 'images.mediaId': media._id },
                { $set: { 'images.$[byId].url': url } },
                { arrayFilters: [{ 'byId.mediaId': media._id }] },
            );
            await Product.updateMany(
                { 'images.url': oldUrl },
                { $set: { 'images.$[byUrl].url': url } },
                { arrayFilters: [{ 'byUrl.url': oldUrl }] },
            );
            await Product.updateMany({ image: oldUrl }, { $set: { image: url } });
            await Brand.updateMany({ logo: oldUrl }, { $set: { logo: url } });
            await Category.updateMany({ image: oldUrl }, { $set: { image: url } });
            await User.updateMany({ avatar: oldUrl }, { $set: { avatar: url } });
        }

        // Best effort: remove the replaced file from Cloudinary (in
        // whichever delivery type it exists). The record already points
        // at the new asset, so a failure here only leaves an orphan
        // behind — it must not fail the save.
        if (oldPath && oldPath !== publicId) {
            try {
                await destroyAsset(oldPath, resourceTypeOf(oldMimeType));
            } catch {
                /* orphan cleanup is best effort */
            }
        }

        await Media.withCodes([media]);
        res.json(media);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/media/protect-migration — one-time, idempotent migration of
// EXISTING assets to authenticated delivery (asset protection). Each
// call migrates up to `batch` distinct assets: the asset is re-delivered
// as an authenticated-type copy, its public copy is destroyed (with CDN
// invalidation, so old public links die), and every stored reference —
// media records, product galleries, brand logos, category images, user
// avatars, settings logo/favicon — is rewritten to the canonical
// unsigned authenticated URL. Super Admin only. The response reports
// the old→new mapping per asset so the operator can archive it; call
// repeatedly until `remaining` reaches 0.
router.post('/protect-migration', protect, requirePermission('Media', 'edit'), async (req, res) => {
    res.locals.skipUrlSigning = true; // the mapping must report raw stored values
    try {
        if (req.user?.role !== 'Super Admin') {
            return res.status(403).json({ message: 'Only a Super Admin can run the media protection migration.' });
        }
        const { Setting } = require('../models');
        const batchSize = Math.min(Math.max(Number(req.body?.batch) || 6, 1), 10);
        const force = Boolean(req.body?.force);

        // --- Collect every stored reference, grouped by asset ---------
        const assetKey = (p) => `${p.resourceType}:${p.publicId}`;
        const assets = new Map(); // key -> { parts, refs: Set<string> }
        const noteValue = (value) => {
            const parts = parseCloudinaryUrl(value);
            if (!parts) return;
            const key = assetKey(parts);
            if (!assets.has(key)) assets.set(key, { parts, refs: new Set() });
            assets.get(key).refs.add(value);
        };
        const noteDeep = (value, depth = 0) => {
            if (depth > 8 || value === null || value === undefined) return;
            if (typeof value === 'string') return noteValue(value);
            if (Array.isArray(value)) return value.forEach((v) => noteDeep(v, depth + 1));
            if (typeof value === 'object') Object.values(value).forEach((v) => noteDeep(v, depth + 1));
        };

        const [mediaDocs, productDocs, brandDocs, categoryDocs, userDocs, settingDoc] =
            await Promise.all([
                Media.find().select('url path').lean(),
                Product.find().select('image images').lean(),
                Brand.find().select('logo').lean(),
                Category.find().select('image').lean(),
                User.find().select('avatar').lean(),
                Setting.findOne().select('general').lean(),
            ]);
        mediaDocs.forEach((d) => noteValue(d.url));
        productDocs.forEach((d) => { noteValue(d.image); (d.images || []).forEach((e) => noteValue(e?.url)); });
        brandDocs.forEach((d) => noteValue(d.logo));
        categoryDocs.forEach((d) => noteValue(d.image));
        userDocs.forEach((d) => noteValue(d.avatar));
        if (settingDoc?.general) { noteValue(settingDoc.general.logo); noteValue(settingDoc.general.favicon); }

        // An asset needs work when any stored reference is not already
        // the canonical authenticated form (or when forced to re-verify).
        const pending = [...assets.values()].filter(({ parts, refs }) => {
            if (force) return true;
            const canonical = canonicalUrl(parts);
            return [...refs].some((ref) => ref !== canonical);
        });

        const batch = pending.slice(0, batchSize);
        const processed = [];
        const failures = [];

        for (const { parts, refs } of batch) {
            const canonical = canonicalUrl(parts);
            try {
                const uploadRef = [...refs].find((ref) => {
                    const p = parseCloudinaryUrl(ref);
                    return p && p.deliveryType === 'upload';
                });
                const sourceUrl = uploadRef || signedUrl([...refs][0]);
                await ensureAuthenticatedAsset({
                    publicId: parts.publicId,
                    resourceType: parts.resourceType,
                    sourceUrl,
                });
                processed.push({
                    publicId: parts.publicId,
                    resourceType: parts.resourceType,
                    from: [...refs],
                    to: canonical,
                });
            } catch (error) {
                failures.push({
                    publicId: parts.publicId,
                    resourceType: parts.resourceType,
                    error: error.message || String(error),
                });
            }
        }

        // --- Rewrite stored references for the migrated assets --------
        if (processed.length) {
            const migrated = new Map(processed.map((p) => [`${p.resourceType}:${p.publicId}`, p.to]));
            const rewriteValue = (value) => {
                const parts = parseCloudinaryUrl(value);
                if (!parts) return value;
                return migrated.get(assetKey(parts)) || value;
            };
            const rewriteDoc = async (model, id, fields) => {
                const update = {};
                for (const [field, value] of Object.entries(fields)) {
                    if (value !== undefined) update[field] = value;
                }
                if (Object.keys(update).length) {
                    await model.updateOne({ _id: id }, { $set: update });
                }
            };

            const media = await Media.find().select('url path');
            for (const doc of media) {
                const next = rewriteValue(doc.url);
                if (next !== doc.url) await rewriteDoc(Media, doc._id, { url: next });
            }
            const products = await Product.find().select('image images');
            for (const doc of products) {
                const fields = {};
                const nextImage = rewriteValue(doc.image || '');
                if (doc.image && nextImage !== doc.image) fields.image = nextImage;
                let imagesChanged = false;
                const nextImages = (doc.images || []).map((entry) => {
                    const next = rewriteValue(entry?.url || '');
                    if (entry && next !== entry.url) imagesChanged = true;
                    return entry ? { ...entry.toObject(), url: next } : entry;
                });
                if (imagesChanged) fields.images = nextImages;
                await rewriteDoc(Product, doc._id, fields);
            }
            const brands = await Brand.find().select('logo');
            for (const doc of brands) {
                const next = rewriteValue(doc.logo || '');
                if (doc.logo && next !== doc.logo) await rewriteDoc(Brand, doc._id, { logo: next });
            }
            const categories = await Category.find().select('image');
            for (const doc of categories) {
                const next = rewriteValue(doc.image || '');
                if (doc.image && next !== doc.image) await rewriteDoc(Category, doc._id, { image: next });
            }
            const users = await User.find().select('avatar');
            for (const doc of users) {
                const next = rewriteValue(doc.avatar || '');
                if (doc.avatar && next !== doc.avatar) await rewriteDoc(User, doc._id, { avatar: next });
            }
            const setting = await Setting.findOne().select('general');
            if (setting?.general) {
                const fields = {};
                const nextLogo = rewriteValue(setting.general.logo || '');
                if (setting.general.logo && nextLogo !== setting.general.logo) fields['general.logo'] = nextLogo;
                const nextFavicon = rewriteValue(setting.general.favicon || '');
                if (setting.general.favicon && nextFavicon !== setting.general.favicon) fields['general.favicon'] = nextFavicon;
                await rewriteDoc(Setting, setting._id, fields);
            }
        }

        res.json({
            processed,
            failures,
            remaining: pending.length - processed.length - failures.length + failures.length,
            totalAssets: assets.size,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/media/folder-migration — one-time, idempotent organization
// of EXISTING assets into the per-purpose folders. Each asset's owner
// decides its folder (product references → products, category images →
// categories, brand logos → brands, user avatars → profiles, settings
// logo/favicon → settings, unreferenced → library). The asset is
// RENAMED on Cloudinary (delivery type preserved — a public asset is
// first re-delivered as authenticated, completing its protection),
// then every stored reference is rewritten to the new canonical URL,
// exactly like the protection migration. Super Admin only.
// Body: { dryRun?: boolean, batch?: number } — dryRun returns the full
// plan without moving anything; otherwise up to `batch` assets move
// per call and the response reports the old→new mapping per asset.
router.post('/folder-migration', protect, requirePermission('Media', 'edit'), async (req, res) => {
    res.locals.skipUrlSigning = true; // mappings must report raw stored values
    try {
        if (req.user?.role !== 'Super Admin') {
            return res.status(403).json({ message: 'Only a Super Admin can run the media folder migration.' });
        }
        const { Setting } = require('../models');
        const dryRun = Boolean(req.body?.dryRun);
        const batchSize = Math.min(Math.max(Number(req.body?.batch) || 6, 1), 10);
        const assetKey = (p) => `${p.resourceType}:${p.publicId}`;

        const [mediaDocs, productDocs, brandDocs, categoryDocs, userDocs, settingDoc] =
            await Promise.all([
                Media.find().select('url path').lean(),
                Product.find().select('image images').lean(),
                Brand.find().select('logo').lean(),
                Category.find().select('image').lean(),
                User.find().select('avatar').lean(),
                Setting.findOne().select('general').lean(),
            ]);

        // Ownership claims, in priority order — the first claim wins.
        const ownerOf = new Map();
        const claim = (value, folder) => {
            const parts = parseCloudinaryUrl(value);
            if (!parts) return;
            const key = assetKey(parts);
            if (!ownerOf.has(key)) ownerOf.set(key, folder);
        };
        productDocs.forEach((d) => { claim(d.image, 'products'); (d.images || []).forEach((e) => claim(e?.url, 'products')); });
        categoryDocs.forEach((d) => claim(d.image, 'categories'));
        brandDocs.forEach((d) => claim(d.logo, 'brands'));
        userDocs.forEach((d) => claim(d.avatar, 'profiles'));
        if (settingDoc?.general) { claim(settingDoc.general.logo, 'settings'); claim(settingDoc.general.favicon, 'settings'); }

        // The plan: one move per distinct asset that is not already in
        // its owner's folder. Non-Cloudinary values are left alone.
        const planByKey = new Map();
        for (const doc of mediaDocs) {
            const parts = parseCloudinaryUrl(doc.url);
            if (!parts) continue;
            const key = assetKey(parts);
            if (planByKey.has(key)) continue;
            const folder = ownerOf.get(key) || 'library';
            const base = parts.publicId.split('/').pop();
            const toPath = `${UPLOAD_FOLDER}/${folder}/${base}`;
            if (parts.publicId === toPath) continue;
            planByKey.set(key, {
                mediaId: doc._id,
                parts,
                folder,
                fromPath: parts.publicId,
                toPath,
                fromUrl: canonicalUrl(parts),
                toUrl: canonicalUrl({ ...parts, publicId: toPath }),
            });
        }
        const plan = [...planByKey.values()];

        if (dryRun) {
            return res.json({
                dryRun: true,
                totalPlanned: plan.length,
                plan: plan.map((p) => ({
                    mediaId: p.mediaId, folder: p.folder,
                    fromPath: p.fromPath, toPath: p.toPath,
                    from: p.fromUrl, to: p.toUrl,
                })),
            });
        }

        const batch = plan.slice(0, batchSize);
        const processed = [];
        const failures = [];

        for (const item of batch) {
            try {
                // Locate the asset and its delivery type.
                let dtype = 'authenticated';
                let found = true;
                try {
                    await cloudinary.api.resource(item.fromPath, {
                        resource_type: item.parts.resourceType,
                        type: 'authenticated',
                    });
                } catch {
                    try {
                        await cloudinary.api.resource(item.fromPath, {
                            resource_type: item.parts.resourceType,
                            type: 'upload',
                        });
                        dtype = 'upload';
                    } catch {
                        found = false;
                    }
                }
                if (!found) throw new Error('asset not found on Cloudinary');

                // A public asset is re-delivered as authenticated
                // first (same public_id), so the rename below keeps
                // the protected delivery type.
                if (dtype === 'upload') {
                    await ensureAuthenticatedAsset({
                        publicId: item.fromPath,
                        resourceType: item.parts.resourceType,
                        sourceUrl: signedUrl(item.fromUrl),
                    });
                    dtype = 'authenticated';
                }

                // The target name must be free in both delivery types.
                let occupied = false;
                for (const t of ['authenticated', 'upload']) {
                    try {
                        await cloudinary.api.resource(item.toPath, {
                            resource_type: item.parts.resourceType,
                            type: t,
                        });
                        occupied = true;
                    } catch { /* free in this type */ }
                }
                if (occupied) throw new Error('target public_id already exists');

                await cloudinary.uploader.rename(item.fromPath, item.toPath, {
                    resource_type: item.parts.resourceType,
                    type: dtype,
                    invalidate: true,
                });

                // Verify the moved asset answers as authenticated —
                // protection must survive the move.
                await cloudinary.api.resource(item.toPath, {
                    resource_type: item.parts.resourceType,
                    type: 'authenticated',
                });

                processed.push({
                    mediaId: item.mediaId,
                    folder: item.folder,
                    resourceType: item.parts.resourceType,
                    fromPath: item.fromPath,
                    toPath: item.toPath,
                    from: item.fromUrl,
                    to: item.toUrl,
                });
            } catch (error) {
                failures.push({
                    mediaId: item.mediaId,
                    fromPath: item.fromPath,
                    error: error.message || String(error),
                });
            }
        }

        // Rewrite every stored reference for the moved assets (media
        // url + path included), keyed by asset identity so any stored
        // form of the old URL follows.
        if (processed.length) {
            const movedByKey = new Map(
                processed.map((p) => [`${p.resourceType}:${p.fromPath}`, p]),
            );
            const rewriteValue = (value) => {
                const parts = parseCloudinaryUrl(value);
                if (!parts) return value;
                const hit = movedByKey.get(assetKey(parts));
                return hit ? hit.to : value;
            };
            const rewriteDoc = async (model, id, fields) => {
                if (Object.keys(fields).length) {
                    await model.updateOne({ _id: id }, { $set: fields });
                }
            };

            const media = await Media.find().select('url path');
            for (const doc of media) {
                const next = rewriteValue(doc.url);
                if (next !== doc.url) {
                    const parts = parseCloudinaryUrl(doc.url);
                    const hit = parts ? movedByKey.get(assetKey(parts)) : null;
                    await rewriteDoc(Media, doc._id, {
                        url: next,
                        ...(hit ? { path: hit.toPath } : {}),
                    });
                }
            }
            const products = await Product.find().select('image images');
            for (const doc of products) {
                const fields = {};
                const nextImage = rewriteValue(doc.image || '');
                if (doc.image && nextImage !== doc.image) fields.image = nextImage;
                let imagesChanged = false;
                const nextImages = (doc.images || []).map((entry) => {
                    const next = rewriteValue(entry?.url || '');
                    if (entry && next !== entry.url) imagesChanged = true;
                    return entry ? { ...entry.toObject(), url: next } : entry;
                });
                if (imagesChanged) fields.images = nextImages;
                await rewriteDoc(Product, doc._id, fields);
            }
            const brands = await Brand.find().select('logo');
            for (const doc of brands) {
                const next = rewriteValue(doc.logo || '');
                if (doc.logo && next !== doc.logo) await rewriteDoc(Brand, doc._id, { logo: next });
            }
            const categories = await Category.find().select('image');
            for (const doc of categories) {
                const next = rewriteValue(doc.image || '');
                if (doc.image && next !== doc.image) await rewriteDoc(Category, doc._id, { image: next });
            }
            const users = await User.find().select('avatar');
            for (const doc of users) {
                const next = rewriteValue(doc.avatar || '');
                if (doc.avatar && next !== doc.avatar) await rewriteDoc(User, doc._id, { avatar: next });
            }
            const setting = await Setting.findOne().select('general');
            if (setting?.general) {
                const fields = {};
                const nextLogo = rewriteValue(setting.general.logo || '');
                if (setting.general.logo && nextLogo !== setting.general.logo) fields['general.logo'] = nextLogo;
                const nextFavicon = rewriteValue(setting.general.favicon || '');
                if (setting.general.favicon && nextFavicon !== setting.general.favicon) fields['general.favicon'] = nextFavicon;
                await rewriteDoc(Setting, setting._id, fields);
            }
        }

        res.json({
            processed,
            failures,
            remaining: plan.length - processed.length,
            totalPlanned: plan.length,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.route('/').get(listMedia).post(protect, requirePermission('Media', 'create'), genericController.create);
router.route('/:id')
    .get(genericController.getById)
    .put(protect, requirePermission('Media', 'edit'), genericController.update)
    .delete(protect, requirePermission('Media', 'delete'), async (req, res) => {
        try {
            const media = await Media.findById(req.params.id);
            if (!media) return res.status(404).json({ message: 'Not found' });

            // Best effort: remove the file from Cloudinary too, so deleting
            // in the panel does not leave orphaned assets behind.
            if (media.storageType === 'cloud' && media.path) {
                try {
                    const resourceType = media.mimeType?.startsWith('video/')
                        ? 'video'
                        : media.mimeType === 'application/pdf' || media.mimeType === 'application/msword'
                          ? 'raw'
                          : 'image';
                    await destroyAsset(media.path, resourceType);
                } catch {
                    /* the record is still deleted below */
                }
            }

            await media.deleteOne();
            res.json({ message: 'Deleted successfully' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

module.exports = router;
