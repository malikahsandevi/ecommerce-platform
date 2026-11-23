import React from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { useLanguage } from "@/services/i18n";
import { shade, tint, useAdminColor } from "@/services/appearance";

export interface OrderStatusCount {
  status: string;
  count: number;
}

interface OrdersByStatusCardProps {
  /** Undefined while the dashboard request is still in flight. */
  data?: OrderStatusCount[];
}

const STATUS_META: Record<string, { label: string }> = {
  pending: { label: "Pending" },
  processing: { label: "Processing" },
  shipped: { label: "Shipped" },
  delivered: { label: "Delivered" },
  cancelled: { label: "Cancelled" },
  refunded: { label: "Refunded" },
};

// The progression colors are a ramp of the Admin Panel Color
// (Settings → Appearance): pending lightest → delivered darkest.
// Cancelled (grey) and refunded (soft red) are semantic and stay.
// Read at render time so a color change repaints on the next render.
const statusColor = (status: string, base: string): string => {
  switch (status) {
    case "pending": return tint(base, 0.52);
    case "processing": return tint(base, 0.27);
    case "shipped": return base;
    case "delivered": return shade(base, 0.08);
    case "cancelled": return "#d1d5db";
    case "refunded": return "#fca5a5";
    default: return base;
  }
};

/**
 * Occupies the reference design's "Traffic Sources" slot — the segmented
 * share bar and ranked list, but driven by real order statuses (the
 * store has no traffic-source data, so none is shown).
 */
export const OrdersByStatusCard: React.FC<OrdersByStatusCardProps> = ({ data }) => {
  // The REACTIVE admin color: during a palette preview this is the
  // previewed palette — the device store this card used to read only
  // ever holds the KEPT palette, so the ramp judged previews wrong.
  const base = useAdminColor();
  if (data === undefined) {
    return (
      <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse">
        <div className="h-5 bg-(--primary-soft) rounded w-36 mb-5"></div>
        <div className="h-9 bg-(--primary-soft) rounded-lg mb-5"></div>
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center justify-between mb-3.5">
            <div className="h-3 bg-(--primary-soft) rounded w-24"></div>
            <div className="h-3 bg-(--primary-soft) rounded w-8"></div>
          </div>
        ))}
      </div>
    );
  }

  const total = data.reduce((sum, row) => sum + row.count, 0);
  const rows = data
    .map((row) => ({
      ...row,
      meta: {
        label: STATUS_META[row.status]?.label || row.status,
        color: statusColor(row.status, base),
      },
      pct: total > 0 ? (row.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const { t } = useLanguage();
  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-(--text)">{t("Orders by Status")}</h3>
        <Link
          href="/orders"
          className="text-xs font-semibold text-(--primary) hover:text-(--primary-dark) transition-colors"
        >
          {t("See All")}
        </Link>
      </div>

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-6 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <ReceiptText className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">No orders yet</p>
          <p className="text-[11px] text-(--text-muted) max-w-50">
            When orders come in, their status split will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Segmented share bar */}
          <div className="flex h-9 rounded-lg overflow-hidden gap-0.5 mb-5">
            {rows
              .filter((row) => row.count > 0)
              .map((row) => (
                <div
                  key={row.status}
                  style={{
                    flexGrow: row.count,
                    backgroundColor: row.meta.color,
                  }}
                  title={`${t(row.meta.label)}: ${row.count}`}
                />
              ))}
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.status} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: row.meta.color }}
                  />
                  <span className="font-medium text-(--text-muted) truncate">
                    {t(row.meta.label)}
                  </span>
                </span>
                <span className="shrink-0 ml-2">
                  <span className="font-bold text-(--text)">
                    {row.count.toLocaleString()}
                  </span>
                  <span className="text-(--text-muted) font-medium ml-2">
                    {row.pct % 1 ? row.pct.toFixed(1) : row.pct}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default OrdersByStatusCard;
