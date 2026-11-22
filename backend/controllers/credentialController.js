const {
    SECRET_MASK,
    refreshCredentials,
    saveCredentials,
    maskedView,
} = require('../utils/credentials');

// Settings → Credentials (Super Admin only — the route enforces it).
// GET answers the masked view: cloud name + API key in full, the two
// secrets only as a fixed mask with a "configured" flag. The full secret
// values NEVER leave the backend.
//
// @desc    Read the service credentials (secrets masked)
// @route   GET /api/settings/credentials
// @access  Private — Super Admin
const getCredentials = async (req, res) => {
    try {
        const values = await refreshCredentials();
        res.json(maskedView(values));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Save the service credentials to the DB store
// @route   PUT /api/settings/credentials
// @access  Private — Super Admin
//
// Body: { cloudinary: { cloudName, apiKey, apiSecret }, jwt: { secret } }
// Secret rule: an absent field, an empty string, or the mask itself all
// mean "keep the stored secret" — only a genuinely new value replaces
// it. Cloud name / API key are plain identifiers and save as given.
// The save takes effect immediately on this instance (the resolver
// refreshes + re-applies the Cloudinary SDK config); other instances
// converge within the resolver's 30s cache TTL. No redeploy needed.
const updateCredentials = async (req, res) => {
    try {
        const body = req.body || {};
        const cloudinary = body.cloudinary || {};
        const jwt = body.jwt || {};

        const current = maskedView(await refreshCredentials());
        const updates = {};

        if (cloudinary.cloudName !== undefined) {
            updates.cloudinaryCloudName = String(cloudinary.cloudName).trim();
        }
        if (cloudinary.apiKey !== undefined) {
            updates.cloudinaryApiKey = String(cloudinary.apiKey).trim();
        }

        const secretUpdate = (value) => {
            if (value === undefined || value === null) return undefined;
            const text = String(value);
            if (text === '' || text === SECRET_MASK) return undefined; // keep stored
            return text;
        };

        const apiSecret = secretUpdate(cloudinary.apiSecret);
        if (apiSecret !== undefined) updates.cloudinaryApiSecret = apiSecret;
        const jwtSecret = secretUpdate(jwt.secret);
        if (jwtSecret !== undefined) updates.jwtSecret = jwtSecret;

        // Nothing recognisable to save — answer with the current view
        // rather than writing an empty update.
        if (Object.keys(updates).length === 0) {
            return res.json(current);
        }

        const values = await saveCredentials(updates, req.user?._id);
        res.json(maskedView(values));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getCredentials, updateCredentials };
