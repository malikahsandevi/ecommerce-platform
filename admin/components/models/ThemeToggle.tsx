"use client";

import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { settingsService } from "@/services/settingsService";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Current DOM attribute ya localStorage se theme synchronize karein
    const currentTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    if (currentTheme) {
      setTheme(currentTheme);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
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