import React from "react";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { useLanguage } from "@/services/i18n";

export interface DashboardStatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  /** Week-over-week % change. null = no meaningful comparison (show "—"). */
  wowPct?: number | null;
  /** First card in the row gets the reference design's orange tint. */
  highlighted?: boolean;
  loading?: boolean;
}

/**
 * Stat card in the EzMart reference style: label + icon chip on top, big
 * value bottom-left, week-over-week chip bottom-right.
 */
export const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  title,
  value,
  icon: Icon,
  wowPct,
  highlighted = false,
  loading = false,
}) => {
  const { t } = useLanguage();
  if (loading) {
    return (
      <div className="w-full min-w-0 p-5 bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse flex flex-col justify-start min-h-[104px]">
        <div className="flex items-center justify-between">
          <div className="h-3.5 bg-(--primary-soft) rounded w-24"></div>
          <div className="h-9 w-9 bg-(--primary-soft) rounded-lg"></div>
        </div>
        <div className="h-8 bg-(--primary-soft) rounded w-32 mt-2"></div>
      </div>
    );
  }

  const hasPct = wowPct !== null && wowPct !== undefined;
  const positive = hasPct && wowPct >= 0;

  return (
    <div
      className="w-full min-w-0 p-5 rounded-2xl shadow-sm border flex flex-col justify-start min-h-[104px] transition-colors"
      style={
        highlighted
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--primary) 13%, var(--background))",
              borderColor:
                "color-mix(in srgb, var(--primary) 25%, var(--border))",
            }
          : {
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
            }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-(--text-muted) pt-1">
          {title}
        </span>
        <span
          className={`shrink-0 flex items-center justify-center w-9 h-9 rounded-lg ${
            highlighted
              ? "bg-(--primary) text-white"
              : "bg-(--surface-muted) text-(--text-muted)"
          }`}
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>

      <div className="flex items-end justify-between gap-2 mt-2">
        <h3 className="text-[26px] leading-8 font-bold tracking-tight text-(--text) truncate">
          {value}
        </h3>
        <div className="text-right shrink-0">
          {hasPct ? (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                positive ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {positive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {positive ? "+" : ""}
              {wowPct.toFixed(2)}%
            </span>
          ) : (
            <span className="text-xs font-bold text-(--text-muted)">—</span>
          )}
          <p className="text-[10px] text-(--text-muted)">{t("vs last week")}</p>
        </div>
      </div>
    </div>
  );
};

export default DashboardStatCard;
