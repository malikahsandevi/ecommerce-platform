"use client";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
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
// Appearance): the revenue area IS the primary color, the orders line
// its mid tint. With the default color these are the original
// #f97316 / #fdba74.

interface ChartPoint {
  label: string;
  revenue: number;
  orders: number;
}

/**
 * The revenue series' active dot carries the values itself (Ahsan's
 * design: NO separate tooltip box — the chart's Tooltip renders
 * nothing). The box content is the old ChartTooltip's: the point's
 * label, the currency-formatted revenue and the order count. The box
 * sits above the dot (below it when the point rides the top edge) and
 * is clamped inside the chart's width so the first/last points never
 * clip it.
 */
function RevenueActiveDot(props: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  index?: number;
  color?: string;
  chartWidth?: number;
  dataLength?: number;
}) {
  // Revenue figures follow the store currency setting.
  useStoreCurrency();
  const { cx, cy, payload, index, color, chartWidth = 0, dataLength = 0 } = props;
  if (cx == null || cy == null || !payload) return null;
  const W = 176;
  const H = 66;
  let x = cx - W / 2;
  if (chartWidth > 0) {
    x = Math.max(0, Math.min(x, chartWidth - W));
  } else if (dataLength > 0 && index === dataLength - 1) {
    // Width not measured yet: right-anchor the box on the last point.
    x = Math.max(0, cx - W + 24);
  } else {
    x = Math.max(0, x);
  }
  const y = cy - H - 10 >= 0 ? cy - H - 10 : cy + 14;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
      <foreignObject x={x} y={y} width={W} height={H}>
        <div className="rounded-xl border border-(--border) bg-(--background) px-3 py-2 shadow-lg">
          <p className="text-[10px] font-medium text-(--text-muted)">{payload.label}</p>
          <p className="text-sm font-bold text-(--text)">
            Revenue {formatMoney(payload.revenue, 2)}
          </p>
          <p className="text-[11px] font-medium text-(--text-muted)">
            {payload.orders.toLocaleString()} order{payload.orders === 1 ? "" : "s"}
          </p>
        </div>
      </foreignObject>
    </g>
  );
}

/**
 * Revenue Analytics in AHSAN'S OWN chart design (ported 2026-11-23
 * from his component at his order — "ye mera chart tha... iski values
 * se update karo"): an AREA chart — revenue filled with the primary
 * gradient (0.4 → 0), orders a thin dashed line over it, values shown
 * by the revenue active dot (no tooltip box), horizontal 9px axis
 * labels, NO grid and NO axis lines. This design supersedes three
 * earlier admin-specific orders: the -35° diagonal date labels, the
 * y-axis border line and the dashed Cartesian grid.
 *
 * The data flow is unchanged: Revenue (solid) and Orders (dashed)
 * series over a range the admin picks — "Last 8 Days" (daily), "Last
 * 6 Months" (monthly) or "Custom" (the shared DateRangePicker's
 * From/To span, fetched daily + zero-filled from
 * /dashboard/revenue-range). All series come from the real Order
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
  // Measured chart width (ResponsiveContainer reports it) — the
  // active dot clamps its value box inside it.
  const [chartWidth, setChartWidth] = useState(0);
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
    // Skeleton mirrors the loaded card's geometry (padding, fixed
    // 272px height below md, shadow) so nothing jumps when data lands.
    return (
      <div className="p-5 md:p-3 lg:p-5 w-full h-68 md:h-full bg-(--background) rounded-2xl shadow-xl border border-(--border) animate-pulse flex flex-col select-none">
        <div className="flex items-center justify-between mb-2">
          <div className="h-5 bg-(--primary-soft) rounded w-40"></div>
          <div className="h-8 bg-(--primary-soft) rounded-lg w-32"></div>
        </div>
        <div className="h-3 bg-(--primary-soft) rounded w-48 mb-1"></div>
        {/* Chart placeholder flexes to fill the card, mirroring the
            loaded card's flex-1 chart area. */}
        <div className="flex-1 min-h-0 bg-(--primary-soft) rounded-xl"></div>
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
    <div className="p-5 md:p-3 lg:p-5 bg-(--background) rounded-2xl shadow-xl border border-(--border) flex flex-col h-68 md:h-full w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-(--text)">{t("Revenue Analytics")}</h3>
        {/* The shared Select (same component as the list-page filters):
            orange pill trigger, light menu, selected row highlighted —
            the old native <select> opened the browser's blue menu.
            Fixed 128px wide (Ahsan's design values). */}
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
          className="w-32 shrink-0"
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

      {/* Legend (Ahsan's design): a solid 12px bar for Revenue, three
          small dashes for Order, both in the series colors. */}
      <div className="flex items-center gap-3 mb-1 text-xs font-medium text-(--text-muted)">
        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-0.5 rounded-full"
            style={{ backgroundColor: REVENUE_COLOR }}
          />
          <span>{t("Revenue")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex flex-row gap-0.5">
            <span
              className="w-1 h-0.5 rounded-full"
              style={{ backgroundColor: ORDERS_COLOR }}
            />
            <span
              className="w-1 h-0.5 rounded-full"
              style={{ backgroundColor: ORDERS_COLOR }}
            />
            <span
              className="w-1 h-0.5 rounded-full"
              style={{ backgroundColor: ORDERS_COLOR }}
            />
          </div>
          <span>{t("Order")}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full flex-1 h-full min-h-0">
        <ResponsiveContainer
          width="100%"
          height="100%"
          onResize={(w) => setChartWidth(w)}
        >
          <AreaChart
            data={data}
            margin={{ top: 35, right: 0, left: 0, bottom: -17 }}
          >
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity={0.4} />
                <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 9 }}
              dy={-5}
            />

            {/* No axis line (Ahsan's design); the lowest tick (0) is
                blanked, the rest compact currency. */}
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 9 }}
              tickFormatter={(value: number, index: number) => {
                if (index === 0) return "";
                return formatMoneyCompact(value);
              }}
              width={40}
              dx={5}
            />

            {/* No tooltip box and no cursor (Ahsan's design): the
                revenue active dot carries the values. The Tooltip
                still drives the hover/active state. */}
            <Tooltip
              content={() => null}
              cursor={false}
              wrapperStyle={{ display: "none" }}
            />

            <Area
              type="monotone"
              dataKey="orders"
              stroke={ORDERS_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              fill="none"
              activeDot={false}
              isAnimationActive={true}
            />

            <Area
              type="monotone"
              dataKey="revenue"
              stroke={REVENUE_COLOR}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#revenueGradient)"
              activeDot={(dotProps) => (
                <RevenueActiveDot
                  {...dotProps}
                  color={REVENUE_COLOR}
                  chartWidth={chartWidth}
                  dataLength={data.length}
                />
              )}
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueAnalytics;
