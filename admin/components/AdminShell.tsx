"use client";

import React, { useEffect, useLayoutEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import AdminLoginPopup from "@/components/Login";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialog";
import { ToastHost } from "@/components/ui/Toast";
import { AuthProvider, useAdminAuth } from "@/services/authContext";
import { fetchAndApplyAppearance, reassertDeviceTheme } from "@/services/appearance";
import { fetchAndApplyStoreCurrency } from "@/services/currency";

// Renders the shell and gates the panel behind a session. Kept separate from
// the root layout (a server component) because useAdminAuth must run *inside*
// the provider — and because the root layout must stay a server component so
// React never hydration-diffs the <html> element's attributes (see
// app/layout.tsx).
function AdminShellInner({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isRestoring, sessionNotice, clearNotice } = useAdminAuth();

  // The stored device theme is the single source of truth for the theme.
  // Re-assert it onto <html> in a layout effect — synchronously after the
  // hydration commit, before the browser paints the hydrated tree — so the
  // attribute the pre-paint script set can never be lost between first
  // paint and the (auth-gated, network-bound) appearance fetch.
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

  // Avoid flashing the login popup while the session probe is still running.
  const showLoginPopup = !isRestoring && !isAuthenticated;

  return (
    <main className="flex w-full min-h-screen">
      <div className="min-w-0 flex-1 flex gap-3">
        {isAuthenticated ? (
          <>
            <Sidebar />
            <div className="flex-1 min-w-0">{children}</div>
          </>
        ) : (
          // While signed out the panel stays visible but inert, so the admin
          // can see where they are going to land.
          <div className="pointer-events-none select-none min-w-0 flex-1 flex gap-3">
            <Sidebar />
            <div className="flex-1 min-w-0">{children}</div>
          </div>
        )}
      </div>

      <AdminLoginPopup
        isOpen={showLoginPopup}
        notice={sessionNotice}
        onDismissNotice={clearNotice}
      />

      {/* The panel's single confirmation-dialog host (replaces every
          native confirm()/alert()). */}
      <ConfirmDialogHost />

      {/* Transient success/error/info messages — bottom-right toasts,
          never an inline banner. */}
      <ToastHost />
    </main>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShellInner>{children}</AdminShellInner>
    </AuthProvider>
  );
}
