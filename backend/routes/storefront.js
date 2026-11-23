const express = require('express');
const Setting = require('../models/Setting');
const { paletteById, resolvePaletteId } = require('../config/palettes');

const router = express.Router();

// PUBLIC (no auth): the customer storefront reads its theme palette
// from here. ONE palette colours the storefront AND the admin panel
// together (Settings → Appearance → Theme Colors), so this returns
// the same palette the panel resolved: its id and its four role
// colors. Resolution: the kept palette id wins; the legacy
// storefront/admin hexes migrate by primary-color match; otherwise
// the default palette. Nothing else about the settings document is
// exposed — palette ids and brand colors are not sensitive.
router.get('/theme', async (req, res) => {
    try {
        const settings = await Setting.findOne().sort({ createdAt: 1 }).select('appearance').lean();
        const palette = paletteById(resolvePaletteId(settings?.appearance));
        res.json({ palette: palette.id, colors: { ...palette.colors } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
