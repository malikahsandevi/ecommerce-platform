const express = require('express');
const router = express.Router();
const { Media, User, Product } = require('../models');
const genericController = require('../controllers/genericController')(Media);
const cloudinary = require('../config/cloudinary');
const { protect } = require('../middleware/auth');
const { requireStaff } = require('../middleware/admin');
const { requirePermission } = require('../middleware/permissions');


const UPLOAD_FOLDER = 'ecommerce-media';

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
            folder: 'ecommerce-media',
            resource_type: 'auto',
        });

        const originalName = filename || result.original_filename || 'file';
        const extension = (result.format || originalName.split('.').pop() || '').toLowerCase();

        const media = await Media.create({
            filename: result.public_id.split('/').pop(),
            originalName,
            url: result.secure_url,
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
router.get('/upload-signature', protect, requireStaff, requirePermission('Media', 'create'), (req, res) => {
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
        { folder: UPLOAD_FOLDER, timestamp },
        process.env.CLOUDINARY_API_SECRET
    );
    res.json({
        signature,
        timestamp,
        apiKey: process.env['CLOUDINARY_API_KEY'],
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        folder: UPLOAD_FOLDER,
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
        let resource;
        try {
            resource = await cloudinary.api.resource(publicId, { resource_type: lookupType });
        } catch {
            return res.status(400).json({ message: 'The uploaded file could not be verified on Cloudinary.' });
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
                await cloudinary.uploader.destroy(publicId, { resource_type: resource.resource_type });
            } catch { /* best effort */ }
            return res.status(400).json({ message: `Unsupported file type: ${finalMime || 'unknown'}` });
        }

        const fallbackName = publicId.split('/').pop() || 'file';
        const storedOriginalName = originalName || fallbackName;
        const media = await Media.create({
            filename: fallbackName,
            originalName: storedOriginalName,
            url: resource.secure_url,
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

// GET /api/media/:id/usage — the products using this media item, for the
// Edit Media panel's "Used In" list. A product uses the media when a
// gallery entry points at it by mediaId (the current contract) OR when a
// URL matches — the legacy single-image field and gallery entries saved
// before mediaId existed only have the URL to go on.
router.get('/:id/usage', async (req, res) => {
    try {
        const media = await Media.findById(req.params.id).select('_id url');
        if (!media) return res.status(404).json({ message: 'Not found' });

        const or = [{ 'images.mediaId': media._id }];
        if (media.url) {
            or.push({ image: media.url }, { 'images.url': media.url });
        }

        const products = await Product.find({ $or: or })
            .select('name image images status code')
            .sort({ name: 1 })
            .lean();

        res.json(
            products.map((product) => ({
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
        );
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
                    await cloudinary.uploader.destroy(media.path, { resource_type: resourceType });
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
