import React from "react";
import { PackageSearch } from "lucide-react";

export interface InventoryData {
  total: number;
  published: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

interface InventoryOverviewCardProps {
  /** Undefined while the dashboard request is still in flight. */
  data?: InventoryData;
}

const BAR_COLORS = ["#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c"];

/**
 * Occupies the reference design's "Conversion Rate" slot — a descending
 * bar strip, but every column is a real catalog count: total products,
 * published, in stock, low stock (at/under each product's threshold) and
 * out of stock. Bar heights are each count's share of the catalog.
 */
export const InventoryOverviewCard: React.FC<InventoryOverviewCardProps> = ({ data }) => {
  if (data === undefined) {
    return (
      <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse">
        <div className="h-5 bg-(--primary-soft) rounded w-40 mb-6"></div>
        <div className="flex items-end gap-3 h-36">
          {[90, 70, 55, 35, 18].map((height, index) => (
            <div
              key={index}
              className="flex-1 bg-(--primary-soft) rounded-t-lg"
              style={{ height: `${height}%` }}
            ></div>
          ))}
        </div>
      </div>
    );
  }

  const stages = [
    { label: "Total Products", value: data.total },
    { label: "Published", value: data.published },
    { label: "In Stock", value: data.inStock },
    { label: "Low Stock", value: data.lowStock },
    { label: "Out of Stock", value: data.outOfStock },
  ];
  const share = (value: number) =>
    data.total > 0 ? Math.round((value / data.total) * 100) : 0;

  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-(--text)">Inventory Overview</h3>
        <span className="text-[11px] font-medium text-(--text-muted)">
          Live catalog counts
        </span>
      </div>

      {data.total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <PackageSearch className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">No products yet</p>
          <p className="text-[11px] text-(--text-muted) max-w-60">
            Add products to the catalog and their stock breakdown will appear
            here.
          </p>
        </div>
      ) : (
        <div className="flex items-stretch gap-2 sm:gap-3 mt-4 flex-1">
          {stages.map((stage, index) => (
            <div key={stage.label} className="flex-1 min-w-0 flex flex-col">
              <p className="text-[11px] font-medium text-(--text-muted) leading-tight min-h-7">
                {stage.label}
              </p>
              <p className="text-xl sm:text-2xl font-bold text-(--text) mt-1">
                {stage.value.toLocaleString()}
              </p>
              <p className="text-[10px] font-semibold text-(--primary-dark) mt-0.5">
                {index === 0 ? "catalog" : `${share(stage.value)}% of catalog`}
              </p>
              <div className="flex-1 flex items-end mt-3 min-h-16">
                <div
                  className="w-full rounded-t-lg transition-all"
                  style={{
                    height: `${Math.max(share(stage.value), stage.value > 0 ? 5 : 0)}%`,
                    backgroundColor: BAR_COLORS[index],
                    minHeight: stage.value > 0 ? 6 : 0,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InventoryOverviewCard;
