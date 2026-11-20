import React from "react";
import { Ellipsis, ReceiptText } from "lucide-react";

export interface OrderStatusCount {
  status: string;
  count: number;
}

interface OrdersByStatusCardProps {
  /** Undefined while the dashboard request is still in flight. */
  data?: OrderStatusCount[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#fdba74" },
  processing: { label: "Processing", color: "#fb923c" },
  shipped: { label: "Shipped", color: "#f97316" },
  delivered: { label: "Delivered", color: "#ea580c" },
  cancelled: { label: "Cancelled", color: "#d1d5db" },
  refunded: { label: "Refunded", color: "#fca5a5" },
};

/**
 * Occupies the reference design's "Traffic Sources" slot — the segmented
 * share bar and ranked list, but driven by real order statuses (the
 * store has no traffic-source data, so none is shown).
 */
export const OrdersByStatusCard: React.FC<OrdersByStatusCardProps> = ({ data }) => {
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
      meta: STATUS_META[row.status] || { label: row.status, color: "#f97316" },
      pct: total > 0 ? (row.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-(--text)">Orders by Status</h3>
        <Ellipsis className="w-5 h-5 text-(--text-muted)" />
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
                  title={`${row.meta.label}: ${row.count}`}
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
                    {row.meta.label}
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
