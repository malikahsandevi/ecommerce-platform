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
//
// EVERY palette carries TWO complete color sets: `dark` and `light`.
// The first palette round shipped dark-only sets, so in light mode
// the panel derived its surfaces from the dark background/text and
// the white theme broke (a coloured wash over the sidebar/content —
// Ahsan's screenshot). The light sets keep the white theme
// clean like the pre-palette light theme (globals.css :root:
// background #ffffff, text #111827, neutral surfaces): the palette's
// identity rides on its primary (the SAME hex in both sets — every
// one of the seven reads on white) and a secondary darkened enough
// to read on white; text is a near-black tint of the palette hue
// and the background is pure white, so the derived surface/border
// shades come out neutral greys with NO coloured wash.

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
  /** The color set applied while the panel is in dark mode. */
  dark: PaletteColors;
  /** The color set applied while the panel is in light mode. */
  light: PaletteColors;
}

export const PALETTES: PaletteDef[] = [
  { id: "sunset-orange", name: "Sunset Orange",
    dark: { primary: "#f97316", secondary: "#334155", text: "#f3f4f6", background: "#0b0f19" },
    light: { primary: "#f97316", secondary: "#334155", text: "#111827", background: "#ffffff" } },
  { id: "indigo-night", name: "Indigo Night",
    dark: { primary: "#4f46e5", secondary: "#818cf8", text: "#eef2ff", background: "#0d0d1d" },
    light: { primary: "#4f46e5", secondary: "#6366f1", text: "#1e1b4b", background: "#ffffff" } },
  { id: "royal-blue", name: "Royal Blue",
    dark: { primary: "#2563eb", secondary: "#38bdf8", text: "#eff6ff", background: "#0a1120" },
    light: { primary: "#2563eb", secondary: "#0284c7", text: "#172554", background: "#ffffff" } },
  { id: "emerald-grove", name: "Emerald Grove",
    dark: { primary: "#059669", secondary: "#34d399", text: "#ecfdf5", background: "#0a1512" },
    light: { primary: "#059669", secondary: "#047857", text: "#022c22", background: "#ffffff" } },
  { id: "teal-lagoon", name: "Teal Lagoon",
    dark: { primary: "#0d9488", secondary: "#2dd4bf", text: "#f0fdfa", background: "#0a1414" },
    light: { primary: "#0d9488", secondary: "#0f766e", text: "#042f2e", background: "#ffffff" } },
  { id: "violet-dream", name: "Violet Dream",
    dark: { primary: "#7c3aed", secondary: "#c084fc", text: "#f5f3ff", background: "#130e20" },
    light: { primary: "#7c3aed", secondary: "#9333ea", text: "#2e1065", background: "#ffffff" } },
  { id: "slate-mono", name: "Slate Mono",
    dark: { primary: "#64748b", secondary: "#94a3b8", text: "#f1f5f9", background: "#0d1117" },
    light: { primary: "#64748b", secondary: "#475569", text: "#0f172a", background: "#ffffff" } },
];

/** The default palette — the panel's current look (orange). */
export const DEFAULT_PALETTE_ID = "sunset-orange";

/** The four color roles, in table-row order. */
export const PALETTE_ROLES = ["primary", "secondary", "text", "background"] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

/** The two theme modes a palette carries a color set for, in
 *  table-row order (the Dark rows first, then the Light rows). */
export const PALETTE_MODES = ["dark", "light"] as const;
export type PaletteMode = (typeof PALETTE_MODES)[number];

export const PALETTE_MODE_LABELS: Record<PaletteMode, string> = {
  dark: "Dark",
  light: "Light",
};

/** The color set a palette applies under a theme mode. */
export function paletteSet(palette: PaletteDef, theme: PaletteTheme): PaletteColors {
  return theme === "dark" ? palette.dark : palette.light;
}

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
  return PALETTES.find((palette) => palette.dark.primary === needle) ?? null;
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

export type PaletteTheme = "dark" | "light";

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const rgbToHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** Mix a hex color toward white (amount 0..1). */
export const tint = (hex: string, amount: number): string => {
  const rgb = hexToRgb(hex);
  return rgbToHex([rgb[0] + (255 - rgb[0]) * amount, rgb[1] + (255 - rgb[1]) * amount, rgb[2] + (255 - rgb[2]) * amount]);
};

