"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Store } from "lucide-react";
import SidebarItem from "@/components/ui/SidebarItem";
import { useAdminAuth } from "@/services/authContext";
// Page names/icons/links live in ONE shared config — the DetailPanel
// empty state looks up the same icons via getPageIcon().
import { TOP_NAV_ITEMS, BOTTOM_NAV_ITEMS } from "@/config/navItems";

/** Keeps the pre-paint attribute (root layout inline script + globals.css)
 *  in step with the React state, so the two never disagree. */
function syncSidebarAttribute(collapsed: boolean) {
  try {
    if (collapsed) {
      document.documentElement.setAttribute("data-sidebar", "collapsed");
    } else {
      document.documentElement.removeAttribute("data-sidebar");
    }
  } catch {
    /* attribute sync is best-effort */
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, hasPermission } = useAdminAuth();
  // Initialise SYNCHRONOUSLY from the attribute the root layout's inline
  // script set before first paint — the state is correct on the very
  // first render, so the sidebar never flashes expanded-then-collapsed.
  // Fallback: if the attribute is somehow missing at mount time (a stray
  // writer removed it), the stored pref itself still answers correctly,
  // and the mount effect below re-syncs the attribute from it.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    if (document.documentElement.getAttribute("data-sidebar") === "collapsed") return true;
    try {
      return localStorage.getItem("admin-sidebar") === "collapsed";
    } catch {
      return false;
    }
  });

  // Expanded by default on desktop; remember the admin's own choice.
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const saved = localStorage.getItem("admin-sidebar");
        if (saved !== null) {
          setCollapsed(saved === "collapsed");
          syncSidebarAttribute(saved === "collapsed");
        } else if (window.innerWidth < 1024) {
          setCollapsed(true);
          syncSidebarAttribute(true);
        }
      } catch {
        /* keep the default */
      }
    };
    syncFromStorage();
    // Settings → Appearance (compact sidebar) writes the same key and
    // fires this event so the change applies without a reload.
    window.addEventListener("admin:sidebar-pref", syncFromStorage);
    return () => window.removeEventListener("admin:sidebar-pref", syncFromStorage);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin-sidebar", next ? "collapsed" : "expanded");
      } catch {
        /* persistence is best-effort */
      }
      syncSidebarAttribute(next);
      return next;
    });
  };

  // Signed-in user's photo for the footer card: the image when the
  // account has one (and it loads), the initials circle otherwise —
  // the same fallback pattern the TopBar chip uses. Keyed by URL so a
  // changed photo gets a fresh attempt.
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const avatarSrc = user?.avatar?.trim();
  const showUserImage = Boolean(avatarSrc && failedAvatarUrl !== avatarSrc);

  // Modules the signed-in role cannot view are hidden. While permissions
  // are still loading, hasPermission answers "yes" so nothing flickers.
  const canView = (module: string): boolean =>
    typeof hasPermission === "function" ? hasPermission(module, "view") : true;
  const topItems = TOP_NAV_ITEMS.filter((item) => canView(item.module));
  const bottomItems = BOTTOM_NAV_ITEMS.filter((item) => canView(item.module));

  const isActive = (link: string) =>
    link === "/" ? pathname === "/" : pathname.startsWith(link);

  return (
    <aside
      suppressHydrationWarning
      className={`admin-sidebar h-[calc(100dvh-24px)] sticky top-3 left-3 z-50 shrink-0 transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className="h-full flex flex-col shadow-xl px-3 py-2.5 bg-(--primary-light) rounded-2xl">
        {/* Brand Bar */}
        <div className={`sb-center flex items-center ${collapsed ? "justify-center" : "gap-2.5"} px-1 pt-0.5 pb-2`}>
          <span className="w-9 h-9 shrink-0 rounded-xl bg-(--primary) text-white flex items-center justify-center shadow-sm">
            <Store className="w-[18px] h-[18px]" />
          </span>
          {!collapsed && (
            <span className="sb-label min-w-0 leading-tight">
              <span className="block text-sm font-bold text-(--text) truncate">
                Ecom Store
              </span>
              <span className="block text-[11px] font-medium text-(--text-soft)">
                Admin Panel
              </span>
            </span>
          )}
        </div>

        <hr className="border-(--background)/50 mb-2" />

        {/* Navigation */}
        <div className="flex flex-col flex-1 justify-between min-h-0">
          <nav className="flex flex-col gap-0.5 overflow-y-auto no-scrollbar">
            {!collapsed && (
              <span className="sb-label px-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                Main Menu
              </span>
            )}
            {topItems.map((item) => (
              <SidebarItem
                key={item.name}
                name={item.name}
                icon={item.icon}
                link={item.link}
                active={isActive(item.link)}
                collapsed={collapsed}
              />
            ))}
          </nav>

          <div className="flex flex-col gap-0.5 mt-2">
            {!collapsed && (
              <span className="sb-label px-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                General
              </span>
            )}
            {bottomItems.map((item) => (
              <SidebarItem
                key={item.name}
                name={item.name}
                icon={item.icon}
                link={item.link}
                active={isActive(item.link)}
                collapsed={collapsed}
              />
            ))}

            {/* Signed-in admin */}
            {user && (
              <div
                className={`sb-center mt-1.5 flex items-center rounded-xl bg-(--background)/70 p-1.5 ${
                  collapsed ? "justify-center" : "gap-2.5"
                }`}
                title={collapsed ? user.name : undefined}
              >
                {showUserImage ? (
                  <img
                    src={avatarSrc}
                    alt={user.name || "Admin"}
                    onError={() => setFailedAvatarUrl(avatarSrc ?? null)}
                    className="w-7 h-7 shrink-0 rounded-full object-cover ring-2 ring-(--primary)"
                  />
                ) : (
                  <span className="w-7 h-7 shrink-0 rounded-full bg-(--primary) text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-(--primary)">
                    {initialsOf(user.name || "Admin")}
                  </span>
                )}
                {!collapsed && (
                  <span className="sb-label min-w-0 leading-tight">
                    <span className="block text-xs font-bold text-(--text) truncate">
                      {user.name}
                    </span>
                    <span className="block text-[10px] font-medium text-(--text-muted) truncate">
                      {user.email || user.role}
                    </span>
                  </span>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`sb-center mt-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-(--text-soft) transition-colors hover:bg-(--background)/60 hover:text-(--text) ${
                collapsed ? "justify-center px-0" : ""
              }`}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
              {!collapsed && <span className="sb-label">Collapse</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
