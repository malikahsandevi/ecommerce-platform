// Theme palettes — Settings → Appearance → Theme Colors.
//
// ONE palette colours BOTH the admin panel and the customer
// storefront (Ahsan's order: "tab hata do, dono ko aik hi colors
// apply hongy" — the per-target Admin/Storefront color split is
// gone). A palette is a complete, ready-made set of the four role
// colors (primary / secondary / text / background); there is no
// per-color editing anywhere.
//
// This table is the BACKEND copy: the admin keeps the identical
// table in admin/services/palettes.ts (with display names). The two
// must carry the same ids and hexes — ids are what gets stored in
// the Setting doc (appearance.palette), hexes are what the public
// storefront endpoint serves.

const PALETTES = [
    { id: 'sunset-orange', colors: { primary: '#f97316', secondary: '#334155', text: '#f3f4f6', background: '#0b0f19' } },
    { id: 'indigo-night', colors: { primary: '#4f46e5', secondary: '#818cf8', text: '#eef2ff', background: '#0d0d1d' } },
    { id: 'royal-blue', colors: { primary: '#2563eb', secondary: '#38bdf8', text: '#eff6ff', background: '#0a1120' } },
    { id: 'emerald-grove', colors: { primary: '#059669', secondary: '#34d399', text: '#ecfdf5', background: '#0a1512' } },
    { id: 'teal-lagoon', colors: { primary: '#0d9488', secondary: '#2dd4bf', text: '#f0fdfa', background: '#0a1414' } },
    { id: 'violet-dream', colors: { primary: '#7c3aed', secondary: '#c084fc', text: '#f5f3ff', background: '#130e20' } },
    { id: 'ruby-red', colors: { primary: '#e11d48', secondary: '#fb7185', text: '#fff1f2', background: '#180a11' } },
    { id: 'slate-mono', colors: { primary: '#64748b', secondary: '#94a3b8', text: '#f1f5f9', background: '#0d1117' } },
];

const DEFAULT_PALETTE_ID = 'sunset-orange';

const paletteById = (id) => PALETTES.find((palette) => palette.id === id) || null;

const paletteByPrimary = (hex) => {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    const needle = hex.toLowerCase();
    return PALETTES.find((palette) => palette.colors.primary === needle) || null;
};

/**
 * The palette a settings document resolves to: the stored palette id
 * wins; otherwise the legacy per-target hexes migrate — the ADMIN
 * color's palette first (it was the panel's live color), then the
 * storefront hex; otherwise the default palette (the current look).
 */
const resolvePaletteId = (appearance) => {
    if (!appearance) return DEFAULT_PALETTE_ID;
    if (appearance.palette && paletteById(appearance.palette)) return appearance.palette;
    const fromAdmin = paletteByPrimary(appearance.adminColor);
    if (fromAdmin) return fromAdmin.id;
    const fromStorefront = paletteByPrimary(appearance.storefrontColor);
    if (fromStorefront) return fromStorefront.id;
    return DEFAULT_PALETTE_ID;
};

module.exports = { PALETTES, DEFAULT_PALETTE_ID, paletteById, paletteByPrimary, resolvePaletteId };
