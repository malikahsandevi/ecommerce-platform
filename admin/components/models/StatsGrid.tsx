"use client";

import React, { useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  FolderTree,
  Image as ImageIcon,
  LucideIcon,
  Package,
  ShoppingBag,
  Star,
  Tag,
  Ticket,
  Users,
} from "lucide-react";
import StatCard, { CardTheme, StatCardProps } from "@/components/ui/StatsCard";
import { useLanguage } from "@/services/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatRow = Record<string, any>;

interface PageStatConfig {
  /** Statuses that count as "live" for this resource. */
  liveStatuses: string[];
  liveLabel: string;
  /** Statuses that count as "awaiting action". */
  pendingStatuses: string[];
  pendingLabel: string;
  /** Optional numeric field to total up, plus how to label it. */
  amountField?: string;
  amountLabel?: string;
  icon: LucideIcon;
}

// One entry per route. Anything not listed falls back to the generic total.
const PAGE_STATS: Record<string, PageStatConfig> = {
  products: {
    liveStatuses: ["published", "active"],
    liveLabel: "Published",
    pendingStatuses: ["pending_review", "draft"],
    pendingLabel: "Awaiting Review",
    amountField: "price",
    amountLabel: "Catalog Value",
    icon: Package,
  },
  customers: {
    liveStatuses: ["active"],
    liveLabel: "Active",
    pendingStatuses: ["inactive"],
    pendingLabel: "Inactive",
    icon: Users,
  },
  orders: {
    liveStatuses: ["delivered"],
    liveLabel: "Delivered",
    pendingStatuses: ["pending", "processing"],
    pendingLabel: "In Progress",
    amountField: "total",
    amountLabel: "Order Value",
    icon: ShoppingBag,
  },
  categories: {
    liveStatuses: ["active"],
    liveLabel: "Active",
    pendingStatuses: ["inactive"],
    pendingLabel: "Inactive",
    icon: FolderTree,
  },
  coupons: {
    liveStatuses: ["active"],
    liveLabel: "Active",
    pendingStatuses: ["expired", "disabled"],
    pendingLabel: "Expired / Disabled",
    amountField: "discountValue",
    amountLabel: "Total Discount Value",
    icon: Ticket,
  },
  reviews: {
    liveStatuses: ["approved"],
    liveLabel: "Approved",
    pendingStatuses: ["pending"],
    pendingLabel: "Awaiting Moderation",
    icon: Star,
  },
  media: {
    liveStatuses: ["active"],
    liveLabel: "Active",
    pendingStatuses: ["inactive"],
    pendingLabel: "Inactive",
    icon: ImageIcon,
  },
  brands: {
    liveStatuses: ["active"],
    liveLabel: "Active",
    pendingStatuses: ["inactive"],
    pendingLabel: "Inactive",
    icon: Tag,
  },
};

const DEFAULT_STAT_CONFIG: PageStatConfig = {
  liveStatuses: ["active", "published"],
  liveLabel: "Active",
  pendingStatuses: ["pending", "draft", "inactive"],
  pendingLabel: "Pending",
  icon: CheckCircle2,
};

function readNested(row: StatRow, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") {
      return (current as StatRow)[key];
    }
    return undefined;
  }, row);
}

function normaliseStatus(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "_");
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export interface StatsGridProps {
  pageUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items?: Record<string, any>[];
  isLoading?: boolean;
}

/** Renders four live counters derived from the records the page has loaded. */
export default function StatsGrid({ pageUrl, items = [], isLoading = false }: StatsGridProps) {
  const { t } = useLanguage();
  const statCards = useMemo<StatCardProps[]>(() => {
    const config = PAGE_STATS[pageUrl] || DEFAULT_STAT_CONFIG;
    const total = items.length;

    const liveCount = items.filter((item) =>
      config.liveStatuses.includes(normaliseStatus(item.status)),
    ).length;

    const pendingCount = items.filter((item) =>
      config.pendingStatuses.includes(normaliseStatus(item.status)),
    ).length;

    let amountValue = 0;
    if (config.amountField) {
      amountValue = items.reduce((sum, item) => {
        const raw = readNested(item, config.amountField as string);
        const parsed = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(parsed) ? sum + parsed : sum;
      }, 0);
    }

    const placeholder = isLoading ? "…" : undefined;

    const resourceName = `${pageUrl.charAt(0).toUpperCase()}${pageUrl.slice(1)}`;
    const cards: StatCardProps[] = [
      {
        title: t("Total {name}").replace("{name}", t(resourceName)),
        value: placeholder ?? total.toLocaleString(),
        change: "",
        isPositive: true,
        period: t("All records"),
        icon: config.icon,
        theme: "blue",
      },
      {
        title: t(config.liveLabel),
        value: placeholder ?? liveCount.toLocaleString(),
        change: "",
        isPositive: true,
        period: t("{percent}% of total").replace(
          "{percent}",
          String(total ? Math.round((liveCount / total) * 100) : 0),
        ),
        icon: CheckCircle2,
        theme: "green",
      },
      {
        title: t(config.pendingLabel),
        value: placeholder ?? pendingCount.toLocaleString(),
        change: "",
        isPositive: pendingCount === 0,
        period: t("Needs attention"),
        icon: Clock,
        theme: "orange",
      },
    ];

    if (config.amountField) {
      cards.push({
        title: t(config.amountLabel || "Total Value"),
        value: placeholder ?? formatAmount(amountValue),
        change: "",
        isPositive: true,
        period: t("Sum of loaded records"),
        icon: DollarSign,
        theme: "purple",
      });
    } else {
      cards.push({
        title: t("Other Statuses"),
        value: placeholder ?? Math.max(0, total - liveCount - pendingCount).toLocaleString(),
        change: "",
        isPositive: true,
        period: t("Remaining statuses"),
        icon: Clock,
        theme: "purple",
      });
    }

    return cards;
  }, [pageUrl, items, isLoading, t]);

  return (
    <div className="w-full grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 text-[var(--text)]">
      {statCards.map((stat, index) => (
        <StatCard key={`${stat.title}-${index}`} {...(stat as StatCardProps & { theme?: CardTheme })} />
      ))}
    </div>
  );
}
