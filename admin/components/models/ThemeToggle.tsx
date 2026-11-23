"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useLanguage } from "@/services/i18n";
import { settingsService } from "@/services/settingsService";
import { getDeviceTheme, persistTheme } from "@/services/appearance";

export default function ThemeToggle() {
  const { t } = useLanguage();
  // Initialise from the already-applied document attribute (set pre-paint
  // by the inline script / SSR cookie) so the icon never disagrees with
  // the painted theme, even for a click that lands before effects run.
  const [theme, setTheme] = useState<"light" | "dark">(
    () =>
      (typeof document !== "undefined" &&
        (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null)) ||
      "light",
  );

  useEffect(() => {
    // Keep the icon in sync if the theme changes elsewhere (Settings →
    // Appearance applies it without remounting this toggle).
    const deviceTheme = getDeviceTheme();
    if (deviceTheme) setTheme(deviceTheme);
  }, []);

  const toggleTheme = () => {
    // Compute from the LIVE attribute, not this component's state:
    // the universal theme can also change behind the toggle (the
    // on-load appearance fetch applies the Setting doc's mode), and
    // the toggle's next step must follow what is actually painted.
    const current =
      (typeof document !== "undefined" &&
        (document.documentElement.getAttribute("data-theme") as "light" | "dark" | null)) ||
      theme;
    const nextTheme = current === "light" ? "dark" : "light";
    setTheme(nextTheme);
    // One write path for every device store: <html> attribute,
    // localStorage and the SSR theme cookie all move together.
    persistTheme(nextTheme);
    // Persist the mode to the Setting doc (the section update
    // merges, so only these fields change): the doc is the single
    // source of truth for the theme, so this choice becomes
    // universal — every browser/device applies it on load, over
    // any stale local cache. Fire-and-forget — the local change
    // already applied; if the write is refused (a session without
    // settings permission), the catch keeps this device's toggle
    // local, silently.
    void settingsService
      .updateSection("appearance", {
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
      {theme === "light" ? (
        <Moon className="w-5 h-5 text-slate-700" />
      ) : (
        <Sun className="w-5 h-5 text-amber-400" />
      )}
    </button>
  );
}
