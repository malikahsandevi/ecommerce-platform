const express = require('express');
const Setting = require('../models/Setting');

const router = express.Router();

// The storefront's brand color default — the same orange the admin
// ships with. Used until an admin picks a Storefront Color in
// Settings → Appearance.
const DEFAULT_STOREFRONT_COLOR = '#f97316';

// PUBLIC (no auth): the customer storefront reads its theme color
// from here. Returns exactly one non-sensitive value — the saved
// Settings → Appearance → Storefront Color, or the default. This is
// the consumption point the future storefront build will call on
// load; nothing else about the settings document is exposed.
router.get('/theme', async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 }).select('appearance.storefrontColor').lean();
        const saved = settings?.appearance?.storefrontColor;
        res.json({ storefrontColor: /^#[0-9a-fA-F]{6}$/.test(saved || '') ? saved : DEFAULT_STOREFRONT_COLOR });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
