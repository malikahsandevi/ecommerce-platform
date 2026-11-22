// config/navItems.ts
//
// Single source of truth for the admin's page navigation: each page's
// name, Lucide icon, link and permission module. The Sidebar renders
// these items, and anything else that needs a page's identity icon
// (e.g. the DetailPanel empty state) looks it up here too — never copy
// this mapping into a component.
import {
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Tag,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItemConfig {
  name: string;
  icon: LucideIcon;
  link: string;
  /** Permission module that gates this entry (ITEM: role permissions). */
  module: string;
}

export const TOP_NAV_ITEMS: NavItemConfig[] = [
  { name: "Dashboard", icon: LayoutDashboard, link: "/", module: "Dashboard" },
  { name: "Products", icon: Package, link: "/products", module: "Products" },
  { name: "Orders", icon: ShoppingCart, link: "/orders", module: "Orders" },
  { name: "Customers", icon: Users, link: "/customers", module: "Customers" },
  { name: "Category", icon: FolderTree, link: "/categories", module: "Categories" },
  { name: "Brands", icon: Tag, link: "/brands", module: "Brands" },
  { name: "Coupons", icon: Ticket, link: "/coupons", module: "Coupons" },
  { name: "Media", icon: ImageIcon, link: "/media", module: "Media" },
  { name: "Reviews", icon: Star, link: "/reviews", module: "Reviews" },
];

export const BOTTOM_NAV_ITEMS: NavItemConfig[] = [
  { name: "Settings", icon: Settings, link: "/setting", module: "Settings" },
];

/**
 * A page's own icon, looked up by its permission module — which is the
 * same string as the resource configs' `routeTitle` ("Customers",
 * "Products", ...). Falls back to the generic Package glyph.
 */
export function getPageIcon(module: string): LucideIcon {
  const item = [...TOP_NAV_ITEMS, ...BOTTOM_NAV_ITEMS].find(
    (entry) => entry.module === module,
  );
  return item?.icon ?? Package;
}
