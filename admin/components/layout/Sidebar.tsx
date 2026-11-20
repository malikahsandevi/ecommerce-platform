"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  Star,
  Store,
  Tag,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import SidebarItem from "@/components/ui/SidebarItem";
import { useAdminAuth } from "@/services/authContext";

interface SidebarConfig {
  name: string;
  icon: LucideIcon;
  link: string;
}

const TOP_ITEMS: SidebarConfig[] = [
  { name: "Dashboard", icon: LayoutDashboard, link: "/" },
  { name: "Products", icon: Package, link: "/products" },
  { name: "Orders", icon: ShoppingCart, link: "/orders" },
  { name: "Customers", icon: Users, link: "/customers" },
  { name: "Category", icon: FolderTree, link: "/categories" },
  { name: "Brands", icon: Tag, link: "/brands" },
  { name: "Coupons", icon: Ticket, link: "/coupons" },
  { name: "Media", icon: ImageIcon, link: "/media" },
  { name: "Reviews", icon: Star, link: "/reviews" },
];

const BOTTOM_ITEMS: SidebarConfig[] = [
  { name: "Settings", icon: Settings, link: "/setting" },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user } = useAdminAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Expanded by default on desktop; remember the admin's own choice.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin-sidebar");
      if (saved !== null) {
        setCollapsed(saved === "collapsed");
      } else if (window.innerWidth < 1024) {
        setCollapsed(true);
      }
    } catch {
      /* keep the default */
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem("admin-sidebar", prev ? "expanded" : "collapsed");
      } catch {
        /* persistence is best-effort */
      }
      return !prev;
    });
  };

  const isActive = (link: string) =>
    link === "/" ? pathname === "/" : pathname.startsWith(link);

  return (
    <aside
      className={`h-[calc(100dvh-24px)] sticky top-3 left-3 z-50 shrink-0 transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className="h-full flex flex-col shadow-xl p-3 bg-(--primary-light) rounded-2xl">
        {/* Brand Bar */}
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"} px-1 pt-1 pb-3`}>
          <span className="w-10 h-10 shrink-0 rounded-xl bg-(--primary) text-white flex items-center justify-center shadow-sm">
            <Store className="w-5 h-5" />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-bold text-(--text) truncate">
                Ecom Store
              </span>
              <span className="block text-[11px] font-medium text-(--text-soft)">
                Admin Panel
              </span>
            </span>
          )}
        </div>

        <hr className="border-(--background)/50 mb-3" />

        {/* Navigation */}
        <div className="flex flex-col flex-1 justify-between min-h-0">
          <nav className="flex flex-col gap-1 overflow-y-auto">
            {!collapsed && (
              <span className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                Main Menu
              </span>
            )}
            {TOP_ITEMS.map((item) => (
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

          <div className="flex flex-col gap-1">
            {!collapsed && (
              <span className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-(--text-soft)/80">
                General
              </span>
            )}
            {BOTTOM_ITEMS.map((item) => (
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
                className={`mt-2 flex items-center rounded-xl bg-(--background)/70 p-2 ${
                  collapsed ? "justify-center" : "gap-2.5"
                }`}
                title={collapsed ? user.name : undefined}
              >
                <span className="w-8 h-8 shrink-0 rounded-full bg-(--primary) text-white flex items-center justify-center text-[11px] font-bold">
                  {initialsOf(user.name || "Admin")}
                </span>
                {!collapsed && (
                  <span className="min-w-0 leading-tight">
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
              className={`mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-(--text-soft) transition-colors hover:bg-(--background)/60 hover:text-(--text) ${
                collapsed ? "justify-center px-0" : ""
              }`}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
