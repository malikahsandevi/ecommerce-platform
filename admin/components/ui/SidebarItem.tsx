"use client";

import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/services/i18n";

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
  const { t } = useLanguage();
  const label = t(name);
  return (
    <Link
      href={link}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`sb-center relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
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
      {/* Nav label colour is THEME-AWARE via --nav-label: pure
          WHITE on the dark sidebar (Ahsan's order), dark/readable
          on the light sidebar — white labels were invisible there
          once the palettes' light sets restored the white theme.
          The colour sits on the label span only, so icon colours
          (which inherit the link colour) and the active pill
          background stay exactly as they were; the active item is
          told apart by its pill, bar and weight. */}
      {!collapsed && <span className="sb-label truncate text-(--nav-label)">{label}</span>}
    </Link>
  );
};

export default SidebarItem;
