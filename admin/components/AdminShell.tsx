"use client";

import React, { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import AdminLoginPopup from "@/components/Login";
import BuiltByFooter from "@/components/layout/BuiltByFooter";
import PaletteDecisionPopup from "@/components/layout/PaletteDecisionPopup";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialog";
import { SecurityCheckDialogHost } from "@/components/ui/SecurityCheckDialog";
import { ToastHost } from "@/components/ui/Toast";
import { AuthProvider, useAdminAuth } from "@/services/authContext";
import { fetchAndApplyAppearance, PaletteSeedContext, SidebarSeedContext, reassertDeviceTheme } from "@/services/appearance";
import { fetchAndApplyStoreCurrency } from "@/services/currency";
import { fetchAndApplyStoreTimeZone } from "@/services/storeTime";
import { LanguageProvider, fetchAndApplyLanguage } from "@/services/i18n";

// Renders the shell and gates the panel behind a session. Kept separate from
// the root layout (a server component) because useAdminAuth must run *inside*
// the provider — and because the root layout must stay a server component so
// React never hydration-diffs the <html> element's attributes (see
// app/layout.tsx).
function AdminShellInner({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isRestoring, sessionNotice, clearNotice } = useAdminAuth();
  const pathname = usePathname();

  // The password-reset page is reached from an emailed link while
  // signed OUT — it must render bare, without the sidebar, the inert
  // panel behind it, or the login popup on top of it.
  if (pathname === "/reset-password") {
    return <main className="w-full min-h-screen">{children}</main>;
  }

  // The Setting doc is the single source of truth for the theme
  // (universal palette + mode); the device store is only its cache.
  // Re-assert the cached theme onto <html> in a layout effect —
  // synchronously after the hydration commit, before the browser
  // paints the hydrated tree — so the attribute the pre-paint
  // script set can never be lost between first paint and the
  // (auth-gated, network-bound) appearance fetch that converges
  // the panel on the doc's values.
  useLayoutEffect(() => {
    reassertDeviceTheme();
  }, []);

  // Saved Appearance settings (theme, compact sidebar, breadcrumbs,
  // animations) live in the settings document — apply them once signed in.
  useEffect(() => {
    if (isAuthenticated) void fetchAndApplyAppearance();
  }, [isAuthenticated]);

  // The store currency (Settings → General) formats every money figure
  // in the panel — load and apply it once signed in, like Appearance.
  useEffect(() => {
    if (isAuthenticated) void fetchAndApplyStoreCurrency();
  }, [isAuthenticated]);

  // The store timezone (Settings → General) is the canonical day for
  // every date filter in the panel — load and apply it once signed
  // in, like the currency.
  useEffect(() => {
    if (isAuthenticated) void fetchAndApplyStoreTimeZone();
  }, [isAuthenticated]);

  // The UI language (Settings → General) — same pattern: load and
  // apply it once signed in so the shell renders in it on every page.
  useEffect(() => {
    if (isAuthenticated) void fetchAndApplyLanguage();
  }, [isAuthenticated]);

  // Avoid flashing the login popup while the session probe is still running.
  const showLoginPopup = !isRestoring && !isAuthenticated;

  return (
    <main className="flex w-full min-h-screen">
      {/* ONE Sidebar mount at a fixed tree position, whatever the auth
          state: while signed out the panel stays visible but inert, so
          the admin can see where they are going to land. Rendering the
          sidebar in two different branches (fragment vs wrapper div)
          made React unmount + remount it when the session resolved —
          the remount restarted its mount effects mid-load and raced
          the appearance fetch, which could flip the sidebar's width
          after first paint. The inert styling now toggles on the
          wrapper instead, so the sidebar never remounts. */}
      <div
        className={`min-w-0 flex-1 flex gap-3 flex-col md:flex-row ${
          isAuthenticated ? "" : "pointer-events-none select-none"
        }`}
      >
        {/* Nav per Ahsan's final sidebar model: below md the
            MobileNav top bar is the navigation (the column direction
            is what puts it on TOP of the content); from md up the
            docked desktop sidebar sits at the left, same as large
            devices. */}
        <MobileNav />
        <Sidebar />
        {/* The "built by" credit line closes every page: appended in
            plain flow after the page's own content inside the content
            column — no wrapper or layout change for the pages
            themselves (list pages run their own full-height internal
            scroll and must not be restructured). */}
        <div className="flex-1 min-w-0">
          {children}
          <BuiltByFooter />
        </div>
      </div>

      <AdminLoginPopup
        isOpen={showLoginPopup}
        notice={sessionNotice}
        onDismissNotice={clearNotice}
      />

      {/* The panel's single confirmation-dialog host (replaces every
          native confirm()/alert()). */}
      <ConfirmDialogHost />

      {/* The Settings Lock's per-save security-check host — every
          save inside Settings prompts for the admin's own password
          through this one modal. */}
      <SecurityCheckDialogHost />

      {/* The palette Keep/Revert decision popup lives HERE, not in the
          Appearance picker: the 30s preview can expire while the admin
          is on any page, and the popup must appear wherever they are. */}
      <PaletteDecisionPopup />

      {/* Transient success/error/info messages — bottom-right toasts,
          never an inline banner. */}
      <ToastHost />
    </main>
  );
}

export default function AdminShell({
  children,
  ssrPaletteId,
  ssrSidebarCollapsed,
}: {
  children: React.ReactNode;
  /** The kept palette id the server read from the cookie — seeds
   *  usePalette so JS-coloured elements render in the kept palette
   *  from the very first frame, server and client alike. */
  ssrPaletteId?: string | null;
  /** The sidebar's collapsed state the server read from the
   *  admin-sidebar cookie — seeds the Sidebar's initial state so
   *  the first client render matches the server render (the
   *  hydration #418 class; see services/appearance.ts). */
  ssrSidebarCollapsed?: boolean | null;
}) {
  return (
    <PaletteSeedContext.Provider value={ssrPaletteId ?? null}>
      <SidebarSeedContext.Provider value={ssrSidebarCollapsed ?? null}>
        <AuthProvider>
          <LanguageProvider>
            <AdminShellInner>{children}</AdminShellInner>
          </LanguageProvider>
        </AuthProvider>
      </SidebarSeedContext.Provider>
    </PaletteSeedContext.Provider>
  );
}
