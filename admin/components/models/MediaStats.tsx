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
  /** The space written in this entry's Settings plan field
   *  (storageLimit, e.g. "25 GB"; "" when the admin left it empty). */
  planStorageLimit?: string | null;
}

interface StorageInfo {
  library: { files: number; usedBytes: number };
  providers: Record<string, { usedBytes: number; files: number }>;
  entries: StorageEntryView[];
  /** The entry new uploads will actually land on (pin or Auto). */
  uploadTarget: string;
  /** The stored destination choice: "auto" or a pinned entry slug. */
  uploadTargetChoice: string;
  /** A pin is stored but Auto is in effect (its entry is off). */
  uploadTargetFallback: boolean;
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
 * Parse the space written in a Settings plan field ("25 GB",
 * "500 MB", "1 TB", a bare number = GB) into bytes. Returns null
 * when the field is empty or holds no usable size — the caller
 * then falls back to the provider-reported total, and shows a
 * plain "total not set" note when neither exists.
 */
function parsePlanLimitBytes(text?: string | null): number | null {
  if (!text) return null;
  const match = String(text).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|B)?/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (match[2] || "GB").toUpperCase();
  const multiplier =
    unit === "TB" ? GB * 1024 : unit === "GB" ? GB : unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1;
  return value * multiplier;
}

