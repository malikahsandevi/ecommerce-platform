const express = require('express');
const router = express.Router();
const { Media, User, Product, Brand, Category } = require('../models');
const genericController = require('../controllers/genericController')(Media);
const cloudinary = require('../config/cloudinary');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const {
    getCloudinaryCredentials,
    isCloudinaryActive,
    currentCredentials,
    getStorageEntries,
    getDefaultStorageEntry,
    getStorageEntryBySlug,
    getStorageEntryByCloudName,
    resolveUploadTarget,
    resolveUploadTargetDetailed,
    setUploadTarget,
} = require('../utils/credentials');
const cloudinaryClient = require('../utils/cloudinaryClient');
const { requirePermission } = require('../middleware/permissions');
const { makeDeleteImpactHandler } = require('../controllers/deleteImpactController');
const { detachForDelete } = require('../utils/deleteImpact');
const {
    parseCloudinaryUrl,
    canonicalUrl,
    signedUrl,
    ensureAuthenticatedAsset,
    destroyAsset,
} = require('../utils/cloudinaryUrl');
const { NOT_DELETED, applySoftDelete } = require('../utils/softDelete');
const { sendError, translateErrorMessage } = require('../utils/apiError');


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

// Activation gate for the built-in Cloudinary service (Settings →
// API / Integrations): when the admin has toggled Cloudinary OFF, the
// media path refuses every operation that would call Cloudinary —
// uploads, upload signatures, registrations and asset mutations. The
// stored library records themselves are untouched and come back the
// moment the service is switched on again.
const CLOUDINARY_OFF_MESSAGE = 'Cloudinary is switched off.';
const refuseIfCloudinaryOff = async (res) => {
    if (await isCloudinaryActive()) return false;
    res.status(403).json({ message: CLOUDINARY_OFF_MESSAGE });
    return true;
};

// --- Per-entry storage -----------------------------------------------------
// Media no longer assumes ONE Cloudinary account: every record is
// stamped with the storage ENTRY (Settings integrations serviceSlug)
// it lives on, uploads go to the admin-chosen target entry, and asset
// operations run against the entry that owns the asset. The original
// (first) Cloudinary entry keeps the SDK-singleton code paths; other
// entries go through the per-entry REST client (utils/cloudinaryClient).

const credsOf = (entry) =>
    entry
        ? { cloudName: entry.cloudName, apiKey: entry.apiKey, apiSecret: entry.apiSecret }
        : null;

const isDefaultEntry = async (entry) => {
    if (!entry) return false;
    const fallback = await getDefaultStorageEntry();
    return Boolean(fallback) && entry.slug === fallback.slug;
};

/** The entry a media record lives on (its stamp, else its URL's cloud,
 *  else the original entry — pre-stamp records belong to the original). */
const entryForMedia = async (media) => {
    const bySlug = await getStorageEntryBySlug(media?.storageEntry);
    if (bySlug) return bySlug;
    const parts = parseCloudinaryUrl(media?.url || '');
    const byCloud = parts ? await getStorageEntryByCloudName(parts.cloudName) : null;
    if (byCloud) return byCloud;
    return getDefaultStorageEntry();
};

/** Read one asset's facts from the account of the given entry. */
const fetchResource = async (entry, publicId, resourceType, type) => {
    if (await isDefaultEntry(entry)) {
        return cloudinary.api.resource(publicId, { resource_type: resourceType, type });
    }
    return cloudinaryClient.resource(credsOf(entry), publicId, { resourceType, type });
};

/**
 * Gate for upload flows: resolves the upload destination through the
 * Auto rotation / pin policy (utils/credentials) and refuses when the
 * policy stops the upload (destination at the 98% stop line, or the
 * file fits nowhere), when there is nothing configured to receive
 * uploads, or when the resolved entry is switched off. `fileSize`
 * (bytes, when the caller knows it) feeds the policy's fit check.
 * Returns { entry, warning } — warning is the ≥90% notice the client
 * shows at upload time — or null after responding.
 */
const requireUploadTarget = async (res, fileSize = null) => {
    const detail = await resolveUploadTargetDetailed({ fileSize });
    if (detail.blocked) {
        res.status(400).json({ message: detail.blockMessage });
        return null;
    }
    const target = detail.entry;
    if (!target || !target.configured) {
        res.status(400).json({
            message: 'No storage is configured for uploads.',
        });
        return null;
    }
    if (!target.isConnected) {
        res.status(403).json({
            message: `${target.title} is switched off.`,
        });
        return null;
    }
    return { entry: target, warning: detail.warning };
};

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

