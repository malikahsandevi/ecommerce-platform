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
import { adminColorVars, paletteById, paletteByPrimary, paletteVars, scrollbarArrowVars } from "@/services/palettes";
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

  // The KEPT theme palette, mirrored into cookies by persistPalette,
  // rendered as inline CSS variables on <html> by the SERVER — so the
  // kept palette is in the very first painted frame (Ahsan's defect:
  // a refresh flashed the default orange first, then the kept blue
  // painted over it). The variables used to reach the page only via
  // the pre-paint script / the settings fetch, both of which can land
  // after the first frame on a cold load. The script below still
  // re-derives them from localStorage before paint (it wins whenever
  // the cookie and the device store disagree), and the derivations
  // use the theme cookie's theme (falling back to dark; the script
  // corrects a wrong-theme derivation pre-paint).
  const cookieStore = await cookies();
  const paletteCookie = cookieStore.get("admin-palette")?.value;
  const ssrPalette = paletteById(paletteCookie ? decodeURIComponent(paletteCookie) : null);
  const legacyColorCookie = cookieStore.get("admin-color")?.value;
  const ssrLegacyColor =
    !ssrPalette && legacyColorCookie && /^#[0-9a-fA-F]{6}$/.test(decodeURIComponent(legacyColorCookie))
      ? decodeURIComponent(legacyColorCookie)
      : null;
  const ssrStyle: Record<string, string> | undefined = ssrPalette
    ? paletteVars(ssrPalette, ssrTheme ?? "dark")
    : ssrLegacyColor
      ? {
          ...adminColorVars(ssrLegacyColor, ssrTheme ?? "dark"),
          ...scrollbarArrowVars(
            ssrLegacyColor,
            adminColorVars(ssrLegacyColor, ssrTheme ?? "dark")["--primary-dark"],
          ),
        }
      : undefined;

  // The same kept palette, handed to the client shell as the seed
  // for usePalette's initial state (services/appearance.ts). The CSS
  // variables above only cover var()-driven elements; elements whose
  // color is computed in JS (stat-card icons, chart ramps) resolve
  // their palette through the hook, whose server render cannot read
  // localStorage and used to fall back to the DEFAULT palette — the
  // refresh blink on the stat icons. A legacy-hex-only device seeds
  // the palette its hex migrates to, exactly like the client's own
  // getDevicePaletteId migration.
  const ssrPaletteSeedId =
    ssrPalette?.id ?? paletteByPrimary(ssrLegacyColor)?.id ?? null;

  // The sidebar's collapsed preference, mirrored into a cookie by
  // every writer of the preference (the Sidebar toggle, Settings →
  // Appearance), handed to the shell as the Sidebar's hydration
  // seed — the same pattern as the palette seed above: the server
  // cannot read localStorage, so without this the Sidebar's first
  // client render (collapsed, from the device store) disagreed
  // with the server render (expanded) and React threw #418.
  const sidebarCookie = cookieStore.get("admin-sidebar")?.value;
  const ssrSidebarCollapsed =
    sidebarCookie === "collapsed" ? true : sidebarCookie === "expanded" ? false : null;

  return (
    <html
      lang={ssrLang}
      data-theme={ssrTheme}
      style={ssrStyle as React.CSSProperties | undefined}
      suppressHydrationWarning
    >
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
                // The stored shape is { dark, light } — each palette
                // carries a set per theme mode; paint the RESOLVED
                // theme's set. A legacy flat object (the old dark
                // set stored by earlier versions) is used as stored.
                const setP = paletteColors && paletteColors.dark
                  ? (resolved === "dark" ? paletteColors.dark : paletteColors.light)
                  : paletteColors;
                if (setP && /^#[0-9a-fA-F]{6}$/.test(setP.primary || "")) {
                  paletteApplied = true;
                  document.cookie = "admin-palette=" + (localStorage.getItem("admin-palette") || "") + "; path=/; max-age=31536000; SameSite=Lax";
                  const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
                  const mixRgb = (a, b, amt) => a.map((v, i) => v + (b[i] - v) * amt);
                  const toHexC = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
                  const P = rgbOf(setP.primary), T = rgbOf(setP.text), B = rgbOf(setP.background);
                  const BLACK = [0, 0, 0], WHITE = [255, 255, 255];
                  const darkP = resolved === "dark";
                  const styleP = document.documentElement.style;
                  styleP.setProperty("--primary", setP.primary);
                  styleP.setProperty("--primary-dark", toHexC(mixRgb(P, BLACK, darkP ? 0.15 : 0.12)));
                  styleP.setProperty("--primary-light", darkP ? toHexC(mixRgb(P, BLACK, 0.12)) : toHexC(mixRgb(P, WHITE, 0.76)));
                  styleP.setProperty("--primary-soft", darkP ? toHexC(mixRgb(P, BLACK, 0.8)) : toHexC(mixRgb(P, WHITE, 0.93)));
                  styleP.setProperty("--secondary", setP.secondary);
                  styleP.setProperty("--text", setP.text);
                  styleP.setProperty("--background", setP.background);
                  styleP.setProperty("--surface", toHexC(mixRgb(B, T, 0.07)));
                  styleP.setProperty("--surface-muted", toHexC(mixRgb(B, T, 0.12)));
                  styleP.setProperty("--border", toHexC(mixRgb(B, T, 0.18)));
                  styleP.setProperty("--text-soft", toHexC(mixRgb(T, B, 0.25)));
                  styleP.setProperty("--text-muted", toHexC(mixRgb(T, B, 0.45)));
                  const arrowUriP = (d, fill) => "url(\\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='" + d + "' fill='" + fill.replace("#", "%23") + "'/%3E%3C/svg%3E\\")";
                  const darkHexP = toHexC(mixRgb(P, BLACK, darkP ? 0.15 : 0.12));
                  styleP.setProperty("--sb-arrow-up", arrowUriP("M5 2 9 8 H1 Z", setP.primary));
                  styleP.setProperty("--sb-arrow-down", arrowUriP("M5 8 1 2 H9 Z", setP.primary));
                  styleP.setProperty("--sb-arrow-left", arrowUriP("M2 5 8 1 V9 Z", setP.primary));
                  styleP.setProperty("--sb-arrow-right", arrowUriP("M8 5 2 9 V1 Z", setP.primary));
                  styleP.setProperty("--sb-arrow-up-hover", arrowUriP("M5 2 9 8 H1 Z", darkHexP));
                  styleP.setProperty("--sb-arrow-down-hover", arrowUriP("M5 8 1 2 H9 Z", darkHexP));
                  styleP.setProperty("--sb-arrow-left-hover", arrowUriP("M2 5 8 1 V9 Z", darkHexP));
                  styleP.setProperty("--sb-arrow-right-hover", arrowUriP("M8 5 2 9 V1 Z", darkHexP));
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
                  const arrowUriL = (d, fill) => "url(\\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='" + d + "' fill='" + fill.replace("#", "%23") + "'/%3E%3C/svg%3E\\")";
                  const darkHexL = toHex(mixTo([0, 0, 0], dark ? 0.15 : 0.12));
                  style.setProperty("--sb-arrow-up", arrowUriL("M5 2 9 8 H1 Z", savedColor));
                  style.setProperty("--sb-arrow-down", arrowUriL("M5 8 1 2 H9 Z", savedColor));
                  style.setProperty("--sb-arrow-left", arrowUriL("M2 5 8 1 V9 Z", savedColor));
                  style.setProperty("--sb-arrow-right", arrowUriL("M8 5 2 9 V1 Z", savedColor));
                  style.setProperty("--sb-arrow-up-hover", arrowUriL("M5 2 9 8 H1 Z", darkHexL));
                  style.setProperty("--sb-arrow-down-hover", arrowUriL("M5 8 1 2 H9 Z", darkHexL));
                  style.setProperty("--sb-arrow-left-hover", arrowUriL("M2 5 8 1 V9 Z", darkHexL));
                  style.setProperty("--sb-arrow-right-hover", arrowUriL("M8 5 2 9 V1 Z", darkHexL));
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
        <AdminShell ssrPaletteId={ssrPaletteSeedId} ssrSidebarCollapsed={ssrSidebarCollapsed}>{children}</AdminShell>
      </body>
    </html>
  );
}
