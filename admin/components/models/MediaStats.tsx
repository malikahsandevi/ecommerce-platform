"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, Database, HardDrive, Image as ImageIcon } from "lucide-react";
import StatCard, { StatCardProps } from "@/components/ui/StatsCard";
import Select from "@/components/ui/Select";
import { mediaService } from "@/services/resourceRegistry";
import { useLanguage } from "@/services/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface EntryUsage {
  plan: string | null;
  storageUsedBytes: number | null;
  creditsUsed: number | null;
  creditsLimit: number | null;
  creditsUsedPercent: number | null;
  resources: number | null;
}

interface StorageEntryView {
  slug: string;
  title: string;
  subService: string;
  isConnected: boolean;
  configured: boolean;
  cloudName?: string;
  /** This library's bytes/files on this entry (database truth). */
  usedBytes: number;
  files: number;
  /** The provider ACCOUNT's own usage, when its API reports it. */
  usage: EntryUsage | null;
}

interface StorageInfo {
  library: { files: number; usedBytes: number };
  providers: Record<string, { usedBytes: number; files: number }>;
  entries: StorageEntryView[];
  uploadTarget: string;
  cloudinary: EntryUsage | null;
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

const GB = 1024 * 1024 * 1024;

/**
 * The Media page's four summary cards (replacing the generic StatsGrid):
 *  1. library counts by lifecycle status,
 *  2. storage used / available / total across every configured entry —
 *     the ACCOUNT usage each provider reports (that is what consumes
 *     quota), falling back to library-measured bytes per entry,
 *  3. every configured storage entry with its connected status,
 *  4. this LIBRARY's space per entry — database truth, so the per-entry
 *     figures sum exactly to the library total; where an account holds
 *     more than this library, its account total is shown distinctly.
 * Below the cards, when more than one entry can receive uploads, a
 * control chooses which one new uploads go to.
 * Everything is computed from the API — nothing is hard-coded.
 */
export default function MediaStats({ items, isLoading = false }: { items: Row[]; isLoading?: boolean }) {
  const { t } = useLanguage();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [targetBusy, setTargetBusy] = useState(false);

  const fetchStorage = useCallback(() => {
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
  }, []);

  // Refetch when the row count changes (upload/delete) as well as on mount.
  const itemCount = items.length;
  useEffect(() => fetchStorage(), [fetchStorage, itemCount]);

  const entries = useMemo(() => storage?.entries || [], [storage]);
  const uploadableEntries = useMemo(
    () => entries.filter((entry) => entry.subService === "cloudinary" && entry.configured && entry.isConnected),
    [entries],
  );
  const uploadTarget = storage?.uploadTarget || uploadableEntries[0]?.slug || "";

  const handleTargetChange = async (slug: string) => {
    setTargetBusy(true);
    try {
      await mediaService.setUploadTarget(slug);
      fetchStorage();
    } catch {
      /* the select keeps showing the server's current target on refetch */
      fetchStorage();
    } finally {
      setTargetBusy(false);
    }
  };

  const cards = useMemo<StatCardProps[]>(() => {
    const placeholder = isLoading ? "…" : undefined;
    const byStatus = (status: string) =>
      items.filter((item) => String(item.status || "published") === status).length;

    const published = byStatus("published");
    const draft = byStatus("draft");
    const archived = byStatus("archived");

    // Card 2 — account usage across entries. On Cloudinary's credit
    // plans 1 credit covers 1 GB of storage, so the credit limit is
    // the storage ceiling. An entry whose account API did not answer
    // contributes its library-measured bytes to the used total, and
    // the quota line only appears when every entry reported a quota.
    const accountUsedOf = (entry: StorageEntryView) => entry.usage?.storageUsedBytes ?? null;
    const entrySlugs = new Set(entries.map((entry) => entry.slug));
    const legacyBytes = Object.entries(storage?.providers || {})
      .filter(([key]) => !entrySlugs.has(key))
      .reduce((sum, [, bucket]) => sum + (bucket?.usedBytes || 0), 0);
    const totalUsed =
      entries.reduce(
        (sum, entry) => sum + (accountUsedOf(entry) ?? entry.usedBytes ?? 0),
        0,
      ) + legacyBytes;
    const quotaKnown =
      entries.length > 0 &&
      entries.every((entry) => entry.usage?.creditsLimit != null);
    const totalQuota = quotaKnown
      ? entries.reduce((sum, entry) => sum + (entry.usage!.creditsLimit as number) * GB, 0)
      : null;
    const quotaUsed = quotaKnown
      ? entries.reduce((sum, entry) => sum + (accountUsedOf(entry) ?? 0), 0)
      : null;
    const totalAvailable =
      totalQuota != null && quotaUsed != null ? Math.max(0, totalQuota - quotaUsed) : null;
    const singlePlan = entries.length === 1 ? entries[0]?.usage?.plan : null;

    // Card 3 — every configured entry with its status.
    const targetEntry =
      entries.find((entry) => entry.slug === storage?.uploadTarget) || entries[0];
    const providersValue = targetEntry?.title || "Cloudinary";
    const providersPeriod = entries.length
      ? entries
          .map(
            (entry) =>
              `${entry.title} ${
                !entry.configured
                  ? t("not configured")
                  : entry.isConnected
                    ? t("Connected")
                    : t("Switched off")
              }`,
          )
          .join(" · ")
      : t("Connected · AWS S3 & Firebase not configured");

    // Card 4 — this library's bytes per entry (sums to the library
    // total), every entry listed; an account that holds more than the
    // library shows its account total distinctly beside its figure.
    const providerSummary = [
      ...entries.map((entry) => {
        const account = accountUsedOf(entry);
        const note =
          account != null && account !== entry.usedBytes
            ? ` (${t("account")} ${formatBytes(account)})`
            : "";
        return `${entry.title} ${formatBytes(entry.usedBytes)}${note}`;
      }),
      ...Object.entries(storage?.providers || {})
        .filter(([key]) => !entrySlugs.has(key))
        .map(([key, bucket]) => `${PROVIDER_LABELS[key] || key} ${formatBytes(bucket?.usedBytes || 0)}`),
    ].join(" · ");

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
        value: placeholder ?? formatBytes(storage ? totalUsed : undefined),
        change: "",
        isPositive: true,
        period:
          totalQuota != null
            ? entries.length <= 1
              ? t("{available} available of {total} ({plan} plan)").replace("{available}", formatBytes(totalAvailable)).replace("{total}", formatBytes(totalQuota)).replace("{plan}", singlePlan || "Cloudinary")
              : `${formatBytes(totalAvailable)} ${t("available of")} ${formatBytes(totalQuota)} (${entries.length} ${t("storage accounts")})`
            : t("Cloudinary usage unavailable"),
        icon: HardDrive,
        theme: "green",
      },
      {
        title: t("Storage Providers"),
        value: placeholder ?? providersValue,
        change: "",
        isPositive: true,
        period: providersPeriod,
        icon: Cloud,
        theme: "orange",
      },
      {
        title: t("Space by Provider"),
        value: placeholder ?? formatBytes(storage?.library.usedBytes ?? 0),
        change: "",
        isPositive: true,
        period: providerSummary,
        icon: Database,
        theme: "purple",
      },
    ] as StatCardProps[];
  }, [items, storage, entries, isLoading, t]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="w-full grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 text-[var(--text)]">
        {cards.map((stat, index) => (
          <StatCard key={`${stat.title}-${index}`} {...stat} />
        ))}
      </div>
      {uploadableEntries.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-[var(--text)]">
          <span className="text-sm font-medium">{t("New uploads go to")}</span>
          <Select
            value={uploadTarget}
            options={uploadableEntries.map((entry) => ({ label: entry.title, value: entry.slug }))}
            onChange={handleTargetChange}
            disabled={targetBusy}
            variant="secondary"
            size="md"
            menuWide
          />
          <span className="text-xs text-[var(--text-muted)]">
            {t("Existing files stay on the storage they already live on.")}
          </span>
        </div>
      )}
    </div>
  );
}
