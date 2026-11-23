// /app/layout.tsx
//
// This layout is a SERVER component on purpose. It used to be a client
// component, and React's hydration then diffed the <html> element's
// attributes against the JSX props and removed the data-theme attribute
// the pre-paint script had set — the panel painted dark, flipped to the
// :root light variables ~half a second later, and (because the appearance
// fetch deliberately never overwrites a stored device theme) stayed
// light. Keeping <html>/<body> server-rendered, and rendering the stored
// theme INTO the html tag from the theme cookie, makes the attribute
// React-owned state that hydration can never strip.
import React from "react";
import { cookies } from "next/headers";
import AdminShell from "@/components/AdminShell";
import "./globals.css";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The device theme, mirrored into a cookie by every theme writer (the
  // pre-paint script below, the header toggle, Settings → Appearance), so
  // the server can render it as the very first paint. Absent/invalid
  // cookie → no attribute; the pre-paint script resolves the theme from
  // localStorage / the OS preference before first paint instead.
  const themeCookie = (await cookies()).get("theme")?.value;
  const ssrTheme = themeCookie === "dark" || themeCookie === "light" ? themeCookie : undefined;

  // The saved UI language, mirrored into a cookie by applyLanguage(),
  // so the first paint already carries the right lang attribute. The
  // layout direction is NEVER switched — text translates in place.
  const LANGUAGE_CODES: Record<string, string> = {
    English: "en",
    Urdu: "ur",
    Arabic: "ar",
    Hindi: "hi",
    Bengali: "bn",
    Spanish: "es",
    French: "fr",
    German: "de",
    Turkish: "tr",
    "Chinese (Simplified)": "zh",
  };
  const languageCookie = (await cookies()).get("language")?.value;
  const ssrLang = (languageCookie && LANGUAGE_CODES[languageCookie]) || "en";

  return (
    <html lang={ssrLang} data-theme={ssrTheme} suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the saved theme AND the saved
            sidebar state are applied without a flash. The theme stored
            on this device (localStorage "theme") is the single source of
            truth: the script applies it to <html> immediately and
            mirrors it into the "theme" cookie so the next load renders
            it server-side. It also heals a poisoned/missing cookie. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem("theme");
                const resolved = theme === "dark" || theme === "light"
                  ? theme
                  : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
                document.documentElement.setAttribute("data-theme", resolved);
                document.cookie = "theme=" + resolved + "; path=/; max-age=31536000; SameSite=Lax";
                const LANG_CODES = { English: "en", Urdu: "ur", Arabic: "ar", Hindi: "hi", Bengali: "bn", Spanish: "es", French: "fr", German: "de", Turkish: "tr", "Chinese (Simplified)": "zh" };
                const savedLang = localStorage.getItem("admin-language");
                if (savedLang && LANG_CODES[savedLang]) {
                  document.documentElement.setAttribute("lang", LANG_CODES[savedLang]);
                  document.cookie = "language=" + encodeURIComponent(savedLang) + "; path=/; max-age=31536000; SameSite=Lax";
                }
                const sidebar = localStorage.getItem("admin-sidebar");
                if (sidebar === "collapsed" || (sidebar === null && window.innerWidth < 1024)) {
                  document.documentElement.setAttribute("data-sidebar", "collapsed");
                }
                // The kept Theme Palette (Settings → Appearance →
                // Theme Colors): its four role colors are applied as
                // inline theme variables before first paint, with the
                // same derivation math as services/appearance.ts
                // (paletteVars), from the colors JSON persistPalette
                // stored. No kept palette → the legacy admin-color
                // fallback below → no override → the stylesheet's
                // default orange.
                let paletteColors = null;
                let paletteApplied = false;
                try { paletteColors = JSON.parse(localStorage.getItem("admin-palette-colors") || "null"); } catch (e) {}
                if (paletteColors && /^#[0-9a-fA-F]{6}$/.test(paletteColors.primary || "")) {
                  paletteApplied = true;
                  document.cookie = "admin-palette=" + (localStorage.getItem("admin-palette") || "") + "; path=/; max-age=31536000; SameSite=Lax";
                  const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
                  const mixRgb = (a, b, amt) => a.map((v, i) => v + (b[i] - v) * amt);
                  const toHexC = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
                  const P = rgbOf(paletteColors.primary), T = rgbOf(paletteColors.text), B = rgbOf(paletteColors.background);
                  const BLACK = [0, 0, 0], WHITE = [255, 255, 255];
                  const darkP = resolved === "dark";
                  const styleP = document.documentElement.style;
                  styleP.setProperty("--primary", paletteColors.primary);
                  styleP.setProperty("--primary-dark", toHexC(mixRgb(P, BLACK, darkP ? 0.15 : 0.12)));
                  styleP.setProperty("--primary-light", darkP ? toHexC(mixRgb(P, BLACK, 0.12)) : toHexC(mixRgb(P, WHITE, 0.76)));
                  styleP.setProperty("--primary-soft", darkP ? toHexC(mixRgb(P, BLACK, 0.8)) : toHexC(mixRgb(P, WHITE, 0.93)));
                  styleP.setProperty("--secondary", paletteColors.secondary);
                  styleP.setProperty("--text", paletteColors.text);
                  styleP.setProperty("--background", paletteColors.background);
                  styleP.setProperty("--surface", toHexC(mixRgb(B, T, 0.07)));
                  styleP.setProperty("--surface-muted", toHexC(mixRgb(B, T, 0.12)));
                  styleP.setProperty("--border", toHexC(mixRgb(B, T, 0.18)));
                  styleP.setProperty("--text-soft", toHexC(mixRgb(T, B, 0.25)));
                  styleP.setProperty("--text-muted", toHexC(mixRgb(T, B, 0.45)));
                }
                // Legacy fallback: a device that only carries the old
                // Admin Panel Color hex gets the --primary* family
                // from it (the runtime migrates it to a palette).
                const savedColor = localStorage.getItem("admin-color");
                if (!paletteApplied && savedColor && /^#[0-9a-fA-F]{6}$/.test(savedColor)) {
                  document.cookie = "admin-color=" + savedColor + "; path=/; max-age=31536000; SameSite=Lax";
                  const rgb = [parseInt(savedColor.slice(1, 3), 16), parseInt(savedColor.slice(3, 5), 16), parseInt(savedColor.slice(5, 7), 16)];
                  const mixTo = (target, amt) => rgb.map((v, i) => Math.round(v + (target[i] - v) * amt));
                  const toHex = (a) => "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("");
                  const dark = resolved === "dark";
                  const style = document.documentElement.style;
                  style.setProperty("--primary", savedColor);
                  style.setProperty("--primary-dark", toHex(mixTo([0, 0, 0], dark ? 0.15 : 0.12)));
                  style.setProperty("--primary-light", dark ? toHex(mixTo([0, 0, 0], 0.12)) : toHex(mixTo([255, 255, 255], 0.76)));
                  style.setProperty("--primary-soft", dark ? toHex(mixTo([0, 0, 0], 0.8)) : toHex(mixTo([255, 255, 255], 0.93)));
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-[var(--background)] text-[var(--text)] transition-colors duration-200"
        suppressHydrationWarning
      >
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
