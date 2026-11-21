// /app/layout.tsx
"use client";

import React, { useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import AdminLoginPopup from "@/components/Login";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialog";
import { ToastHost } from "@/components/ui/Toast";
import { AuthProvider, useAdminAuth } from "@/services/authContext";
import { fetchAndApplyAppearance } from "@/services/appearance";
import { fetchAndApplyStoreCurrency } from "@/services/currency";
import "./globals.css";

// Renders the shell and gates the panel behind a session. Kept separate from
// RootLayout because useAdminAuth must run *inside* the provider.
function AdminShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isRestoring, sessionNotice, clearNotice } = useAdminAuth();

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint so the saved theme AND the saved sidebar
            state are applied without a flash: the sidebar used to render
            expanded first and collapse only once React's effect read
            localStorage. The CSS keyed on html[data-sidebar="collapsed"]
            (globals.css) collapses the server-rendered sidebar from the
            very first frame; the Sidebar component then initialises its
            state from this same attribute and keeps it in sync. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem("theme");
                if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
                  document.documentElement.setAttribute("data-theme", "dark");
                } else {
                  document.documentElement.setAttribute("data-theme", "light");
                }
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
        <AuthProvider>
          <AdminShell>{children}</AdminShell>
        </AuthProvider>
      </body>
    </html>
  );
}
