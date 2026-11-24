"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useLanguage } from "@/services/i18n";
import { settingsService } from "@/services/settingsService";
import { persistTheme } from "@/services/appearance";

export default function ThemeToggle() {
  const { t } = useLanguage();

  // The icon carries NO React state: both icons render always, and
  // the global CSS shows the one matching the painted theme
  // (html[data-theme] — see app/globals.css). This component used to
  // initialise state by reading document's data-theme on the client;
  // the server cannot read the document, so it rendered the opposite
  // icon and React threw hydration error #418 on every page load,
  // regenerating the whole tree client-side. State-free, the server
  // HTML and the client HTML are identical, and the icon is correct
  // from the first painted frame.
  const toggleTheme = () => {
    // Compute from the LIVE attribute, not any component state:
    // the universal theme can also change behind the toggle (the
    // on-load appearance fetch applies the Setting doc's mode), and
    // the toggle's next step must follow what is actually painted.
    const current =
      typeof document !== "undefined"
        ? document.documentElement.getAttribute("data-theme")
        : null;
    const nextTheme = current === "dark" ? "light" : "dark";
    // One write path for every device store: <html> attribute,
    // localStorage and the SSR theme cookie all move together.
    persistTheme(nextTheme);
    // Persist the mode to the Setting doc (the section update
    // merges, so only these fields change): the doc is the single
    // source of truth for the theme, so this choice becomes
    // universal — every browser/device applies it on load, over
    // any stale local cache. This goes through the UNIVERSAL
    // appearance write, not the Settings panels' gated document
    // save: the toggle lives outside Settings and must never ask
    // for a password. Fire-and-forget — the local change
    // already applied; if the write is refused (a session without
    // settings permission), the catch keeps this device's toggle
    // local, silently.
    void settingsService
      .updateAppearance({
        theme: nextTheme === "dark" ? "Dark" : "Light",
        mode: nextTheme,
      })
      .catch(() => {
        /* the local preference is already saved */
      });
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:opacity-85 transition-all cursor-pointer"
      title={t("Toggle Theme")}
    >
      <Moon className="theme-icon-moon w-5 h-5 text-slate-700" />
      <Sun className="theme-icon-sun w-5 h-5 text-amber-400" />
    </button>
  );
}
