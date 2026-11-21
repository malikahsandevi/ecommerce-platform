import React from "react";
import Link from "next/link";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
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
        <div className="mx-auto w-44 h-20 bg-(--primary-soft) rounded-t-full"></div>
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
  const chartData = [{ value: pct }];
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

      {/* Semicircle gauge — geometry ported from the original design's
          MonthlyTargetCard: the chart lives in a tall (h-35) box whose
          lower half is clipped by the short overflow-hidden wrapper, so
          the arc sits DOWN in the card with the percentage under its
          centre. The previous PieChart version centred the full circle
          in a 128px box, which floated the arc at the top of the card
          with dead space underneath it. */}
      <div className="relative w-full h-20 md:h-22 flex items-center justify-center overflow-hidden mt-1">
        <div className="absolute top-0 w-full h-35">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="75%"
              outerRadius="100%"
              data={chartData}
              startAngle={180}
              endAngle={0}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                angleAxisId={0}
                tick={false}
              />
              <RadialBar
                background={{ fill: "var(--primary-light)" }}
                dataKey="value"
                cornerRadius={4}
                fill="var(--primary)"
              />
            </RadialBarChart>
          </ResponsiveContainer>

          {/* Centre text under the arc */}
          <div className="absolute top-[28%] lg:top-[33%] md:top-[28%] left-1/2 -translate-x-1/2 flex flex-col items-center text-center">
            <span className="text-[28px] leading-8 font-bold text-(--text)">
              {hasTarget ? `${pct % 1 ? pct.toFixed(1) : pct}%` : "—"}
            </span>
            {data.vsLastMonthPct !== null && (
              <span
                className={`text-[11px] font-semibold whitespace-nowrap ${
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
      </div>

      {/* Encouragement / hint — no flex-1 here: when the dashboard
          grid stretches this card to the row height, flex-1 used to
          absorb the extra space and push the Target/Revenue strip to
          the bottom, leaving a dead gap under this text. The strip
          must follow the text with its normal mt-4 spacing. */}
      <div className="text-center mt-3">
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
