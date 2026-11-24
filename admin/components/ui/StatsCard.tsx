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
   *  inside its Storage Providers card). It is anchored to the
   *  card's bottom edge, so the value row above it never moves.
   *  Cards that pass nothing render exactly as before. */
  extra?: React.ReactNode;
  /** Optional small control rendered inline, right beside the value
   *  (e.g. the Media page's upload-destination arrow menu beside the
   *  Storage Providers card's destination name). It sits in a slot
   *  exactly as tall as the value's own line, so it can never push
   *  the value off the shared headline line. Cards that pass
   *  nothing render exactly as before. */
  valueAddon?: React.ReactNode;
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
  valueAddon,
}) => {
  const { t } = useLanguage();
  const accent = variantColor(theme, useAdminColor());

  return (
    <div className="w-full min-w-0 flex flex-col p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl transition-all">
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

      {/* Main Content — pinned directly under the header: the value
          row sits at the same height in every card of a strip, no
          matter how much detail each card carries below it. (The
          card used to spread header and content apart with
          justify-between, which pushed the value down by however
          much shorter its card's detail block was.) */}
      <div className="mt-2">
        <div className="flex items-center gap-1">
          <h3 className="min-w-0 truncate text-xl font-bold tracking-tight text-[var(--text)]">
            {value}
          </h3>
          {valueAddon ? (
            <div className="flex h-7 shrink-0 items-center">{valueAddon}</div>
          ) : null}
        </div>

        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{t(period)}</p>
      </div>

      {/* Extra detail — anchored to the card's bottom edge (the
          mt-auto absorbs whatever height the grid's stretch adds),
          with the same 12px separation from the period line the
          in-flow mt-3 used to give. */}
      {extra ? <div className="mt-auto pt-3">{extra}</div> : null}
    </div>
  );
};

export default StatCard;