"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Store, X } from "lucide-react";
import SidebarItem from "@/components/ui/SidebarItem";
import { useAdminAuth } from "@/services/authContext";
// Same single nav config the desktop Sidebar renders — the mobile bar
// must offer every destination the sidebar does, never a copied subset.
import { TOP_NAV_ITEMS, BOTTOM_NAV_ITEMS } from "@/config/navItems";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Mobile navigation (below sm ONLY, per Ahsan's responsive spec): the
 * nav lives at the TOP of the screen — a sticky bar with the brand,
 * the signed-in admin's chip and a menu button that opens the full
 * nav (every item, permission-filtered exactly like the desktop
 * Sidebar). From sm to lg the left-edge overlay rail in Sidebar.tsx
 * takes over; at lg and up the docked desktop sidebar is untouched.
 */
const MobileNav: React.FC = () => {
  const pathname = usePathname();
  const { user, hasPermission } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  // Landing anywhere (a nav tap, a notification click-through) closes
  // the menu — the panel never hovers over the page it navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const avatarSrc = user?.avatar?.trim();
  const showUserImage = Boolean(avatarSrc && failedAvatarUrl !== avatarSrc);

  const canView = (module: string): boolean =>
    typeof hasPermission === "function" ? hasPermission(module, "view") : true;
  const topItems = TOP_NAV_ITEMS.filter((item) => canView(item.module));
  const bottomItems = BOTTOM_NAV_ITEMS.filter((item) => canView(item.module));

  const isActive = (link: string) =>
    link === "/" ? pathname === "/" : pathname.startsWith(link);

  return (
    <div className="sm:hidden sticky top-3 z-50 mx-3 mt-3 shrink-0">
      {/* Top bar — same panel treatment as the desktop sidebar card. */}
      <div className="relative flex items-center gap-2.5 shadow-xl px-3 py-2.5 bg-(--primary-light) rounded-2xl">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-(--primary) text-white flex items-center justify-center shadow-sm">
          <Store className="w-[18px] h-[18px]" />
        </span>
        <span className="min-w-0 leading-tight flex-1">
          <span className="block text-sm font-bold text-(--text) truncate">
            Ecom Store
          </span>
          <span className="block text-[11px] font-medium text-(--text-soft)">
            Admin Panel
          </span>
        </span>

        {/* Signed-in admin — the sidebar footer chip's mobile form. */}
        {user && (
          <span
            className="flex items-center gap-2 rounded-xl bg-(--background)/70 p-1.5 min-w-0"
            title={user.name}
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
            <span className="hidden min-[420px]:block max-w-28 truncate text-xs font-bold text-(--text)">
              {user.name}
            </span>
          </span>
        )}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-(--text-soft) transition-colors hover:bg-(--background)/60 hover:text-(--text)"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Full nav dropdown — overlays the page, never pushes it. */}
        {open && (
          <div className="absolute left-0 right-0 top-full mt-2 shadow-xl px-3 py-2.5 bg-(--primary-light) rounded-2xl max-h-[70dvh] overflow-y-auto no-scrollbar">
            <nav className="flex flex-col gap-0.5" aria-label="Main">
              <span className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                Main Menu
              </span>
              {topItems.map((item) => (
                <span key={item.name} onClick={() => setOpen(false)} className="block">
                  <SidebarItem
                    name={item.name}
                    icon={item.icon}
                    link={item.link}
                    active={isActive(item.link)}
                  />
                </span>
              ))}
              <span className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                General
              </span>
              {bottomItems.map((item) => (
                <span key={item.name} onClick={() => setOpen(false)} className="block">
                  <SidebarItem
                    name={item.name}
                    icon={item.icon}
                    link={item.link}
                    active={isActive(item.link)}
                  />
                </span>
              ))}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileNav;