// GET /api/media/storage — real storage picture for the Media page cards,
// measured PER STORAGE ENTRY: for every configured entry, this library's
// bytes + file count on it (database truth — the per-entry figures sum
// exactly to the library total) and, for Cloudinary entries, the
// ACCOUNT's own usage/quota from that account's Admin API (an account
// can hold assets beyond this library, so account usage is reported
// distinctly from library usage — never blended into one number).
router.get('/storage', protect, requirePermission('Media', 'view'), async (req, res) => {
    try {
        const entries = await getStorageEntries();
        const defaultEntry = entries.find((entry) => entry.subService === 'cloudinary') || null;
        const defaultSlug = defaultEntry?.slug || 'cloudinary';

        // One-time, idempotent backfill: records created before
        // per-entry storage carry no stamp — they all live on the
        // original entry, so stamp them with its slug.
        await Media.updateMany(
            {
                ...NOT_DELETED,
                storageType: 'cloud',
                $or: [
                    { storageEntry: { $exists: false } },
                    { storageEntry: '' },
                    { storageEntry: null },
                ],
            },
            { $set: { storageEntry: defaultSlug } },
        );

        const records = await Media.find({ ...NOT_DELETED }).select('size url storageType storageEntry').lean();

        // Non-cloud records (legacy local files) keep the old URL-based
        // buckets; cloud records group by their entry stamp.
        const legacyProviderOf = (record) => {
            const url = record.url || '';
            if (url.includes('amazonaws.com')) return 'aws';
            if (url.includes('firebasestorage') || url.includes('storage.googleapis.com')) return 'firebase';
            return 'local';
        };

        const providers = {};
        let libraryBytes = 0;
        for (const record of records) {
            const name =
                record.storageType === 'cloud'
                    ? record.storageEntry || defaultSlug
                    : legacyProviderOf(record);
            if (!providers[name]) providers[name] = { usedBytes: 0, files: 0 };
            providers[name].usedBytes += record.size || 0;
            providers[name].files += 1;
            libraryBytes += record.size || 0;
        }

        // Account usage per Cloudinary entry — fetched in parallel,
        // each with its own credentials and a short timeout; a failed
        // or slow call leaves that entry's usage null and the panel
        // falls back to the library-measured bytes for it.
        const entryViews = await Promise.all(
            entries.map(async (entry) => {
                const bucket = providers[entry.slug] || { usedBytes: 0, files: 0 };
                let usage = null;
                if (entry.subService === 'cloudinary' && entry.configured && entry.isConnected) {
                    try {
                        usage = await cloudinaryClient.usage(credsOf(entry));
                    } catch {
                        usage = null;
                    }
                }
                return {
                    slug: entry.slug,
                    title: entry.title,
                    subService: entry.subService,
                    isConnected: entry.isConnected,
                    configured: entry.configured,
                    ...(entry.subService === 'cloudinary' ? { cloudName: entry.cloudName } : {}),
                    // The space the admin wrote in this entry's
                    // Settings plan field ("" when not filled) — the
                    // Space by Provider card shows it as the total in
                    // preference to the provider-reported quota.
                    planStorageLimit: entry.planStorageLimit || '',
                    usedBytes: bucket.usedBytes,
                    files: bucket.files,
                    usage,
                };
            }),
        );

        const targetDetail = await resolveUploadTargetDetailed();

        res.json({
            library: { files: records.length, usedBytes: libraryBytes },
            providers,
            entries: entryViews,
            // The entry new uploads will actually land on (pin or Auto
            // resolution), the admin's stored choice ("auto" or an
            // entry slug), and whether a stored pin is currently being
            // overridden by Auto (its entry is off/unconfigured, or
            // the pin was removed) — the Media page card renders the
            // destination control from these three.
            uploadTarget: targetDetail.entry?.slug || defaultSlug,
            uploadTargetChoice: targetDetail.choice,
            uploadTargetFallback:
                targetDetail.choice !== 'auto' && targetDetail.mode === 'auto',
            // Back-compat: the original entry's account usage, as before.
            cloudinary: entryViews.find((view) => view.slug === defaultSlug)?.usage ?? null,
        });
    } catch (error) {
        sendError(res, error, 500);
    }
});