/** Mix a hex color toward black (amount 0..1). */
export const shade = (hex: string, amount: number): string => {
  const rgb = hexToRgb(hex);
  return rgbToHex([rgb[0] * (1 - amount), rgb[1] * (1 - amount), rgb[2] * (1 - amount)]);
};

/** Mix one hex color toward another (amount 0..1). */
export const mix = (from: string, to: string, amount: number): string => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
};

/** The four --primary* values for a base color under a theme. The
 *  root layout's pre-paint script computes these with the same math,
 *  so the first paint and the runtime application always agree. */
export function adminColorVars(color: string, theme: PaletteTheme): Record<string, string> {
  if (theme === "dark") {
    return {
      "--primary": color,
      "--primary-dark": shade(color, 0.15),
      "--primary-light": shade(color, 0.12),
      "--primary-soft": shade(color, 0.8),
    };
  }
  return {
    "--primary": color,
    "--primary-dark": shade(color, 0.12),
    "--primary-light": tint(color, 0.76),
    "--primary-soft": tint(color, 0.93),
  };
}

const ARROW_PATHS = {
  up: "M5 2 9 8 H1 Z",
  down: "M5 8 1 2 H9 Z",
  left: "M2 5 8 1 V9 Z",
  right: "M8 5 2 9 V1 Z",
} as const;

const arrowUri = (path: string, fill: string): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='${path}' fill='${fill.replace("#", "%23")}'/%3E%3C/svg%3E")`;

/**
 * The scrollbar arrow glyphs as CSS variables. Chromium IGNORES
 * -webkit-mask and clip-path on ::-webkit-scrollbar-button (the
 * palette round's mask re-implementation rendered solid boxes —
 * Ahsan: "arrow lagwo wapis"), so the triangles are background-image
 * SVGs, the technique that actually renders. The fill is baked from
 * the palette's primary / primary-dark, which keeps the arrows
 * palette-driven with no hard-coded hex in the stylesheet: the
 * globals.css defaults cover the default palette, and these vars
 * override them whenever a palette is applied (runtime, pre-paint
 * script and SSR all set them from the same math).
 */
export function scrollbarArrowVars(primary: string, primaryDark: string): Record<string, string> {
  return {
    "--sb-arrow-up": arrowUri(ARROW_PATHS.up, primary),
    "--sb-arrow-down": arrowUri(ARROW_PATHS.down, primary),
    "--sb-arrow-left": arrowUri(ARROW_PATHS.left, primary),
    "--sb-arrow-right": arrowUri(ARROW_PATHS.right, primary),
    "--sb-arrow-up-hover": arrowUri(ARROW_PATHS.up, primaryDark),
    "--sb-arrow-down-hover": arrowUri(ARROW_PATHS.down, primaryDark),
    "--sb-arrow-left-hover": arrowUri(ARROW_PATHS.left, primaryDark),
    "--sb-arrow-right-hover": arrowUri(ARROW_PATHS.right, primaryDark),
  };
}

/** Every theme variable a palette drives. The derived surface /
 *  border / text shades come from the palette's own background and
 *  text colors, so a kept palette recolors the panel coherently —
 *  not just its accents. The root layout's pre-paint script computes
 *  these with the same math from the stored colors, so the first
 *  paint and the runtime application always agree. */
export function paletteVars(palette: PaletteDef, theme: PaletteTheme): Record<string, string> {
  const { primary, secondary, text, background } = paletteSet(palette, theme);
  const primaryVars = adminColorVars(primary, theme);
  return {
    ...primaryVars,
    "--secondary": secondary,
    "--text": text,
    "--background": background,
    "--surface": mix(background, text, 0.07),
    "--surface-muted": mix(background, text, 0.12),
    "--border": mix(background, text, 0.18),
    "--text-soft": mix(text, background, 0.25),
    "--text-muted": mix(text, background, 0.45),
    ...scrollbarArrowVars(primary, primaryVars["--primary-dark"]),
  };
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
