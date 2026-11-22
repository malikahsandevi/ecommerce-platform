import { apiClient } from './api';

export interface AppearanceSettings {
  theme?: string;
  compactSidebar?: boolean;
  showBreadcrumbs?: boolean;
  enableAnimations?: boolean;
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
  } catch {
    /* theme is cosmetic — never let it break the panel */
  }
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
    applyAppearance(toApply);
    if (deviceTheme) persistTheme(deviceTheme);
  } catch {
    /* settings may be unreachable — the panel keeps its local defaults */
  }
}
