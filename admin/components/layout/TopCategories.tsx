import React from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { FolderTree } from "lucide-react";

export interface CategoryItem {
  name: string;
  value: number;
  formattedValue: string;
  color: string;
}

interface TopCategoriesProps {
  categoriesData?: CategoryItem[];
  loading?: boolean;
}

export const TopCategories: React.FC<TopCategoriesProps> = ({ categoriesData, loading = false }) => {
  if (loading) {
    return (
      <div className="p-5 w-full bg-(--background) rounded-2xl shadow-sm flex flex-col h-full border border-(--border) animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 bg-(--primary-soft) rounded w-28"></div>
          <div className="h-4 bg-(--primary-soft) rounded w-12"></div>
        </div>
        <div className="relative w-full h-40 flex items-center justify-center">
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
  const totalProducts = items.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="p-5 w-full bg-(--background) rounded-2xl shadow-sm flex flex-col h-full border border-(--border)">
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

      {items.length === 0 || totalProducts === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <FolderTree className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">No category data yet</p>
          <p className="text-[11px] text-(--text-muted) max-w-55">
            Add categories and products, and the product share per category will
            appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Donut Chart — share of products per category */}
          <div className="relative w-full h-56 flex items-center justify-center">
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
                Total Products
              </span>
              <span className="text-xl font-bold text-(--text)">
                {totalProducts.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Categories Legend List */}
          <div className="mt-4 space-y-3">
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
                <span className="font-semibold text-(--text) shrink-0 ml-2">
                  {item.formattedValue}
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
