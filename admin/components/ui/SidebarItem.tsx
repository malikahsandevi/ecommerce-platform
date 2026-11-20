"use client";

import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface SidebarItemProps {
  name: string;
  icon: LucideIcon;
  link: string;
  active?: boolean;
  collapsed?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  name,
  icon: Icon,
  link,
  active = false,
  collapsed = false,
}) => {
  return (
    <Link
      href={link}
      title={collapsed ? name : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
        collapsed ? "justify-center px-0" : ""
      } ${
        active
          ? "bg-(--background) text-(--primary-dark) font-semibold shadow-sm"
          : "text-(--text-soft) hover:bg-(--background)/60 hover:text-(--text)"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-(--primary)" />
      )}
      <Icon size={20} className={active ? "text-(--primary)" : ""} />
      {!collapsed && <span className="truncate">{name}</span>}
    </Link>
  );
};

export default SidebarItem;
