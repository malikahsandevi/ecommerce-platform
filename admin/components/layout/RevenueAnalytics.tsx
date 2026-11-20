"use client";

import React, { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";

export interface RevenuePoint {
  month: string;
  revenue: number;
  orders: number;
}

interface RevenueAnalyticsProps {
  /** Undefined while the dashboard request is still in flight. */
  data?: RevenuePoint[];
}

type ChartMode = "revenue" | "orders";

const ACCENT = "#f97416";

const tooltipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  backgroundColor: "var(--background)",
  color: "var(--text)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
};

export const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({ data }) => {
  const [mode, setMode] = useState<ChartMode>("revenue");

  if (data === undefined) {
    return (
      <div className="p-5 w-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-(--primary-soft) rounded w-40"></div>
          <div className="h-7 bg-(--primary-soft) rounded-full w-36"></div>
        </div>
        <div className="h-3 bg-(--primary-soft) rounded w-56 mb-5"></div>
        <div className="h-56 bg-(--primary-soft) rounded-xl"></div>
      </div>
    );
  }

  const totalRevenue = data.reduce((sum, point) => sum + point.revenue, 0);
  const totalOrders = data.reduce((sum, point) => sum + point.orders, 0);

  const toggleButton = (value: ChartMode, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
        mode === value
          ? "bg-(--primary) text-white shadow-sm"
          : "text-(--text-muted) hover:text-(--text)"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-5 w-full bg-(--background) rounded-2xl shadow-sm border border-(--border)">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-base font-bold text-(--text) flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </span>
          Revenue Analytics
        </h3>
        <div className="flex items-center gap-1 rounded-full bg-(--surface-muted) p-1">
          {toggleButton("revenue", "Revenue")}
          {toggleButton("orders", "Orders")}
        </div>
      </div>
      <p className="text-[11px] text-(--text-muted) mb-4">
        Last 6 months ·{" "}
        <span className="font-semibold text-(--text)">
          ${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>{" "}
        revenue ·{" "}
        <span className="font-semibold text-(--text)">
          {totalOrders.toLocaleString()}
        </span>{" "}
        orders (cancelled orders excluded)
      </p>

      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "revenue" ? (
            <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(value: number) =>
                  `$${Number(value).toLocaleString()}`
                }
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [
                  `$${Number(value ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}`,
                  "Revenue",
                ]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={ACCENT}
                strokeWidth={2}
                fill="url(#revenueFill)"
                dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={56}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [Number(value ?? 0).toLocaleString(), "Orders"]}
              />
              <Bar dataKey="orders" fill={ACCENT} radius={[6, 6, 0, 0]} maxBarSize={44} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueAnalytics;