// PUT /api/media/storage/target — choose where NEW uploads go: "auto"
// (the rotation policy decides) or the slug of one configured storage
// entry (a pin that overrides Auto). Persisted in the Setting
// document; existing media stay on the entry they already live on.
router.put('/storage/target', protect, requirePermission('Media', 'edit'), async (req, res) => {
    try {
        const slug = String(req.body?.slug || '');
        if (slug === 'auto') {
            await setUploadTarget('auto');
            return res.json({ uploadTarget: 'auto' });
        }
        const entry = (await getStorageEntries()).find((item) => item.slug === slug);
        if (!entry || entry.subService !== 'cloudinary' || !entry.configured) {
            return res.status(400).json({
                message: 'That storage entry cannot receive uploads — it must be a fully configured Cloudinary entry.',
            });
        }
        if (!entry.isConnected) {
            return res.status(400).json({
                message: `${entry.title} is switched off.`,
            });
        }
        await setUploadTarget(slug);
        res.json({ uploadTarget: slug });
    } catch (error) {
        sendError(res, error, 500);
    }
});

// POST /api/media/upload — accepts a base64 data URL, stores the file on
// Cloudinary and registers a Media record. Mounted before /:id so "upload"
// is never treated as a document id.
router.post('/upload', protect, requirePermission('Media', 'create'), express.json({ limit: '15mb' }), async (req, res) => {
    try {
        const { dataUrl, filename, altText, title, description, status } = req.body || {};
        // The rotation policy's fit check needs the file's size before
        // anything is written — a base64 payload's byte size is 3/4 of
        // its character length.
        let fileSize = null;
        if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            const comma = dataUrl.indexOf(',');
            if (comma > 0) fileSize = Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
        }
        const resolved = await requireUploadTarget(res, fileSize);
        if (!resolved) return;
        const target = resolved.entry;

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

        const uploadParams = {
            folder: folderForPurpose(req.body?.purpose),
            resource_type: 'auto',
            // Asset protection: new uploads are authenticated-type
            // assets — they only load through signed URLs (see
            // utils/cloudinaryUrl.js).
            type: 'authenticated',
        };
        const result = (await isDefaultEntry(target))
            ? await cloudinary.uploader.upload(dataUrl, uploadParams)
            : await cloudinaryClient.upload(credsOf(target), dataUrl, uploadParams);

        const originalName = filename || result.original_filename || 'file';
        const extension = (result.format || originalName.split('.').pop() || '').toLowerCase();

        const media = await Media.create({
            filename: result.public_id.split('/').pop(),
            originalName,
            url: canonicalUrl({
                resourceType: result.resource_type,
                publicId: result.public_id,
                format: result.format || extension,
                cloudName: target.cloudName,
            }),
            path: result.public_id,
            mimeType,
            size: result.bytes || 0,
            extension,
            dimensions: result.width && result.height
                ? { width: result.width, height: result.height }
                : undefined,
            storageType: 'cloud',
            storageEntry: target.slug,
            uploadedBy,
            title: title || originalName,
            // No alt written → the file's name becomes the alt text.
            altText: (altText && String(altText).trim()) || originalName,
            description: description || '',
            status: ['published', 'draft', 'archived'].includes(status) ? status : 'published',
        });

        const payload = media.toJSON();
        if (resolved.warning) payload.storageWarning = resolved.warning;
        res.status(201).json(payload);
    } catch (error) {
        sendError(res, error, 400);
    }
});

// GET /api/media/upload-signature — direct-to-Cloudinary uploads.
// The backend used to receive every photo as base64 JSON, but on Vercel
// the platform rejects request bodies over ~4.5MB before Express runs,
// so any real photo died with a 413. Now the browser uploads the file
// straight to Cloudinary with this one-time signature and only the small
// registration JSON (below) ever touches the serverless function.
router.get('/upload-signature', protect, requireStaff, requirePermission('Media', 'create'), async (req, res) => {
    // The client reports the file's size so the rotation policy can
    // run its fit check (and its 98% stop) before a signature is
    // issued — a refused upload never leaves an orphan on Cloudinary.
    const parsedSize = Number(req.query.size);
    const resolved = await requireUploadTarget(
        res,
        Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : null,
    );
    if (!resolved) return;
    const target = resolved.entry;
    const timestamp = Math.round(Date.now() / 1000);
    // The caller's purpose picks the destination folder (storage
    // organization); only the fixed purpose keys are honoured.
    const folder = folderForPurpose(req.query.purpose);
    // Credentials come from the UPLOAD TARGET entry in the DB store
    // (Settings → API / Integrations; environment is only the
    // seed/fallback for the original entry) — the signature is issued
    // for the account that will actually receive the file, and a key
    // rotated in the panel signs the very next upload, no redeploy.
    const { cloudName, apiKey, apiSecret } = credsOf(target);
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
        entry: target.slug,
        // The ≥90% destination warning, when the policy produced one —
        // the client shows it at upload time.
        storageWarning: resolved.warning || null,
    });
});

