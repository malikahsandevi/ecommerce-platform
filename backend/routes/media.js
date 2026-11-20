const express = require('express');
const router = express.Router();
const { Media, User } = require('../models');
const genericController = require('../controllers/genericController')(Media);
const cloudinary = require('../config/cloudinary');

// Mime types the Media schema accepts.
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/mov',
    'application/pdf',
    'application/msword',
];

// POST /api/media/upload — accepts a base64 data URL, stores the file on
// Cloudinary and registers a Media record. Mounted before /:id so "upload"
// is never treated as a document id.
router.post('/upload', express.json({ limit: '15mb' }), async (req, res) => {
    try {
        const { dataUrl, filename, altText, title, description } = req.body || {};

        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
            return res.status(400).json({ message: 'A file (base64 data URL) is required.' });
        }

        const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
            return res.status(400).json({ message: `Unsupported file type: ${mimeType || 'unknown'}` });
        }

        // Media.uploadedBy is required — prefer the id the client sends,
        // otherwise fall back to the first admin account.
        let uploadedBy = req.body.uploadedBy;
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
            altText: altText || '',
            description: description || '',
        });

        res.status(201).json(media);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.route('/').get(genericController.getAll).post(genericController.create);
router.route('/:id').get(genericController.getById).put(genericController.update).delete(genericController.remove);

module.exports = router;
