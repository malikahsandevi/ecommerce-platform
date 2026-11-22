import { useEffect, useState } from 'react';
import { apiClient } from './api';

export interface AppearanceSettings {
  theme?: string;
  compactSidebar?: boolean;
  showBreadcrumbs?: boolean;
  enableAnimations?: boolean;
  /** Settings → Appearance theme colors: two INDEPENDENT hex colors.
   *  adminColor drives THIS panel's primary/accent; storefrontColor
   *  is only stored (the storefront reads it from the public
   *  /api/storefront/theme endpoint) and never affects the panel. */
  adminColor?: string;
  storefrontColor?: string;
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
    // The admin color's derived shades depend on the theme (light
    // tints vs dark shades) — re-apply them for the new theme.
    applyAdminColor(getDeviceAdminColor());
  } catch {
    /* theme is cosmetic — never let it break the panel */
  }
}

// ── Admin theme color ────────────────────────────────────────────────
// Settings → Appearance → "Admin Panel Color". The saved hex drives
// the panel's --primary family through inline custom properties on
// <html> (inline properties beat the stylesheet's :root / [data-theme]
// rules), persisted exactly like the theme: localStorage + cookie for
// the pre-paint script in the root layout, Setting doc for other
// devices. No saved color → no inline override → the stylesheet's
// current orange rules, so nothing changes until a color is picked.
export const DEFAULT_ADMIN_COLOR = '#f97316';
export const ADMIN_COLOR_EVENT = 'admin:color';
const ADMIN_COLOR_KEY = 'admin-color';

export const isValidHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const rgbToHex = (rgb: [number, number, number]): string =>
  `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

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

/** The four --primary* values for a base color under a theme. The
 *  root layout's pre-paint script computes these with the same math,
 *  so the first paint and the runtime application always agree. */
export function adminColorVars(color: string, theme: DeviceTheme): Record<string, string> {
  if (theme === 'dark') {
    return {
      '--primary': color,
      '--primary-dark': shade(color, 0.15),
      '--primary-light': shade(color, 0.12),
      '--primary-soft': shade(color, 0.8),
    };
  }
  return {
    '--primary': color,
    '--primary-dark': shade(color, 0.12),
    '--primary-light': tint(color, 0.76),
    '--primary-soft': tint(color, 0.93),
  };
}

const ADMIN_COLOR_VARS = ['--primary', '--primary-light', '--primary-soft', '--primary-dark'];

/** The device's stored admin color (null = built-in default). */
export function getDeviceAdminColor(): string | null {
  try {
    const stored = localStorage.getItem(ADMIN_COLOR_KEY);
    return stored && isValidHexColor(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Applies a color (or clears the override for the default) to <html>
 *  for the CURRENT theme. Does not persist — persistAdminColor does. */
export function applyAdminColor(color: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const root = document.documentElement;
    if (!color || !isValidHexColor(color)) {
      for (const name of ADMIN_COLOR_VARS) root.style.removeProperty(name);
      return;
    }
    const theme: DeviceTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const vars = adminColorVars(color, theme);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  } catch {
    /* color is cosmetic — never let it break the panel */
  }
}

/** Writes an admin color choice to every store at once (inline vars,
 *  localStorage, the SSR/pre-paint cookie) and notifies consumers. */
export function persistAdminColor(color: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (color && isValidHexColor(color)) {
      localStorage.setItem(ADMIN_COLOR_KEY, color);
      document.cookie = `${ADMIN_COLOR_KEY}=${encodeURIComponent(color)}; path=/; max-age=31536000; SameSite=Lax`;
      applyAdminColor(color);
    } else {
      localStorage.removeItem(ADMIN_COLOR_KEY);
      document.cookie = `${ADMIN_COLOR_KEY}=; path=/; max-age=0; SameSite=Lax`;
      applyAdminColor(null);
    }
    window.dispatchEvent(new CustomEvent(ADMIN_COLOR_EVENT, { detail: color || '' }));
  } catch {
    /* color is cosmetic — never let it break the panel */
  }
}

/** The panel's current admin color (the saved one, or the default) —
 *  reactive: chart accents and ramps re-derive when it changes. */
export function useAdminColor(): string {
  const [color, setColor] = useState<string>(() => getDeviceAdminColor() ?? DEFAULT_ADMIN_COLOR);
  useEffect(() => {
    setColor(getDeviceAdminColor() ?? DEFAULT_ADMIN_COLOR);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setColor(detail && isValidHexColor(detail) ? detail : (getDeviceAdminColor() ?? DEFAULT_ADMIN_COLOR));
    };
    window.addEventListener(ADMIN_COLOR_EVENT, onChange);
    return () => window.removeEventListener(ADMIN_COLOR_EVENT, onChange);
  }, []);
  return color;
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

    // Admin theme color — persisted to the device stores and applied
    // as inline --primary* overrides. (storefrontColor is NOT applied
    // here: it belongs to the customer storefront only.)
    if (typeof appearance.adminColor === 'string') {
      persistAdminColor(appearance.adminColor);
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
    // Same device precedence for the admin color: a color this device
    // already chose wins; the server value only seeds a fresh device.
    const deviceColor = getDeviceAdminColor();
    if (deviceColor) delete toApply.adminColor;
    applyAppearance(toApply);
    if (deviceTheme) persistTheme(deviceTheme);
    if (deviceColor) applyAdminColor(deviceColor);
  } catch {
    /* settings may be unreachable — the panel keeps its local defaults */
  }
}
