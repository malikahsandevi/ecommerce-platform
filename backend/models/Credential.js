const mongoose = require('mongoose');

// Service credentials (Cloudinary + the JWT signing secret) live in ONE
// document (key "credentials") so they are managed from the admin panel
// (Settings → Credentials, Super Admin only) instead of hosting-platform
// environment variables. The document is SEEDED from the environment on
// first boot (utils/credentials.js) so an existing deployment migrates
// itself with identical values — live sessions and signed URLs survive
// the move. Runtime reads resolve per field: the stored value wins, the
// environment is the fallback (and MONGO_URI never lives here — the
// backend needs it before it can read any document).
const credentialSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: 'credentials' },
        cloudinaryCloudName: { type: String, default: '' },
        cloudinaryApiKey: { type: String, default: '' },
        cloudinaryApiSecret: { type: String, default: '' },
        jwtSecret: { type: String, default: '' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

module.exports = mongoose.model('Credential', credentialSchema);
