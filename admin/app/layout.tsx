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

  return (
    <html lang="en" data-theme={ssrTheme} suppressHydrationWarning>
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
                const sidebar = localStorage.getItem("admin-sidebar");
                if (sidebar === "collapsed" || (sidebar === null && window.innerWidth < 1024)) {
                  document.documentElement.setAttribute("data-sidebar", "collapsed");
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
