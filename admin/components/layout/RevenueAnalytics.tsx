"use client";

import React, { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Select from "@/components/ui/Select";
import DateRangePicker, {
  formatRangeDayShort,
  type DateRange,
} from "@/components/ui/DateRangePicker";
import { apiClient } from "@/services/api";
import {
  formatMoney,
  formatMoneyCompact,
  useStoreCurrency,
} from "@/services/currency";
import { useLanguage } from "@/services/i18n";
import { tint, useAdminColor } from "@/services/appearance";

export interface RevenuePoint {
  month: string;
  revenue: number;
  orders: number;
}

export interface DailyPoint {
  day: string;
  revenue: number;
  orders: number;
}

interface RevenueAnalyticsProps {
  /** Undefined while the dashboard request is still in flight. */
  dailyData?: DailyPoint[];
  monthlyData?: RevenuePoint[];
}

type RangeKey = "8days" | "6months" | "custom";

// Chart accents derive from the Admin Panel Color (Settings →
// Appearance): the revenue line IS the primary color, the orders line
// its mid tint. With the default color these are the original
// #f97316 / #fdba74.

interface ChartPoint {
  label: string;
  revenue: number;
  orders: number;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  label?: string;
}) {
  // Revenue figures follow the store currency setting.
  useStoreCurrency();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-(--border) bg-(--background) px-3 py-2 shadow-lg">
      <p className="text-[10px] font-medium text-(--text-muted)">{label}</p>
      <p className="text-sm font-bold text-(--text)">
        Revenue {formatMoney(point.revenue, 2)}
      </p>
      <p className="text-[11px] font-medium text-(--text-muted)">
        {point.orders.toLocaleString()} order{point.orders === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * Revenue Analytics in the EzMart reference style: Revenue (solid orange)
 * and Orders (dashed light orange) lines over a range the admin picks —
 * "Last 8 Days" (daily), "Last 6 Months" (monthly) or "Custom" (the
 * shared DateRangePicker's From/To span, fetched daily + zero-filled
 * from /dashboard/revenue-range). All series come from the real Order
 * collection; cancelled orders are excluded.
 */
export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({
  dailyData,
  monthlyData,
}) => {
  // Re-render the axis in the active store currency when it changes.
  useStoreCurrency();
  const REVENUE_COLOR = useAdminColor();
  const ORDERS_COLOR = tint(REVENUE_COLOR, 0.52);
  const [range, setRange] = useState<RangeKey>("8days");
  // Custom range (Ahsan's Filters-by-Date round): the shared
  // DateRangePicker collects From/To; Apply fetches the zero-filled
  // daily series for exactly that span from the dashboard API.
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [customData, setCustomData] = useState<DailyPoint[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (range !== "custom" || !customRange) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get("/dashboard/revenue-range", {
          params: { from: customRange.from, to: customRange.to },
        });
        if (cancelled) return;
        const series = Array.isArray(res.data?.series) ? res.data.series : [];
        setCustomData(
          series.map((point: { day: string; revenue: number; orders: number }) => ({
            day: String(point.day || ""),
            revenue: Number(point.revenue || 0),
            orders: Number(point.orders || 0),
          }))
        );
      } catch {
        if (!cancelled) setCustomData([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, customRange]);

  if (dailyData === undefined || monthlyData === undefined) {
    return (
      <div className="p-4 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-(--primary-soft) rounded w-40"></div>
          <div className="h-8 bg-(--primary-soft) rounded-lg w-36"></div>
        </div>
        <div className="h-3 bg-(--primary-soft) rounded w-48 mb-5"></div>
        {/* Chart placeholder flexes to fill the card, mirroring the
            loaded card's flex-1 chart area. */}
        <div className="flex-1 min-h-40 bg-(--primary-soft) rounded-xl"></div>
      </div>
    );
  }

  const data: ChartPoint[] =
    range === "8days"
      ? dailyData.map((point) => ({
          label: point.day,
          revenue: point.revenue,
          orders: point.orders,
        }))
      : range === "6months"
        ? monthlyData.map((point) => ({
            label: point.month,
            revenue: point.revenue,
            orders: point.orders,
          }))
        : (customData ?? []).map((point) => ({
            label: point.day,
            revenue: point.revenue,
            orders: point.orders,
          }));

  const { t } = useLanguage();
  return (
    <div className="p-4 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-(--text)">{t("Revenue Analytics")}</h3>
        {/* The shared Select (same component as the list-page filters):
            orange pill trigger, light menu, selected row highlighted —
            the old native <select> opened the browser's blue menu.
            Sized like the list-page filter triggers (size md) and the
            trigger spans the wrapper (triggerFullWidth) so it is exactly
            as wide as the open menu below it. */}
        <Select
          variant="primary"
          size="md"
          triggerFullWidth
          value={range}
          onChange={(value) => {
            // "Custom" never switches the range by itself — it opens
            // the shared DateRangePicker; only its Apply commits (a
            // Cancel leaves the active period untouched).
            if (value === "custom") {
              setPickerOpen(true);
              return;
            }
            setRange(value as RangeKey);
          }}
          options={[
            { label: t("Last 8 Days"), value: "8days" },
            { label: t("Last 6 Months"), value: "6months" },
            { label: t("Custom"), value: "custom" },
          ]}
          triggerLabel={
            range === "custom" && customRange
              ? `${formatRangeDayShort(customRange.from)} – ${formatRangeDayShort(customRange.to)}`
              : undefined
          }
          aria-label={t("Chart range")}
          className="min-w-36"
        />
        <DateRangePicker
          open={pickerOpen}
          value={customRange}
          onClose={() => setPickerOpen(false)}
          onApply={(next) => {
            setCustomRange(next);
            setRange("custom");
            setPickerOpen(false);
          }}
        />
      </div>

      {/* Legend — mirrors the reference (solid = Revenue, dashed = Order) */}
      <div className="flex items-center gap-5 mt-2 mb-1 text-[11px] font-medium text-(--text-muted)">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-[2.5px] rounded"
            style={{ borderColor: REVENUE_COLOR }}
          />
          {t("Revenue")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-[2.5px] border-dashed rounded"
            style={{ borderColor: ORDERS_COLOR }}
          />
          {t("Order")}
        </span>
      </div>

      <div className="w-full flex-1 min-h-40">
        <ResponsiveContainer width="100%" height="100%">
          {/* Left margin + axis width + tick margin are sized together
              so the y-axis money labels always sit fully INSIDE the
              chart box with air on both sides — with left: 0 the labels
              started flush at the box edge and read as clipped/cramped
              at narrower card widths (Ahsan's mark on the $ labels). */}
          <LineChart data={data} margin={{ top: 10, right: 6, left: 8, bottom: 4 }}>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="rgba(148,163,184,0.22)"
              vertical={false}
            />
            {/* X labels run DIAGONAL (Ahsan's order): rotated -35°,
                anchored at their end and given a taller axis band so
                every date shows, fully inside the card — horizontal
                labels crowded and clipped at narrow widths. */}
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              dy={4}
              tickMargin={4}
              interval={data.length > 31 ? "preserveStartEnd" : 0}
              angle={-35}
              textAnchor="end"
              height={52}
            />
            {/* The amounts sit WITH a border (Ahsan's order): a visible
                vertical axis line beside the y labels. */}
            <YAxis
              yAxisId="revenue"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={{ stroke: "rgba(148,163,184,0.55)", strokeWidth: 1 }}
              tickLine={false}
              width={54}
              tickMargin={6}
              tickFormatter={(value: number) => formatMoneyCompact(value)}
            />
            {/* Orders ride on a hidden axis so both lines stay readable
                even though revenue and order counts differ in scale.
                The padded domain keeps the dashed line off the top edge
                when daily counts are small and flat. */}
            <YAxis
              yAxisId="orders"
              orientation="right"
              hide
              domain={[0, (dataMax: number) => Math.max(2, Math.ceil(dataMax * 1.8))]}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: `color-mix(in srgb, ${REVENUE_COLOR} 25%, transparent)` }} />
            <Line
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              stroke={REVENUE_COLOR}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4.5, fill: REVENUE_COLOR, stroke: "#fff", strokeWidth: 2 }}
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              stroke={ORDERS_COLOR}
              strokeWidth={2}
              strokeDasharray="6 6"
              dot={false}
              activeDot={{ r: 4, fill: ORDERS_COLOR, stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueAnalytics;
