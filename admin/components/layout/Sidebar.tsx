"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, Store, X } from "lucide-react";
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

type NavItem = (typeof TOP_NAV_ITEMS)[number];
type ShellUser = { name: string; email?: string; role: string } | null;

/**
 * The sidebar's inner panel (brand, nav, user chip, footer button) —
 * ONE implementation rendered by both the docked desktop sidebar
 * (lg+, expanded or collapsed) and the sm–lg overlay flyout (always
 * expanded, its footer button closes the flyout instead of toggling
 * the collapse pref).
 */
function SidebarBody({
  collapsed,
  topItems,
  bottomItems,
  isActive,
  user,
  showUserImage,
  avatarSrc,
  onAvatarError,
  onToggle,
  toggleKind,
}: {
  collapsed: boolean;
  topItems: NavItem[];
  bottomItems: NavItem[];
  isActive: (link: string) => boolean;
  user: ShellUser;
  showUserImage: boolean;
  avatarSrc?: string;
  onAvatarError: () => void;
  onToggle: () => void;
  toggleKind: "collapse" | "close";
}) {
  return (
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
                  onError={onAvatarError}
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
            onClick={onToggle}
            aria-label={
              toggleKind === "close"
                ? "Close sidebar"
                : collapsed
                  ? "Expand sidebar"
                  : "Collapse sidebar"
            }
            className={`sb-center mt-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-(--text-soft) transition-colors hover:bg-(--background)/60 hover:text-(--text) ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {toggleKind === "close" ? (
              <X size={20} />
            ) : collapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <PanelLeftClose size={20} />
            )}
            {!collapsed && (
              <span className="sb-label">
                {toggleKind === "close" ? "Close" : "Collapse"}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
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

  // sm–lg overlay flyout (Ahsan's responsive spec): the full sidebar
  // opens OVER the panel from the icon rail — it never takes layout
  // space, so the panel/content width is identical open or closed.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    setOverlayOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlayOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen]);

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

  const bodyProps = {
    topItems,
    bottomItems,
    isActive,
    user: user
      ? { name: user.name, email: user.email, role: user.role }
      : null,
    showUserImage,
    avatarSrc,
    onAvatarError: () => setFailedAvatarUrl(avatarSrc ?? null),
  };

  return (
    <>
      {/* lg and up: the docked desktop sidebar, exactly as before —
          its width comes OUT of the panel layout. */}
      <aside
        suppressHydrationWarning
        className={`admin-sidebar max-lg:hidden h-[calc(100dvh-24px)] sticky top-3 left-3 z-50 shrink-0 transition-all duration-300 ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <SidebarBody
          {...bodyProps}
          collapsed={collapsed}
          onToggle={toggle}
          toggleKind="collapse"
        />
      </aside>

      {/* sm–lg: slim icon rail at the left edge. It is the sidebar's
          closed state in this range; the full sidebar opens from it
          as a fixed overlay (below), so opening never resizes the
          panel — the content width is the same open or closed. */}
      <div className="admin-rail hidden sm:block lg:hidden sticky top-3 left-3 z-40 shrink-0 h-[calc(100dvh-24px)] w-[68px]">
        <div className="h-full flex flex-col shadow-xl px-3 py-2.5 bg-(--primary-light) rounded-2xl">
          <div className="flex justify-center px-1 pt-0.5 pb-2">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-(--primary) text-white flex items-center justify-center shadow-sm">
              <Store className="w-[18px] h-[18px]" />
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOverlayOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={overlayOpen}
            className="flex items-center justify-center rounded-xl px-3 py-2 text-(--text-soft) transition-colors hover:bg-(--background)/60 hover:text-(--text)"
          >
            <Menu size={20} />
          </button>
          <hr className="border-(--background)/50 my-2" />
          <nav
            className="flex flex-col gap-0.5 overflow-y-auto no-scrollbar flex-1 min-h-0"
            aria-label="Main"
          >
            {topItems.map((item) => (
              <SidebarItem
                key={item.name}
                name={item.name}
                icon={item.icon}
                link={item.link}
                active={isActive(item.link)}
                collapsed
              />
            ))}
            {bottomItems.map((item) => (
              <SidebarItem
                key={item.name}
                name={item.name}
                icon={item.icon}
                link={item.link}
                active={isActive(item.link)}
                collapsed
              />
            ))}
          </nav>
          {user && (
            <div className="mt-2 flex justify-center" title={user.name}>
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
            </div>
          )}
        </div>
      </div>

      {/* sm–lg: the full sidebar as a fixed overlay flyout — floats
          over the panel (backdrop + panel are position:fixed, so the
          layout underneath never moves). */}
      {overlayOpen && (
        <>
          <div
            data-sidebar-overlay-backdrop
            className="fixed inset-0 z-[60] bg-black/40 lg:hidden"
            onClick={() => setOverlayOpen(false)}
          />
          <aside
            data-sidebar-overlay
            className="fixed left-3 top-3 z-[70] w-60 h-[calc(100dvh-24px)] lg:hidden"
          >
            <SidebarBody
              {...bodyProps}
              collapsed={false}
              onToggle={() => setOverlayOpen(false)}
              toggleKind="close"
            />
          </aside>
        </>
      )}
    </>
  );
};

export default Sidebar;
