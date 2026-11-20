import React from "react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Ellipsis } from "lucide-react";

export interface MonthlyTargetData {
  target: number;
  revenueThisMonth: number;
  percentage: number | null;
  vsLastMonthPct: number | null;
}

interface MonthlyTargetCardProps {
  /** Undefined while the dashboard request is still in flight. */
  data?: MonthlyTargetData;
}

const ACCENT = "#f97316";

const fmtMoney = (value: number) =>
  `$${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;

/**
 * Monthly Target gauge in the EzMart reference style. The target is a
 * real number the admin sets in Settings (general.monthlyTarget); the
 * gauge compares it with this month's real, non-cancelled order revenue.
 * With no target set the card says so instead of inventing a percentage.
 */
export const MonthlyTargetCard: React.FC<MonthlyTargetCardProps> = ({ data }) => {
  if (data === undefined) {
    return (
      <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse flex flex-col">
        <div className="h-5 bg-(--primary-soft) rounded w-32 mb-4"></div>
        <div className="mx-auto w-44 h-24 bg-(--primary-soft) rounded-t-full"></div>
        <div className="h-3 bg-(--primary-soft) rounded w-40 mx-auto mt-5"></div>
        <div className="h-14 bg-(--primary-soft) rounded-xl mt-5"></div>
      </div>
    );
  }

  const hasTarget = data.target > 0 && data.percentage !== null;
  const pct =
    data.percentage === null
      ? 0
      : Math.max(0, Math.min(100, data.percentage));
  const gaugeData = [
    { name: "achieved", value: pct },
    { name: "remaining", value: 100 - pct },
  ];
  const remaining = Math.max(0, data.target - data.revenueThisMonth);

  const encouragement = !hasTarget
    ? null
    : pct >= 100
      ? { title: "Target Achieved 🎉", body: "This month's revenue passed the goal — every extra order is a bonus." }
      : pct >= 75
        ? { title: "Great Progress! 🎉", body: `Only ${fmtMoney(remaining)} left to reach 100% this month.` }
        : pct >= 40
          ? { title: "Good Going", body: `${fmtMoney(remaining)} to go — keep pushing to reach the target.` }
          : { title: "Getting Started", body: `${fmtMoney(remaining)} to go this month — new orders will move the gauge.` };

  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-(--text)">Monthly Target</h3>
        <Ellipsis className="w-5 h-5 text-(--text-muted)" />
      </div>

      {/* Semicircle gauge */}
      <div className="relative w-full max-w-60 mx-auto mt-1">
        <ResponsiveContainer width="100%" height={128}>
          <PieChart>
            <Pie
              data={gaugeData}
              dataKey="value"
              startAngle={180}
              endAngle={0}
              innerRadius={64}
              outerRadius={86}
              paddingAngle={0}
              cornerRadius={8}
              strokeWidth={0}
            >
              <Cell fill={ACCENT} />
              <Cell fill="var(--primary-light)" fillOpacity={0.45} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-[28px] leading-8 font-bold text-(--text)">
            {hasTarget ? `${pct % 1 ? pct.toFixed(1) : pct}%` : "—"}
          </span>
          {data.vsLastMonthPct !== null && (
            <span
              className={`text-[11px] font-semibold ${
                data.vsLastMonthPct >= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {data.vsLastMonthPct >= 0 ? "+" : ""}
              {data.vsLastMonthPct.toFixed(2)}%{" "}
              <span className="text-(--text-muted) font-medium">from last month</span>
            </span>
          )}
        </div>
      </div>

      {/* Encouragement / hint */}
      <div className="text-center mt-3 flex-1">
        {encouragement ? (
          <>
            <p className="text-[13px] font-bold text-(--text)">{encouragement.title}</p>
            <p className="text-[11px] text-(--text-muted) mt-1 leading-relaxed">
              {encouragement.body}
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-bold text-(--text)">No target set</p>
            <p className="text-[11px] text-(--text-muted) mt-1 leading-relaxed">
              Set a monthly target in{" "}
              <Link href="/setting" className="font-semibold text-(--primary) hover:text-(--primary-dark)">
                Settings
              </Link>{" "}
              to track this month&apos;s revenue goal here.
            </p>
          </>
        )}
      </div>

      {/* Target | Revenue boxes */}
      <div className="mt-4 grid grid-cols-2 rounded-xl overflow-hidden bg-(--primary-soft)">
        <div className="py-3 text-center border-r border-(--background)">
          <p className="text-[11px] font-medium text-(--text-muted)">Target</p>
          <p className="text-sm font-bold text-(--text) mt-0.5">
            {hasTarget ? fmtMoney(data.target) : "Not set"}
          </p>
        </div>
        <div className="py-3 text-center">
          <p className="text-[11px] font-medium text-(--text-muted)">Revenue</p>
          <p className="text-sm font-bold text-(--text) mt-0.5">
            {fmtMoney(data.revenueThisMonth)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MonthlyTargetCard;
