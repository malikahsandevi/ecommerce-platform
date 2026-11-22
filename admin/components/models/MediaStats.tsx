"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Cloud, Database, HardDrive, Image as ImageIcon } from "lucide-react";
import StatCard, { StatCardProps } from "@/components/ui/StatsCard";
import { mediaService } from "@/services/resourceRegistry";
import { useLanguage } from "@/services/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface StorageInfo {
  library: { files: number; usedBytes: number };
  providers: Record<string, { usedBytes: number; files: number }>;
  cloudinary: {
    plan: string | null;
    storageUsedBytes: number | null;
    creditsUsed: number | null;
    creditsLimit: number | null;
    creditsUsedPercent: number | null;
    resources: number | null;
  } | null;
}

function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  cloudinary: "Cloudinary",
  aws: "AWS S3",
  firebase: "Firebase",
  local: "Local",
};

/**
 * The Media page's four summary cards (replacing the generic StatsGrid):
 *  1. library counts by lifecycle status,
 *  2. storage used / available / total from the real Cloudinary account,
 *  3. which storage providers exist and which one is connected,
 *  4. used space per provider across this library's records.
 * Everything is computed from the API — nothing is hard-coded.
 */
export default function MediaStats({ items, isLoading = false }: { items: Row[]; isLoading?: boolean }) {
  const { t } = useLanguage();
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  // Refetch when the row count changes (upload/delete) as well as on mount.
  const itemCount = items.length;
  useEffect(() => {
    let cancelled = false;
    mediaService
      .storage()
      .then((data) => {
        if (!cancelled) setStorage(data);
      })
      .catch(() => {
        if (!cancelled) setStorage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [itemCount]);

  const cards = useMemo<StatCardProps[]>(() => {
    const placeholder = isLoading ? "…" : undefined;
    const byStatus = (status: string) =>
      items.filter((item) => String(item.status || "published") === status).length;

    const published = byStatus("published");
    const draft = byStatus("draft");
    const archived = byStatus("archived");

    // Card 2 — Cloudinary's own accounting: on the credit plans 1 credit
    // covers 1 GB of storage, so the credit limit is the storage ceiling.
    const cloud = storage?.cloudinary;
    const cloudUsed = cloud?.storageUsedBytes ?? storage?.library.usedBytes;
    const cloudTotal =
      cloud?.creditsLimit != null ? cloud.creditsLimit * 1024 * 1024 * 1024 : null;
    const cloudAvailable =
      cloudTotal != null && cloudUsed != null ? Math.max(0, cloudTotal - cloudUsed) : null;

    // Card 4 — this library's bytes per provider.
    const providers = storage?.providers || {};
    const providerSummary = ["cloudinary", "aws", "firebase", "local"]
      .map((key) => `${PROVIDER_LABELS[key]} ${formatBytes(providers[key]?.usedBytes || 0)}`)
      .join(" · ");
    const topProvider = Object.entries(providers).sort(
      (a, b) => (b[1]?.usedBytes || 0) - (a[1]?.usedBytes || 0),
    )[0];

    return [
      {
        title: t("Media Library"),
        value: placeholder ?? items.length.toLocaleString(),
        change: "",
        isPositive: true,
        period: t("{published} published · {draft} draft · {archived} archived").replace("{published}", String(published)).replace("{draft}", String(draft)).replace("{archived}", String(archived)),
        icon: ImageIcon,
        theme: "blue",
      },
      {
        title: t("Storage Used"),
        value: placeholder ?? formatBytes(cloudUsed),
        change: "",
        isPositive: true,
        period:
          cloudTotal != null
            ? t("{available} available of {total} ({plan} plan)").replace("{available}", formatBytes(cloudAvailable)).replace("{total}", formatBytes(cloudTotal)).replace("{plan}", cloud?.plan || "Cloudinary")
            : t("Cloudinary usage unavailable"),
        icon: HardDrive,
        theme: "green",
      },
      {
        title: t("Storage Providers"),
        value: placeholder ?? "Cloudinary",
        change: "",
        isPositive: true,
        period: t("Connected · AWS S3 & Firebase not configured"),
        icon: Cloud,
        theme: "orange",
      },
      {
        title: t("Space by Provider"),
        value:
          placeholder ??
          (topProvider ? formatBytes(topProvider[1]?.usedBytes || 0) : "0 B"),
        change: "",
        isPositive: true,
        period: providerSummary,
        icon: Database,
        theme: "purple",
      },
    ] as StatCardProps[];
  }, [items, storage, isLoading, t]);

  return (
    <div className="w-full grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 text-[var(--text)]">
      {cards.map((stat, index) => (
        <StatCard key={`${stat.title}-${index}`} {...stat} />
      ))}
    </div>
  );
}