// POST /api/media/register — creates the Media record for a file the
// browser already uploaded directly to Cloudinary. The client only says
// WHERE the file went (publicId); every fact stored (URL, size, format,
// dimensions) is read back from Cloudinary's own API, so a client cannot
// register a record that lies about the file.
router.post('/register', protect, requireStaff, requirePermission('Media', 'create'), async (req, res) => {
    try {
        const { publicId, resourceType, originalName, mimeType, title, altText, description, status, cloudName, entry: entrySlug } = req.body || {};

        if (!publicId || typeof publicId !== 'string') {
            return res.status(400).json({ message: 'publicId is required.' });
        }

        // The file was uploaded with a signature issued for one entry —
        // the browser reports that entry's slug (and its cloud name),
        // and verification runs against THAT entry. Fallback: the
        // current upload target.
        const entry =
            (await getStorageEntryBySlug(entrySlug)) ||
            (await getStorageEntryByCloudName(cloudName)) ||
            (await resolveUploadTarget());
        if (!entry || !entry.configured) {
            return res.status(400).json({ message: 'The uploaded file could not be verified on Cloudinary.' });
        }
        if (!entry.isConnected) {
            return res.status(403).json({
                message: `${entry.title} is switched off.`,
            });
        }
        const entryCreds = credsOf(entry);

        const lookupType = ['image', 'video', 'raw'].includes(resourceType) ? resourceType : 'image';
        // Asset protection: uploads now land as authenticated-type
        // assets. Verify against that type; if an asset somehow arrived
        // as a public upload-type asset, migrate it on the spot so the
        // library never holds a publicly reachable file.
        let resource;
        try {
            resource = await fetchResource(entry, publicId, lookupType, 'authenticated');
        } catch {
            try {
                const pub = await fetchResource(entry, publicId, lookupType, 'upload');
                resource = await ensureAuthenticatedAsset({
                    publicId,
                    resourceType: lookupType,
                    sourceUrl: pub.secure_url,
                    creds: entryCreds,
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
                await destroyAsset(publicId, resource.resource_type, entryCreds);
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
                cloudName: entry.cloudName,
            }),
            path: publicId,
            mimeType: finalMime,
            size: resource.bytes || 0,
            extension: format,
            dimensions: resource.width && resource.height
                ? { width: resource.width, height: resource.height }
                : undefined,
            storageType: 'cloud',
            storageEntry: entry.slug,
            uploadedBy: req.user._id,
            title: title || originalName || fallbackName,
            // No alt written → the file's name becomes the alt text.
            altText: (altText && String(altText).trim()) || storedOriginalName,
            description: description || '',
            status: ['published', 'draft', 'archived'].includes(status) ? status : 'published',
        });

        res.status(201).json(media);
    } catch (error) {
        sendError(res, error, 400);
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
            const items = await Media.find({ ...NOT_DELETED });
            await Media.withCodes(items);
            return res.json(items);
        }

        const query = String(req.query.search || '').trim();
        const and = [{ ...NOT_DELETED }];

        // A query that could be a (partial) public code: make sure legacy
        // records that never got a code have one before matching, or a
        // code search could never find them.
        if (/^[A-Za-z0-9]{1,6}$/.test(query)) {
            const missing = await Media.find({
                $or: [{ code: { $exists: false } }, { code: null }, { code: '' }],
                ...NOT_DELETED,
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
        sendError(res, error, 500);
    }
};

// GET /api/media/:id/delete-impact — the links the delete
// confirmation warns about (products/categories/brands using it).
router.get('/:id/delete-impact', protect, requirePermission('Media', 'delete'), makeDeleteImpactHandler(Media, 'media'));

// GET /api/media/:id/usage — everything using this media item, for the
// Edit Media panel's "Used In" list. A product uses the media when a
// gallery entry points at it by mediaId (the current contract) OR when a
// URL matches — the legacy single-image field and gallery entries saved
// before mediaId existed only have the URL to go on. Brands and
// categories keep a single image URL (Brand.logo, Category.image —
// neither stores a mediaId), so for them the URL match is the only link.
router.get('/:id/usage', async (req, res) => {
    try {
        const media = await Media.findOne({ _id: req.params.id, ...NOT_DELETED }).select('_id url');
        if (!media) return res.status(404).json({ message: 'Not found' });

        const or = [{ 'images.mediaId': media._id }];
        if (media.url) {
            or.push({ image: media.url }, { 'images.url': media.url });
        }

        const [products, brands, categories] = await Promise.all([
            Product.find({ $and: [{ $or: or }, NOT_DELETED] })
                .select('name image images status code')
                .sort({ name: 1 })
                .lean(),
            media.url
                ? Brand.find({ logo: media.url, ...NOT_DELETED })
                      .select('name logo code isActive')
                      .sort({ name: 1 })
                      .lean()
                : [],
            media.url
                ? Category.find({ image: media.url, ...NOT_DELETED })
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
        sendError(res, error, 500);
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
        const media = await Media.findOne({ _id: req.params.id, ...NOT_DELETED });
        if (!media) return res.status(404).json({ message: 'Not found' });

        const { publicId, size, mimeType, format, dimensions, filename, cloudName, entry: entrySlug } = req.body || {};
        if (!publicId || typeof publicId !== 'string') {
            return res.status(400).json({ message: 'The new file publicId is required.' });
        }
        if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
            return res.status(400).json({ message: `Unsupported file type: ${mimeType}` });
        }

        // The replacement was uploaded with a signature for the current
        // upload target's account — verify it against THAT entry. The
        // record then lives on that entry; the OLD asset is destroyed
        // through the entry the record used to live on (below).
        const newEntry =
            (await getStorageEntryBySlug(entrySlug)) ||
            (await getStorageEntryByCloudName(cloudName)) ||
            (await resolveUploadTarget());
        if (!newEntry || !newEntry.configured) {
            return res.status(400).json({ message: 'The replacement file could not be verified on Cloudinary.' });
        }
        if (!newEntry.isConnected) {
            return res.status(403).json({
                message: `${newEntry.title} is switched off.`,
            });
        }
        const newEntryCreds = credsOf(newEntry);

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
            resource = await fetchResource(newEntry, publicId, newResourceType, 'authenticated');
        } catch {
            try {
                const pub = await fetchResource(newEntry, publicId, newResourceType, 'upload');
                resource = await ensureAuthenticatedAsset({
                    publicId,
                    resourceType: newResourceType,
                    sourceUrl: pub.secure_url,
                    creds: newEntryCreds,
                });
            } catch {
                return res.status(400).json({ message: 'The replacement file could not be verified on Cloudinary.' });
            }
        }
        const url = canonicalUrl({
            resourceType: resource.resource_type || newResourceType,
            publicId,
            format: String(resource.format || format || '').toLowerCase(),
            cloudName: newEntry.cloudName,
        });

        const oldUrl = media.url;
        const oldPath = media.path;
        const oldMimeType = media.mimeType;
        // The entry the OLD asset lives on — its destroy must run
        // against that account, not the replacement's.
        const oldEntry = await entryForMedia(media);

        media.url = url;
        media.path = publicId;
        media.storageEntry = newEntry.slug;
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
        // whichever delivery type it exists), through the OLD asset's
        // own entry. The record already points at the new asset, so a
        // failure here only leaves an orphan behind — it must not fail
        // the save.
        if (oldPath && oldPath !== publicId) {
            try {
                await destroyAsset(oldPath, resourceTypeOf(oldMimeType), credsOf(oldEntry));
            } catch {
                /* orphan cleanup is best effort */
            }
        }

        await Media.withCodes([media]);
        res.json(media);
    } catch (error) {
        sendError(res, error, 500);
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
            // This migration runs on the original entry's account only —
            // assets living on other storage entries are left alone.
            if (parts.cloudName !== currentCredentials().cloudinaryCloudName) return;
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
                    error: translateErrorMessage(error),
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
        sendError(res, error, 500);
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
            // Original entry's account only — see the protection migration.
            if (parts.cloudName !== currentCredentials().cloudinaryCloudName) continue;
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
                    error: translateErrorMessage(error),
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
        sendError(res, error, 500);
    }
});

router.route('/').get(listMedia).post(protect, requirePermission('Media', 'create'), genericController.create);
router.route('/:id')
    .get(genericController.getById)
    .put(protect, requirePermission('Media', 'edit'), genericController.update)
    .delete(protect, requirePermission('Media', 'delete'), async (req, res) => {
        try {
            const media = await Media.findOne({ _id: req.params.id, ...NOT_DELETED });
            if (!media) return res.status(404).json({ message: 'Not found' });

            // Delete-impact: the media leaves every place it was
            // used (product galleries, category/brand images) and
            // the removals are snapshotted for an exact restore.
            const snapshot = await detachForDelete('media', media);
            if (snapshot) media.set('deletedLinks', snapshot);
            applySoftDelete(Media, media, req.user?._id);
            await media.save();
            res.json({ message: 'Deleted successfully' });
        } catch (error) {
            sendError(res, error, 500);
        }
    });

module.exports = router;
