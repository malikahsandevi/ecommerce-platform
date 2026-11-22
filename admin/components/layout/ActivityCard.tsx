"use client";

import React from "react";
import {
  Activity,
  BadgePercent,
  MessageSquareText,
  Package,
  RefreshCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/services/i18n";

export interface ActivityLogItem {
  id: string;
  type: string;
  description: string;
  createdAt?: string;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  PURCHASE: Package,
  PRICE_UPDATE: BadgePercent,
  REVIEW: MessageSquareText,
  STOCK_ALERT: TriangleAlert,
  STATUS_CHANGE: RefreshCcw,
};

type Translate = (key: string) => string;

const titleCase = (value: string): string =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Activity descriptions are stored by the backend as English sentences
 * built from a small set of fixed templates (see backend logActivity
 * callers). Rebuild the sentence from its template in the active
 * language, keeping the data parts (names, numbers) untouched; an
 * unrecognised description is shown as stored.
 */
function localizedDescription(description: string, t: Translate): string {
  let m = description.match(/^New (\d+)-star review on (.+)$/);
  if (m) {
    return t("New {rating}-star review on {product}")
      .replace("{rating}", m[1])
      .replace("{product}", m[2]);
  }
  m = description.match(/^Price updated for (.+): (\$[\d.,]+) → (\$[\d.,]+)$/);
  if (m) {
    return t("Price updated for {product}: {oldPrice} → {newPrice}")
      .replace("{product}", m[1])
      .replace("{oldPrice}", m[2])
      .replace("{newPrice}", m[3]);
  }
  m = description.match(/^(.+) is running low \((\d+) left\)$/);
  if (m) {
    return t("{product} is running low ({stock} left)")
      .replace("{product}", m[1])
      .replace("{stock}", m[2]);
  }
  m = description.match(/^Order (.+) placed by (.+) — (\$[\d.,]+)$/);
  if (m) {
    return t("Order {order} placed by {customer} — {total}")
      .replace("{order}", m[1])
      .replace("{customer}", m[2])
      .replace("{total}", m[3]);
  }
  m = description.match(/^Order (.+) status changed from (\S+) to (\S+)$/);
  if (m) {
    return t("Order {order} status changed from {from} to {to}")
      .replace("{order}", m[1])
      .replace("{from}", t(titleCase(m[2])))
      .replace("{to}", t(titleCase(m[3])));
  }
  return description;
}

function timeLabel(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const ActivityCard: React.FC<{ logs?: ActivityLogItem[] }> = ({ logs }) => {
  const { t } = useLanguage();
  if (!logs) {
    return (
      <div className="bg-(--background) p-5 rounded-2xl shadow-sm border border-(--border) h-full w-full animate-pulse">
        <div className="h-5 bg-(--primary-soft) rounded w-36 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-(--primary-soft)"></div>
              <div className="h-3 bg-(--primary-soft) rounded flex-1"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-(--background) p-5 rounded-2xl shadow-sm border border-(--border) h-full w-full flex flex-col">
      <h3 className="text-base font-bold text-(--text) mb-4">{t("Recent Activity")}</h3>

      {logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">{t("No recent activity")}</p>
          <p className="text-[11px] text-(--text-muted) max-w-55">
            {t("Purchases, price updates and reviews will be recorded here.")}
          </p>
        </div>
      ) : (
        // The list flexes to the card's full height and each entry
        // becomes an equal band (flex-1, vertically centred): beside
        // Recent Orders this card is stretched by the grid row, and
        // with only a few log entries the bottom half used to stand
        // empty (measured 88–121px of dead space at lg widths).
        <ul className="flex-1 flex flex-col divide-y divide-(--border)">
          {logs.map((log) => {
            const Icon = TYPE_ICONS[log.type] || Activity;
            return (
              <li key={log.id} className="flex-1 flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="w-8 h-8 shrink-0 rounded-full bg-(--primary-soft) text-(--primary) flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-(--text) leading-snug">{localizedDescription(log.description, t)}</p>
                  <p className="text-[11px] text-(--text-muted) mt-0.5">
                    {t(titleCase(log.type))}
                    {log.createdAt ? ` • ${timeLabel(log.createdAt)}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ActivityCard;