/**
 * The Media page's four summary cards (replacing the generic StatsGrid):
 *  1. library counts by lifecycle status,
 *  2. storage used / available / total across every configured entry —
 *     the ACCOUNT usage each provider reports (that is what consumes
 *     quota), falling back to library-measured bytes per entry,
 *  3. the upload destination: the entry uploads currently land on,
 *     with a small dropdown-arrow menu beside its name to switch
 *     between "Auto" (the server-side rotation policy fills one
 *     storage at a time and shifts at 80% of its account quota) and
 *     a pin on one entry; under the name, plain detail lines say
 *     where uploads go and list every entry with its plain status,
 *  4. space per provider — the same account-usage total as card 2,
 *     broken down per entry: each entry shows its USED space (its
 *     ACCOUNT's usage — the space that provider has actually
 *     consumed), its TOTAL (the space written in the entry's
 *     Settings plan field when filled, otherwise the total the
 *     provider reports) and the AVAILABLE remainder on card 2's
 *     basis, keeping this library's own bytes + file count as the
 *     secondary detail.
 * Entries that point at the SAME provider account (same Cloudinary
 * cloud name) report one and the same account usage — it is counted
 * ONCE in every total, and their lines note the shared account.
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
    // the storage ceiling. An account whose API did not answer
    // contributes its library-measured bytes to the used total, and
    // the quota line only appears when every account reported a quota.
    const accountUsedOf = (entry: StorageEntryView) => entry.usage?.storageUsedBytes ?? null;
    const entrySlugs = new Set(entries.map((entry) => entry.slug));
    const legacyBytes = Object.entries(storage?.providers || {})
      .filter(([key]) => !entrySlugs.has(key))
      .reduce((sum, [, bucket]) => sum + (bucket?.usedBytes || 0), 0);

    // Entries pointing at the SAME provider account (same Cloudinary
    // cloud name) report one and the same account usage — group them
    // so the shared account is counted once in every total below.
    const accountKeyOf = (entry: StorageEntryView) =>
      entry.subService === "cloudinary" && entry.cloudName
        ? `cloudinary:${entry.cloudName}`
        : `entry:${entry.slug}`;
    const accountGroups = new Map<string, StorageEntryView[]>();
    for (const entry of entries) {
      const key = accountKeyOf(entry);
      const group = accountGroups.get(key);
      if (group) group.push(entry);
      else accountGroups.set(key, [entry]);
    }
    const groups = [...accountGroups.values()];
    // The one usage record that speaks for a group (any member's —
    // same account, so the figures are identical).
    const groupUsage = (group: StorageEntryView[]) =>
      group.map((entry) => entry.usage).find((usage) => usage != null) ?? null;
    // A group's contribution to the totals: its account usage when
    // the provider reports it, else the group's library bytes.
    const groupFigure = (group: StorageEntryView[]) =>
      groupUsage(group)?.storageUsedBytes ??
      group.reduce((sum, entry) => sum + (entry.usedBytes || 0), 0);

    const totalUsed = groups.reduce((sum, group) => sum + groupFigure(group), 0) + legacyBytes;
    const quotaKnown =
      groups.length > 0 &&
      groups.every((group) => groupUsage(group)?.creditsLimit != null);
    const totalQuota = quotaKnown
      ? groups.reduce((sum, group) => sum + (groupUsage(group)!.creditsLimit as number) * GB, 0)
      : null;
    // Remaining space is a CREDIT remainder, per Cloudinary's Credit
    // System: Remaining (GB) = credits.limit − credits.usage (1 credit
    // = 1 GB). The credit pool is shared with bandwidth and
    // transformations, so this is deliberately NOT total − storage
    // bytes: storage bytes alone would overstate what is left. The
    // figure only appears when every account reported both numbers.
    const totalAvailable = quotaKnown &&
      groups.every((group) => groupUsage(group)?.creditsUsed != null)
      ? groups.reduce(
          (sum, group) =>
            sum +
            Math.max(
              0,
              (groupUsage(group)!.creditsLimit as number) -
                (groupUsage(group)!.creditsUsed as number),
            ) * GB,
          0,
        )
      : null;
    const singleGroup = groups.length === 1 ? groups[0] : undefined;
    const singlePlan = singleGroup ? groupUsage(singleGroup)?.plan ?? null : null;

    // Card 3 — the upload destination. The value names the entry
    // uploads currently land on. The destination choice is a small
    // dropdown-arrow button beside that name (Ahsan's order — the
    // full select box that used to sit in the card body is gone):
    // the house Select rendered as an arrow-only trigger, opening
    // the same compact menu ("Auto" or a pin on one entry) with the
    // same persistence and semantics as before. The menu shows the
    // choice actually in effect: while a stored pin's entry is
    // switched off, Auto is what decides, so Auto is what the menu
    // marks. Under the name, plain detail in simple words: one line
    // saying where uploads go (or why Auto took over), then every
    // entry with its plain status — Connected / Switched off / not
    // configured — so no information the old period line carried
    // is lost.
    const targetEntry =
      entries.find((entry) => entry.slug === storage?.uploadTarget) || entries[0];
    const providersValue = targetEntry?.title || "Cloudinary";
    const entryStatus = (entry: StorageEntryView) =>
      !entry.configured
        ? t("not configured")
        : entry.isConnected
          ? t("Connected")
          : t("Switched off");
    const choiceRaw = storage?.uploadTargetChoice || "auto";
    const pinEntry =
      choiceRaw !== "auto" ? entries.find((entry) => entry.slug === choiceRaw) : undefined;
    const pinInEffect = Boolean(storage && !storage.uploadTargetFallback && pinEntry);
    const selectValue = pinInEffect ? choiceRaw : "auto";
    const providersPeriod = !entries.length
      ? t("Connected · AWS S3 & Firebase not configured")
      : storage?.uploadTargetFallback && pinEntry
        ? t("{entry} is switched off — uploads are using Auto → {target}")
            .replace("{entry}", pinEntry.title)
            .replace("{target}", targetEntry?.title || "")
        : pinInEffect && pinEntry
          ? t("Uploads go to {entry}").replace("{entry}", pinEntry.title)
          : targetEntry
            ? t("Auto → {entry}").replace("{entry}", targetEntry.title)
            : t("Connected · AWS S3 & Firebase not configured");
    const providersAddon =
      uploadableEntries.length > 1 ? (
        <Select
          value={selectValue}
          options={[
            { label: t("Auto"), value: "auto" },
            ...uploadableEntries.map((entry) => ({ label: entry.title, value: entry.slug })),
          ]}
          onChange={handleTargetChange}
          disabled={targetBusy}
          variant="ghost"
          size="sm"
          triggerLabel=""
          menuWide
          aria-label={t("Upload destination")}
        />
      ) : undefined;
    const providersExtra = entries.length ? (
      <div className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <span key={entry.slug} className="text-[11px] text-[var(--text-muted)]">
            {entry.title} — {entryStatus(entry)}
          </span>
        ))}
      </div>
    ) : undefined;

    // Card 4 — space per provider: the SAME account-usage total as
    // card 2, broken down per entry. Each entry shows three plain
    // numbers (Ahsan's order): USED — its ACCOUNT's usage, the
    // space that provider has actually consumed (an entry whose
    // provider reports no account usage falls back to its library
    // bytes); TOTAL — the space written in the entry's Settings
    // plan field when that is filled, otherwise the total the
    // provider itself reports (Cloudinary: its credit limit);
    // AVAILABLE — the remainder on card 2's basis: on Cloudinary
    // the CREDIT remainder (the total in effect minus the used
    // credit share), never total − storage bytes. An entry with
    // no total from either source shows its used figure with a
    // plain "total not set" note — no number is ever invented.
    // This library's bytes + file count on the entry stay visible
    // as the secondary detail. Entries sharing one account show
    // that account's figures on each of their lines (noted as a
    // shared account), while the headline counts it only once.
    const providerSummary = [
      ...entries.map((entry) => {
        const account = accountUsedOf(entry);
        const usedFigure = account ?? entry.usedBytes;
        const settingsTotal = parsePlanLimitBytes(entry.planStorageLimit);
        const reportedTotal =
          entry.usage?.creditsLimit != null ? entry.usage.creditsLimit * GB : null;
        const total = settingsTotal ?? reportedTotal;
        let available: number | null = null;
        if (total != null) {
          available =
            entry.usage?.creditsUsed != null
              ? Math.max(0, total / GB - entry.usage.creditsUsed) * GB
              : Math.max(0, total - usedFigure);
        }
        const figures =
          total != null
            ? t("{used} used · {available} available · {total} total")
                .replace("{used}", formatBytes(usedFigure))
                .replace("{available}", formatBytes(available))
                .replace("{total}", formatBytes(total))
            : t("{used} used · total not set").replace("{used}", formatBytes(usedFigure));
        const detail = [
          `${t("library")} ${formatBytes(entry.usedBytes)}`,
          `${entry.files} ${t("files")}`,
        ];
        if ((accountGroups.get(accountKeyOf(entry))?.length || 0) > 1) {
          detail.push(t("shared account"));
        }
        return `${entry.title} ${figures} (${detail.join(" · ")})`;
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
            ? groups.length <= 1
              ? t("{available} available of {total} ({plan} plan)").replace("{available}", formatBytes(totalAvailable)).replace("{total}", formatBytes(totalQuota)).replace("{plan}", singlePlan || "Cloudinary")
              : `${formatBytes(totalAvailable)} ${t("available of")} ${formatBytes(totalQuota)} (${groups.length} ${t("storage accounts")})`
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
        extra: providersExtra,
        valueAddon: providersAddon,
      },
      {
        title: t("Space by Provider"),
        value: placeholder ?? formatBytes(storage ? totalUsed : undefined),
        change: "",
        isPositive: true,
        period: providerSummary,
        icon: Database,
        theme: "purple",
      },
    ] as StatCardProps[];
  }, [items, storage, entries, uploadableEntries, targetBusy, handleTargetChange, isLoading, t]);

  return (
    <div className="w-full">
      <div className="w-full grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 text-[var(--text)]">
        {cards.map((stat, index) => (
          <StatCard key={`${stat.title}-${index}`} {...stat} />
        ))}
      </div>
    </div>
  );
}
