import { useEffect, useState } from 'react';
import { apiClient } from './api';
import {
  DEFAULT_PALETTE_ID,
  paletteById,
  paletteByPrimary,
  paletteVars,
  resolvePaletteId,
  type PaletteDef,
} from './palettes';

// The color math + variable builders live in services/palettes.ts
// (pure, server-safe — the root layout imports them for the SSR
// first paint); they are re-exported here for existing consumers.
export { tint, shade, mix, adminColorVars, paletteVars } from './palettes';

export interface AppearanceSettings {
  theme?: string;
  compactSidebar?: boolean;
  showBreadcrumbs?: boolean;
  enableAnimations?: boolean;
  /** Legacy per-target theme-color hexes — migration source only:
   *  palette resolution falls back to the palette whose primary
   *  matches adminColor (then storefrontColor). */
  adminColor?: string;
  storefrontColor?: string;
  /** Settings → Appearance → Theme Colors: the ONE kept palette id
   *  (services/palettes.ts) colouring the admin panel AND the
   *  storefront together, plus the last-used palette ids. */
  palette?: string;
  paletteLastUsed?: string[];
}

export const SIDEBAR_PREF_EVENT = 'admin:sidebar-pref';
export const BREADCRUMBS_PREF_EVENT = 'admin:breadcrumbs-pref';

export type DeviceTheme = 'dark' | 'light';

