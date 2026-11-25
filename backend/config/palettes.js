// Theme palettes — Settings → Appearance → Theme Colors.
//
// ONE palette colours BOTH the admin panel and the customer
// storefront (Ahsan's order: "tab hata do, dono ko aik hi colors
// apply hongy" — the per-target Admin/Storefront color split is
// gone). A palette is a complete, ready-made set of the four role
// colors (primary / secondary / text / background); there is no
// per-color editing anywhere.
//
// EVERY palette carries TWO complete color sets: `dark` and `light`
// (the dark-only first version broke the white theme — in light
// mode the surfaces derived from the dark set washed the sidebar
// and content in the palette's hue). The light sets keep the white
// theme clean: pure-white background, near-black hue-tinted text,
// the same primary hex (every primary reads on white), and a
// secondary darkened enough to read on white.
//
// This table is the BACKEND copy: the admin keeps the identical
// table in admin/services/palettes.ts (with display names). The two
// must carry the same ids and hexes — ids are what gets stored in
// the Setting doc (appearance.palette), hexes are what the public
// storefront endpoint serves.

const PALETTES = [
    { id: 'sunset-orange',
      dark: { primary: '#f97316', secondary: '#334155', text: '#f3f4f6', background: '#0b0f19' },
      light: { primary: '#f97316', secondary: '#334155', text: '#111827', background: '#ffffff' } },
    { id: 'indigo-night',
      dark: { primary: '#4f46e5', secondary: '#818cf8', text: '#eef2ff', background: '#0d0d1d' },
      light: { primary: '#4f46e5', secondary: '#6366f1', text: '#1e1b4b', background: '#ffffff' } },
    { id: 'royal-blue',
      dark: { primary: '#2563eb', secondary: '#38bdf8', text: '#eff6ff', background: '#0a1120' },
      light: { primary: '#2563eb', secondary: '#0284c7', text: '#172554', background: '#ffffff' } },
    { id: 'emerald-grove',
      dark: { primary: '#059669', secondary: '#34d399', text: '#ecfdf5', background: '#0a1512' },
      light: { primary: '#059669', secondary: '#047857', text: '#022c22', background: '#ffffff' } },
    { id: 'teal-lagoon',
      dark: { primary: '#0d9488', secondary: '#2dd4bf', text: '#f0fdfa', background: '#0a1414' },
      light: { primary: '#0d9488', secondary: '#0f766e', text: '#042f2e', background: '#ffffff' } },
    { id: 'violet-dream',
      dark: { primary: '#7c3aed', secondary: '#c084fc', text: '#f5f3ff', background: '#130e20' },
      light: { primary: '#7c3aed', secondary: '#9333ea', text: '#2e1065', background: '#ffffff' } },
    { id: 'slate-mono',
      dark: { primary: '#64748b', secondary: '#94a3b8', text: '#f1f5f9', background: '#0d1117' },
      light: { primary: '#64748b', secondary: '#475569', text: '#0f172a', background: '#ffffff' } },
];

const DEFAULT_PALETTE_ID = 'sunset-orange';

const paletteById = (id) => PALETTES.find((palette) => palette.id === id) || null;

const paletteByPrimary = (hex) => {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    const needle = hex.toLowerCase();
    return PALETTES.find((palette) => palette.dark.primary === needle) || null;
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
