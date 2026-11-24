"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Store, X } from "lucide-react";
import SidebarItem from "@/components/ui/SidebarItem";
import { useAdminAuth } from "@/services/authContext";
import { useLanguage } from "@/services/i18n";
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
 * Top-bar navigation below md ONLY (Ahsan's final sidebar model):
 * under md the nav lives at the TOP of the screen — a normal static
 * bar with the brand, the signed-in admin's chip and a menu button
 * that opens the full nav (every item, exactly like the desktop
 * Sidebar — nothing is permission-filtered out). From md up the docked desktop sidebar
 * (Sidebar.tsx) takes over — same style as large devices — and this
 * bar is hidden.
 */
const MobileNav: React.FC = () => {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { user } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  // The bar + its dropdown live inside this one container, so a press
  // anywhere outside it (and outside the toggle button, which is also
  // inside) is an outside click.
  const barRef = useRef<HTMLDivElement>(null);

  // Landing anywhere (a nav tap, a notification click-through) closes
  // the menu — the panel never hovers over the page it navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Outside-click close (Ahsan: "mobile or tab view me jab user out of
  // topbar menu (sidebar) ky click kry tu wo close ho jye"): a pointer
  // press outside the bar closes the open menu; presses inside the bar
  // or the menu itself leave it open. Escape closes it too.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  const avatarSrc = user?.avatar?.trim();
  const showUserImage = Boolean(avatarSrc && failedAvatarUrl !== avatarSrc);

  // Every item stays visible for every staff user (same rule as the
  // Sidebar): a section without view permission shows the shared
  // permission notice on its page, and the API refuses the data.
  const topItems = TOP_NAV_ITEMS;
  const bottomItems = BOTTOM_NAV_ITEMS;

  const isActive = (link: string) =>
    link === "/" ? pathname === "/" : pathname.startsWith(link);

  return (
    // Normal static bar (Ahsan, 2026-11-22 fix round: the topbar is
    // NOT fixed/sticky at any size) — it scrolls away with the page;
    // z-50 only keeps its open dropdown above the content below.
    <div className="md:hidden z-50 mx-3 mt-3 shrink-0">
      {/* Top bar — same panel treatment as the desktop sidebar card. */}
      <div ref={barRef} className="relative flex items-center gap-2.5 shadow-xl px-3 py-2.5 bg-(--surface) rounded-2xl">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-(--primary) text-white flex items-center justify-center shadow-sm">
          <Store className="w-[18px] h-[18px]" />
        </span>
        <span className="min-w-0 leading-tight flex-1">
          <span className="block text-sm font-bold text-(--text) truncate">
            Ecom Store
          </span>
          <span className="block text-[11px] font-medium text-(--text-soft)">
            {t("Admin Panel")}
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
                loading="lazy"
                decoding="async"
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
          aria-label={open ? t("Close navigation menu") : t("Open navigation menu")}
          aria-expanded={open}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-(--text-soft) transition-colors hover:bg-(--background)/60 hover:text-(--text)"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Full nav dropdown — overlays the page, never pushes it. */}
        {open && (
          <div className="absolute left-0 right-0 top-full mt-2 shadow-xl px-3 py-2.5 bg-(--surface) rounded-2xl max-h-[70dvh] overflow-y-auto no-scrollbar">
            <nav className="flex flex-col gap-0.5" aria-label={t("Main")}>
              <span className="px-3 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                {t("Main Menu")}
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
                {t("General")}
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
