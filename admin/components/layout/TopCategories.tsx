import React from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { FolderTree } from "lucide-react";
import { formatMoney, useStoreCurrency } from "@/services/currency";

export interface CategoryItem {
  name: string;
  // Donut segment size: the category's revenue share, or — while the
  // store has no sales yet — its product-count share.
  value: number;
  // Prominent legend figure: the category's sales ("$X").
  formattedValue: string;
  // Smaller muted legend line: the category's product count.
  detailValue: string;
  color: string;
}

interface TopCategoriesProps {
  categoriesData?: CategoryItem[];
  // Store-wide sales across ALL categories (donut centre figure).
  totalSales?: number;
  loading?: boolean;
}

export const TopCategories: React.FC<TopCategoriesProps> = ({ categoriesData, totalSales, loading = false }) => {
  // Subscribe so the centre figure re-renders in the active currency.
  useStoreCurrency();
  if (loading) {
    return (
      <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm flex flex-col border border-(--border) animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-(--primary-soft) rounded w-28"></div>
          <div className="h-4 bg-(--primary-soft) rounded w-12"></div>
        </div>
        <div className="relative w-full h-48 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border-8 border-(--primary-soft)"></div>
        </div>
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((_, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="h-3 bg-(--primary-soft) rounded w-24"></div>
              <div className="h-3 bg-(--primary-soft) rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const items = categoriesData || [];
  const totalValue = items.reduce((acc, item) => acc + item.value, 0);
  const formattedTotalSales = formatMoney(totalSales || 0);

  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm flex flex-col border border-(--border)">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-(--text)">Top Categories</h3>
        <Link
          href="/categories"
          className="text-xs font-semibold text-(--primary) hover:text-(--primary-dark) transition-colors"
        >
          See All
        </Link>
      </div>

      {items.length === 0 || totalValue === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <FolderTree className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">No category data yet</p>
          <p className="text-[11px] text-(--text-muted) max-w-55">
            Add categories and products, and the categories generating the
            most sales will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Donut Chart — share of sales per category. The wrapper is
              sized to the donut itself (outerRadius 94 → 188px across),
              so there is no slack above or below the graphic. */}
          <div className="relative w-full h-48 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={items}
                  cx="50%"
                  cy="50%"
                  innerRadius={74}
                  outerRadius={94}
                  paddingAngle={2}
                  cornerRadius={4}
                  dataKey="value"
                >
                  {items.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] font-medium text-(--text-muted)">
                Total Sales
              </span>
              <span className="text-xl font-bold text-(--text)">
                {formattedTotalSales}
              </span>
            </div>
          </div>

          {/* Categories Legend List — rows sit tight (no gaps between
              them) and the first row sits directly under the donut. */}
          <div className="space-y-0">
            {items.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium text-(--text-muted) truncate">
                    {item.name}
                  </span>
                </div>
                <span className="shrink-0 ml-2 text-right">
                  <span className="block font-semibold text-(--text)">
                    {item.formattedValue}
                  </span>
                  <span className="block text-[10px] text-(--text-muted)">
                    {item.detailValue}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TopCategories;
