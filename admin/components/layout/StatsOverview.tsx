import React from "react";
import StatCard, { StatCardProps } from "@/components/ui/StatsCard";
import { DollarSign, ShoppingBag, Users } from "lucide-react";

interface StatsOverviewProps {
  statsData?: StatCardProps[];
}

const StatsOverview: React.FC<StatsOverviewProps> = ({ statsData }) => {
  const iconsMap = [DollarSign, ShoppingBag, Users];

  // While data has not arrived yet, show skeletons in the same grid shape.
  if (!statsData || statsData.length === 0) {
    return (
      <div className="w-full grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((_, index) => (
          <div key={index} className="bg-(--background) p-4 rounded-2xl border border-(--border) w-full animate-pulse h-24 flex flex-col justify-between">
            <div className="h-3 bg-(--primary-soft) rounded w-1/2"></div>
            <div className="h-6 bg-(--primary-soft) rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {statsData.map((stat, index) => (
        <StatCard
          key={index}
          {...stat}
          icon={stat.icon || iconsMap[index % iconsMap.length]}
        />
      ))}
    </div>
  );
};

export default StatsOverview;