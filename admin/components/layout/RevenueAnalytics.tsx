"use client";

import React, { useState } from "react";
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
import {
  formatMoney,
  formatMoneyCompact,
  useStoreCurrency,
} from "@/services/currency";

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

type RangeKey = "8days" | "6months";

const REVENUE_COLOR = "#f97316";
const ORDERS_COLOR = "#fdba74";

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
 * "Last 8 Days" (daily) or "Last 6 Months" (monthly). Both series come
 * from the real Order collection; cancelled orders are excluded.
 */
export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({
  dailyData,
  monthlyData,
}) => {
  // Re-render the axis in the active store currency when it changes.
  useStoreCurrency();
  const [range, setRange] = useState<RangeKey>("8days");

  if (dailyData === undefined || monthlyData === undefined) {
    return (
      <div className="p-4 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-(--primary-soft) rounded w-40"></div>
          <div className="h-8 bg-(--primary-soft) rounded-lg w-36"></div>
        </div>
        <div className="h-3 bg-(--primary-soft) rounded w-48 mb-5"></div>
        <div className="h-40 bg-(--primary-soft) rounded-xl"></div>
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
      : monthlyData.map((point) => ({
          label: point.month,
          revenue: point.revenue,
          orders: point.orders,
        }));

  return (
    <div className="p-4 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-(--text)">Revenue Analytics</h3>
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
          onChange={(value) => setRange(value as RangeKey)}
          options={[
            { label: "Last 8 Days", value: "8days" },
            { label: "Last 6 Months", value: "6months" },
          ]}
          aria-label="Chart range"
          className="min-w-36"
        />
      </div>

      {/* Legend — mirrors the reference (solid = Revenue, dashed = Order) */}
      <div className="flex items-center gap-5 mt-2 mb-1 text-[11px] font-medium text-(--text-muted)">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-[2.5px] rounded"
            style={{ borderColor: REVENUE_COLOR }}
          />
          Revenue
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-[2.5px] border-dashed rounded"
            style={{ borderColor: ORDERS_COLOR }}
          />
          Order
        </span>
      </div>

      <div className="w-full flex-1 min-h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="rgba(148,163,184,0.22)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              yAxisId="revenue"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={52}
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
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(249,115,22,0.25)" }} />
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
