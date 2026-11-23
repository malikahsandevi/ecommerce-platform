// Theme palettes — Settings → Appearance → Theme Colors.
//
// ONE palette colours BOTH the admin panel and the customer
// storefront (Ahsan's order: "tab hata do, dono ko aik hi colors
// apply hongy" — the old per-target Admin/Storefront color cards
// are gone). A palette is a complete, ready-made set of the four
// role colors; selecting means choosing a WHOLE palette — there is
// no per-color editing anywhere.
//
// This table is the ADMIN copy (ids + hexes + display names). The
// backend keeps the identical ids/hexes in backend/config/palettes.js
// for validation and the public /api/storefront/theme endpoint —
// the two must never drift.

export interface PaletteColors {
  primary: string;
  secondary: string;
  text: string;
  background: string;
}

export interface PaletteDef {
  id: string;
  /** English display name — rendered through t() like every UI string. */
  name: string;
  colors: PaletteColors;
}

export const PALETTES: PaletteDef[] = [
  { id: "sunset-orange", name: "Sunset Orange", colors: { primary: "#f97316", secondary: "#334155", text: "#f3f4f6", background: "#0b0f19" } },
  { id: "indigo-night", name: "Indigo Night", colors: { primary: "#4f46e5", secondary: "#818cf8", text: "#eef2ff", background: "#0d0d1d" } },
  { id: "royal-blue", name: "Royal Blue", colors: { primary: "#2563eb", secondary: "#38bdf8", text: "#eff6ff", background: "#0a1120" } },
  { id: "emerald-grove", name: "Emerald Grove", colors: { primary: "#059669", secondary: "#34d399", text: "#ecfdf5", background: "#0a1512" } },
  { id: "teal-lagoon", name: "Teal Lagoon", colors: { primary: "#0d9488", secondary: "#2dd4bf", text: "#f0fdfa", background: "#0a1414" } },
  { id: "violet-dream", name: "Violet Dream", colors: { primary: "#7c3aed", secondary: "#c084fc", text: "#f5f3ff", background: "#130e20" } },
  { id: "ruby-red", name: "Ruby Red", colors: { primary: "#e11d48", secondary: "#fb7185", text: "#fff1f2", background: "#180a11" } },
  { id: "slate-mono", name: "Slate Mono", colors: { primary: "#64748b", secondary: "#94a3b8", text: "#f1f5f9", background: "#0d1117" } },
];

/** The default palette — the panel's current look (orange). */
export const DEFAULT_PALETTE_ID = "sunset-orange";

/** The four color roles, in table-row order. */
export const PALETTE_ROLES = ["primary", "secondary", "text", "background"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

export const PALETTE_ROLE_LABELS: Record<PaletteRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  text: "Text",
  background: "Background",
};

export function paletteById(id: string | null | undefined): PaletteDef | null {
  if (!id) return null;
  return PALETTES.find((palette) => palette.id === id) ?? null;
}

export function paletteByPrimary(hex: string | null | undefined): PaletteDef | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const needle = hex.toLowerCase();
  return PALETTES.find((palette) => palette.colors.primary === needle) ?? null;
}

/**
 * The palette an appearance object resolves to: a stored palette id
 * wins; otherwise the legacy hexes migrate — the ADMIN color's
 * palette first (it was the panel's live color), then the
 * storefront hex. Returns null when nothing resolves, so callers can
 * leave the current application untouched on a fresh document.
 */
export function resolvePaletteId(appearance: {
  palette?: unknown;
  adminColor?: unknown;
  storefrontColor?: unknown;
} | null | undefined): string | null {
  if (!appearance) return null;
  if (typeof appearance.palette === "string" && paletteById(appearance.palette)) {
    return appearance.palette;
  }
  const fromAdmin = paletteByPrimary(typeof appearance.adminColor === "string" ? appearance.adminColor : null);
  if (fromAdmin) return fromAdmin.id;
  const fromStorefront = paletteByPrimary(typeof appearance.storefrontColor === "string" ? appearance.storefrontColor : null);
  if (fromStorefront) return fromStorefront.id;
  return null;
}

/** Sanitises a stored last-used list: known palette ids only,
 *  de-duplicated, most-recent-first, capped at 4. */
export function sanitizeLastUsed(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && paletteById(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length === 4) break;
    }
  }
  return result;
}
