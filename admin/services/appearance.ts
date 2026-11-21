import { apiClient } from './api';

export interface AppearanceSettings {
  theme?: string;
  compactSidebar?: boolean;
  showBreadcrumbs?: boolean;
  enableAnimations?: boolean;
}

export const SIDEBAR_PREF_EVENT = 'admin:sidebar-pref';
export const BREADCRUMBS_PREF_EVENT = 'admin:breadcrumbs-pref';

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
    // Theme — share the header toggle's storage key so both stay in sync.
    if (appearance.theme === 'Dark') {
      localStorage.setItem('theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (appearance.theme === 'Light') {
      localStorage.setItem('theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (appearance.theme === 'System') {
      localStorage.removeItem('theme');
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

    // Theme precedence — this is what stops the light<->dark flash on
    // refresh. The pre-paint script in the root layout paints the theme
    // stored in localStorage ("theme") before first paint. If this fetch
    // then overwrote it with a *different* server-side Appearance theme,
    // the panel visibly flipped a moment after loading (and the server
    // value rewrote localStorage, so the fight repeated every visit).
    // A theme already stored on this device is the user's most recent
    // choice here (header toggle, Settings save, or an earlier seed), so
    // the server copy is applied WITHOUT its theme. Only a device with
    // no stored theme is seeded from the server value — applyAppearance
    // persists it to localStorage, so the next load paints it from the
    // first frame.
    let localTheme: string | null = null;
    try {
      localTheme = localStorage.getItem('theme');
    } catch {
      /* storage unavailable — fall through to the server value */
    }
    if (localTheme === 'dark' || localTheme === 'light') {
      const withoutTheme: AppearanceSettings = { ...appearance };
      delete withoutTheme.theme;
      applyAppearance(withoutTheme);
    } else {
      applyAppearance(appearance);
    }
  } catch {
    /* settings may be unreachable — the panel keeps its local defaults */
  }
}
