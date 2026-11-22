const mongoose = require('mongoose');

// LEGACY store — kept only as the one-time migration source.
// Service credentials (Cloudinary + the JWT signing secret) used to
// live in this ONE document (key "credentials"), managed from a
// dedicated Settings section. They are NORMAL services now: their
// values live in the Setting document's integrations entries
// (sub-services "cloudinary" and "store-session-jwt"), and
// utils/credentials.js copies them there verbatim on first boot, then
// never reads this collection again. Nothing new must read or write
// this model.
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
