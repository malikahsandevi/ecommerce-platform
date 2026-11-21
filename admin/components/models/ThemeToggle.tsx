"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { settingsService } from "@/services/settingsService";
import { getDeviceTheme, persistTheme } from "@/services/appearance";

export default function ThemeToggle() {
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
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    // One write path for every store: <html> attribute, localStorage and
    // the SSR theme cookie all move together.
    persistTheme(nextTheme);
    // Keep the server-side Appearance setting in agreement (the section
    // update merges, so only the theme field changes). Otherwise the
    // on-login appearance fetch would seed this older server value on a
    // fresh device. Fire-and-forget — the local change already applied.
    void settingsService
      .updateSection("appearance", {
        theme: nextTheme === "dark" ? "Dark" : "Light",
      })
      .catch(() => {
        /* the local preference is already saved */
      });
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center p-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:opacity-85 transition-all cursor-pointer"
      title="Toggle Theme"
    >
      {theme === "light" ? (
        <Moon className="w-5 h-5 text-slate-700" />
      ) : (
        <Sun className="w-5 h-5 text-amber-400" />
      )}
    </button>
  );
}
