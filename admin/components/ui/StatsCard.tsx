"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { useLanguage } from "@/services/i18n";
import { shade, tint, useAdminColor } from "@/services/appearance";

// Theme types
export type CardTheme = "green" | "purple" | "orange" | "blue";

export interface StatCardProps {
  title: string;
  value: string | number;
  change: string;
  isPositive: boolean;
  period?: string;
  icon?: LucideIcon;
  theme?: CardTheme;
  /** Optional extra content rendered inside the card, under the
   *  period line (e.g. the Media page's upload-destination control
   *  inside its Storage Providers card). Cards that pass nothing
   *  render exactly as before. */
  extra?: React.ReactNode;
}

// The four variants are steps of ONE ramp of the Admin Panel Color
// (Settings → Appearance) — the same ramp the dashboard donut uses.
// They used to be fixed emerald / purple / blue families (only
// "orange" followed the panel color), so the stat strips on every
// list page and the Media page kept a fixed rainbow under EVERY
// palette — the same fixed-family defect as the dashboard charts.
// Variant → ramp step: orange = the primary itself, green = its
// first tint, purple = its second tint, blue = its shade.
const variantColor = (theme: CardTheme, base: string): string => {
  switch (theme) {
    case "green":
      return tint(base, 0.27);
    case "purple":
      return tint(base, 0.52);
    case "blue":
      return shade(base, 0.08);
    case "orange":
    default:
      return base;
  }
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  isPositive,
  period = "vs last week",
  icon: Icon,
  theme = "green",
  extra,
}) => {
  const { t } = useLanguage();
  const accent = variantColor(theme, useAdminColor());

  return (
    <div className="w-full min-w-0 flex flex-col justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {/* Live Indicator Dot */}
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
          />

          <span className="text-xs font-medium text-[var(--text-muted)] truncate">
            {title}
          </span>
        </div>

        {/* Dynamic Icon Background */}
        {Icon && (
          <div
            className="shrink-0 flex items-center justify-center rounded-xl p-2.5"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
              color: accent,
            }}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="mt-2">
        <h3 className="text-xl font-bold tracking-tight text-[var(--text)]">
          {value}
        </h3>

        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{t(period)}</p>

        {extra ? <div className="mt-3">{extra}</div> : null}
      </div>
    </div>
  );
};

export default StatCard;