/** The device's stored theme — the single source of truth for the theme. */
export function getDeviceTheme(): DeviceTheme | null {
  try {
    const stored = localStorage.getItem('theme');
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Writes a theme choice to every store at once — the <html> attribute
 * (what the CSS reads), localStorage (what the pre-paint script reads)
 * and the "theme" cookie (what the server layout renders into the SSR
 * html tag) — so the three can never disagree and the stored theme is
 * always the first paint, on this load and every later one.
 */
export function persistTheme(theme: DeviceTheme): void {
  if (typeof window === 'undefined') return;
  try {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    // The palette's derived shades depend on the theme (light tints
    // vs dark shades) — re-apply them for the new theme.
    applyPalette(getDevicePaletteId());
  } catch {
    /* theme is cosmetic — never let it break the panel */
  }
}

// ── Theme palette ────────────────────────────────────────────────────
// Settings → Appearance → Theme Colors. ONE ready-made palette
// (services/palettes.ts) colours the whole panel: its four role
// colors drive the theme variables through inline custom properties
// on <html> (inline properties beat the stylesheet's :root /
// [data-theme] rules), persisted exactly like the theme: localStorage
// + cookie for the pre-paint script in the root layout, Setting doc
// for other devices. No kept palette → no inline override → the
// stylesheet's current orange rules, so nothing changes until a
// palette is kept.
export const DEFAULT_ADMIN_COLOR = '#f97316';
export const PALETTE_EVENT = 'admin:palette';
const PALETTE_KEY = 'admin-palette';
const PALETTE_COLORS_KEY = 'admin-palette-colors';
const ADMIN_COLOR_KEY = 'admin-color';

export const isValidHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

const PALETTE_VARS = [
  '--primary', '--primary-light', '--primary-soft', '--primary-dark',
  '--secondary', '--text', '--background', '--surface', '--surface-muted',
  '--border', '--text-soft', '--text-muted',
  '--sb-arrow-up', '--sb-arrow-down', '--sb-arrow-left', '--sb-arrow-right',
  '--sb-arrow-up-hover', '--sb-arrow-down-hover', '--sb-arrow-left-hover', '--sb-arrow-right-hover',
];

/** The device's kept palette id. A device that only carries the
 *  legacy admin-color hex resolves to the palette whose primary
 *  matches it (the migration path); null = nothing kept yet. */
export function getDevicePaletteId(): string | null {
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    if (stored && paletteById(stored)) return stored;
    const legacy = localStorage.getItem(ADMIN_COLOR_KEY);
    const migrated = paletteByPrimary(legacy && isValidHexColor(legacy) ? legacy : null);
    return migrated ? migrated.id : null;
  } catch {
    return null;
  }
}

/** The device's current primary color — the kept palette's primary,
 *  or the legacy stored hex. Kept for the dashboard chart ramps,
 *  which read a single base color imperatively. */
export function getDeviceAdminColor(): string | null {
  const palette = paletteById(getDevicePaletteId());
  if (palette) return palette.colors.primary;
  try {
    const stored = localStorage.getItem(ADMIN_COLOR_KEY);
    return stored && isValidHexColor(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Applies a palette (or clears every palette override for null) to
 *  <html> for the CURRENT theme. Does not persist — persistPalette
 *  does. The Appearance picker's Apply/Revert flow uses this to
 *  preview and restore without touching any store. */
export function applyPalette(paletteId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const root = document.documentElement;
    const palette = paletteById(paletteId);
    if (!palette) {
      for (const name of PALETTE_VARS) root.style.removeProperty(name);
      return;
    }
    const theme: DeviceTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const vars = paletteVars(palette, theme);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  } catch {
    /* palette is cosmetic — never let it break the panel */
  }
}

/** Writes a kept palette to every device store at once (inline vars,
 *  localStorage id + colors for the pre-paint script, the cookie) and
 *  notifies consumers. The legacy admin-color store is kept in sync
 *  with the palette's primary so older readers stay consistent. */
export function persistPalette(paletteId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const palette = paletteById(paletteId);
    if (!palette) return;
    localStorage.setItem(PALETTE_KEY, palette.id);
    localStorage.setItem(PALETTE_COLORS_KEY, JSON.stringify(palette.colors));
    localStorage.setItem(ADMIN_COLOR_KEY, palette.colors.primary);
    document.cookie = `${PALETTE_KEY}=${encodeURIComponent(palette.id)}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `${ADMIN_COLOR_KEY}=${encodeURIComponent(palette.colors.primary)}; path=/; max-age=31536000; SameSite=Lax`;
    applyPalette(palette.id);
    window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: palette.id }));
  } catch {
    /* palette is cosmetic — never let it break the panel */
  }
}

// ── Palette preview (Apply → explore → Keep/Revert) ─────────────
// Ahsan's flow: Apply puts the chosen palette on the WHOLE panel as
// a TEMPORARY preview and starts a 30-second countdown shown beside
// the Apply button — NO popup during the countdown, so the admin can
// switch panels and judge the colors in place. Only when the time
// completes does the Keep/Revert popup appear. The state lives HERE,
// in module state, not in the picker component: unmounting the
// Appearance panel (navigating away and back) must not cancel the
// preview or its countdown. NOTHING is persisted while previewing —
// no Setting write, no device store — so a refresh mid-preview comes
// back with the previously KEPT palette. Keep persists (the picker
// does the Setting write + persistPalette + the "Theme saved"
// toast); Revert restores the kept palette everywhere.
export const PALETTE_PREVIEW_EVENT = 'admin:palette-preview';

export interface PalettePreviewState {
  previewId: string;
  keptId: string | null;
  endAt: number;
  totalSeconds: number;
  phase: 'counting' | 'deciding';
}

let palettePreview: PalettePreviewState | null = null;
let palettePreviewTimer: ReturnType<typeof setTimeout> | null = null;

export function getPalettePreview(): PalettePreviewState | null {
  return palettePreview;
}

function emitPalettePreview(): void {
  try {
    window.dispatchEvent(new CustomEvent(PALETTE_PREVIEW_EVENT, { detail: palettePreview }));
  } catch {
    /* cosmetic */
  }
}

function clearPalettePreviewTimer(): void {
  if (palettePreviewTimer) {
    clearTimeout(palettePreviewTimer);
    palettePreviewTimer = null;
  }
}

export function beginPalettePreview(previewId: string, totalSeconds: number, keptId: string | null): void {
  if (typeof window === 'undefined') return;
  clearPalettePreviewTimer();
  applyPalette(previewId);
  palettePreview = {
    previewId,
    keptId,
    endAt: Date.now() + totalSeconds * 1000,
    totalSeconds,
    phase: 'counting',
  };
  palettePreviewTimer = setTimeout(() => {
    if (!palettePreview) return;
    palettePreview = { ...palettePreview, phase: 'deciding' };
    emitPalettePreview();
  }, totalSeconds * 1000);
  emitPalettePreview();
}

/** Revert: restore the previously kept palette everywhere; the
 *  preview is forgotten and nothing was ever persisted. */
export function revertPalettePreview(): void {
  if (typeof window === 'undefined') return;
  clearPalettePreviewTimer();
  const keptId = palettePreview?.keptId ?? getDevicePaletteId();
  palettePreview = null;
  applyPalette(keptId);
  emitPalettePreview();
}

/** Keep path: the caller persists the previewed palette first, then
 *  ends the preview (the applied vars already match it). */
export function endPalettePreview(): void {
  clearPalettePreviewTimer();
  palettePreview = null;
  emitPalettePreview();
}

/** Reactive view of the running palette preview (null when idle). */
export function usePalettePreview(): PalettePreviewState | null {
  const [state, setState] = useState<PalettePreviewState | null>(() => palettePreview);
  useEffect(() => {
    const sync = () => setState(palettePreview);
    sync();
    window.addEventListener(PALETTE_PREVIEW_EVENT, sync);
    return () => window.removeEventListener(PALETTE_PREVIEW_EVENT, sync);
  }, []);
  return state;
}

const defaultPalette = (): PaletteDef => paletteById(DEFAULT_PALETTE_ID) as PaletteDef;

/** The panel's current palette (the kept one, or the default) —
 *  reactive: consumers re-derive when a palette is kept. */
export function usePalette(): PaletteDef {
  const [palette, setPalette] = useState<PaletteDef>(() => paletteById(getDevicePaletteId()) ?? defaultPalette());
  useEffect(() => {
    const sync = () => setPalette(paletteById(getDevicePaletteId()) ?? defaultPalette());
    sync();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setPalette(paletteById(detail) ?? paletteById(getDevicePaletteId()) ?? defaultPalette());
    };
    window.addEventListener(PALETTE_EVENT, onChange);
    return () => window.removeEventListener(PALETTE_EVENT, onChange);
  }, []);
  return palette;
}

/** The panel's current primary color (the kept palette's primary, or
 *  the default) — reactive: chart accents and ramps re-derive when
 *  the palette changes. */
export function useAdminColor(): string {
  return usePalette().colors.primary;
}

/**
 * Re-asserts the stored device theme onto <html>. Used as a safety net
 * after hydration and after the appearance fetch: whatever the DOM
 * attribute currently says, the device store wins.
 */
export function reassertDeviceTheme(): void {
  if (typeof window === 'undefined') return;
  const deviceTheme = getDeviceTheme();
  if (deviceTheme) persistTheme(deviceTheme);
}

/**
 * Applies the saved Appearance settings to the running panel. Before this
 * existed, Settings → Appearance wrote to the database but nothing ever
 * read the values back — the theme came only from the header toggle's
 * localStorage key, the sidebar from its own key, and the animation /
 * breadcrumb preferences did nothing at all.
 */
export function applyAppearance(appearance: AppearanceSettings | undefined): void {
  if (!appearance || typeof window === 'undefined') return;

  try {
    // Theme — routed through persistTheme so the attribute, localStorage
    // and the SSR cookie always move together.
    if (appearance.theme === 'Dark') {
      persistTheme('dark');
    } else if (appearance.theme === 'Light') {
      persistTheme('light');
    } else if (appearance.theme === 'System') {
      localStorage.removeItem('theme');
      document.cookie = 'theme=; path=/; max-age=0; SameSite=Lax';
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    // Compact sidebar — share the sidebar's own storage key and notify the
    // mounted sidebar so the change is visible without a reload.
    if (typeof appearance.compactSidebar === 'boolean') {
      localStorage.setItem('admin-sidebar', appearance.compactSidebar ? 'collapsed' : 'expanded');
      window.dispatchEvent(new Event(SIDEBAR_PREF_EVENT));
    }

    // Breadcrumbs — TopBar reads this key and listens for the event.
    if (typeof appearance.showBreadcrumbs === 'boolean') {
      localStorage.setItem('admin-breadcrumbs', appearance.showBreadcrumbs ? '1' : '0');
      window.dispatchEvent(new Event(BREADCRUMBS_PREF_EVENT));
    }

    // Animations — a data attribute the global CSS keys off.
    if (typeof appearance.enableAnimations === 'boolean') {
      document.documentElement.setAttribute(
        'data-animations',
        appearance.enableAnimations ? 'on' : 'off',
      );
    }

    // Theme palette — the ONE kept palette colours the whole panel
    // (and the storefront, which reads the same palette from the
    // public endpoint). Resolution migrates the legacy per-target
    // hexes — admin color first — when no palette id is stored yet.
    const paletteId = resolvePaletteId(appearance);
    if (paletteId) {
      persistPalette(paletteId);
    }
  } catch {
    /* appearance is cosmetic — never let it break the panel */
  }
}

/** Loads the settings document once and applies its Appearance section. */
export async function fetchAndApplyAppearance(): Promise<void> {
  try {
    const { data } = await apiClient.get('/settings');
    const appearance = data?.appearance as AppearanceSettings | undefined;
    if (!appearance) return;

    // Device precedence — the device store is the single source of truth,
    // for the SIDEBAR as well as the theme. The server-side Appearance
    // values may only SEED a device that has no stored choice of its own;
    // they must never overwrite one. (The theme had this protection; the
    // sidebar did not, so a server compactSidebar that disagreed with
    // the admin's own toggle flipped the sidebar after every login —
    // the fetch is the last writer in the load sequence.) When a device
    // theme exists it is also actively RE-ASSERTED onto <html> here:
    // the pre-paint script paints it, and this fetch ends the load with
    // the attribute exactly as the device store says.
    const deviceTheme = getDeviceTheme();
    let deviceSidebar: string | null = null;
    try {
      deviceSidebar = localStorage.getItem('admin-sidebar');
    } catch {
      /* storage unavailable — the server value may seed */
    }
    const toApply: AppearanceSettings = { ...appearance };
    if (deviceTheme) delete toApply.theme;
    if (deviceSidebar) delete toApply.compactSidebar;
    // Same device precedence for the palette: a palette this device
    // already kept wins; the server value only seeds a fresh device.
    // (The legacy hexes are deleted too — palette resolution would
    // otherwise re-derive a server palette from them.)
    const devicePalette = getDevicePaletteId();
    if (devicePalette) {
      delete toApply.palette;
      delete toApply.adminColor;
      delete toApply.storefrontColor;
    }
    applyAppearance(toApply);
    if (deviceTheme) persistTheme(deviceTheme);
    if (devicePalette) applyPalette(devicePalette);
  } catch {
    /* settings may be unreachable — the panel keeps its local defaults */
  }
}
