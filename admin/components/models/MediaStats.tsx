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
 * Label → value rows, the structured detail the Media cards show
 * under their headline instead of a running sentence (Ahsan's
 * order): one row per figure, label on the left in muted text, the
 * figure itself on the right.
 */
function StatRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-2 text-[11px] leading-tight"
        >
          <span className="text-[var(--text-muted)]">{row.label}</span>
          <span className="font-semibold text-[var(--text)]">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The Media page's four summary cards (replacing the generic StatsGrid):
 *  1. library counts by lifecycle status — the total as the headline,
 *     the per-status counts as separate label/count rows under it,
 *  2. storage used across every configured entry as the headline —
 *     the ACCOUNT usage each provider reports (that is what consumes
 *     quota), falling back to library-measured bytes per entry — with
 *     the available / total / accounts figures as label/value rows
 *     under it,
 *  3. the upload destination: the entry uploads currently land on,
 *     with a small dropdown-arrow menu beside its name to switch
 *     between "Auto" (the server-side rotation policy fills one
 *     storage at a time and shifts at 80% of its account quota) and
 *     a pin on one entry; under the name, plain detail lines say
 *     where uploads go and list every entry with its plain status,
 *     sitting directly under the uploads-go-to line (no gap),
 *  4. space per provider — the headline is the TOTAL SPACE BY ALL
 *     PROVIDERS: the combined total capacity summed over every
 *     linked account, each account's total taken per the settled
 *     preference order (the space written in its Settings plan
 *     field when filled, otherwise the total the provider
 *     reports). Under the headline, one block per linked account
 *     showing ONLY the account's name and its total storage (same
 *     preference order; a plain "total not set" note when neither
 *     source has one) — used/available figures live on card 2.
 * Entries that point at the SAME provider account (same Cloudinary
 * cloud name) report one and the same account usage — it is counted
 * ONCE in every total.
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
    // The -mt-3 cancels the extra slot's own top spacing for THIS
    // card only (Ahsan's order): the per-entry status lines sit
    // directly under the "Auto → …" uploads line, with no empty
    // space between them.
    const providersExtra = entries.length ? (
      <div className="-mt-3 flex flex-col gap-0.5">
        {entries.map((entry) => (
          <span key={entry.slug} className="text-[11px] text-[var(--text-muted)]">
            {entry.title} — {entryStatus(entry)}
          </span>
        ))}
      </div>
    ) : undefined;

    // Card 4 — space per provider. The headline is the TOTAL
    // SPACE BY ALL PROVIDERS (Ahsan's words): the combined total
    // capacity summed over every linked account, each account's
    // total taken per the settled preference order — the space
    // written in the entry's Settings plan field when filled,
    // otherwise the total the provider itself reports (below,
    // groupTotal). Like card 2's quota it is all-or-nothing: an
    // account with no total from either source makes the headline
    // "—" rather than a partial sum dressed up as the total (its
    // own block still shows the "total not set" note). Under the
    // headline, one block per linked account showing ONLY the
    // account's name and its total storage (Ahsan's order — the
    // Used/Available rows and the library detail line that used
    // to sit in these blocks are gone; used and available live
    // on card 2). An entry with no total from either source
    // shows the plain "total not set" note beside its name — no
    // number is ever invented. Entries sharing one account show
    // that account's total on each of their blocks, while the
    // headline counts it only once.
    // One account group's total per the preference order: the
    // first Settings plan limit written on any of its entries,
    // else the provider-reported total (Cloudinary credit limit).
    const groupTotal = (group: StorageEntryView[]): number | null => {
      for (const entry of group) {
        const settingsTotal = parsePlanLimitBytes(entry.planStorageLimit);
        if (settingsTotal != null) return settingsTotal;
      }
      const usage = groupUsage(group);
      return usage?.creditsLimit != null ? usage.creditsLimit * GB : null;
    };
    const totalSpace =
      groups.length > 0 && groups.every((group) => groupTotal(group) != null)
        ? groups.reduce((sum, group) => sum + (groupTotal(group) as number), 0)
        : null;
    const legacyBuckets = Object.entries(storage?.providers || {}).filter(
      ([key]) => !entrySlugs.has(key),
    );
    // Every block shows its ACCOUNT's total — the same groupTotal the
    // headline sums (counted once per account). Computing the figure
    // per entry instead let two entries pointing at one account show
    // two different totals for it whenever their Settings plan fields
    // differed, contradicting each other and the headline.
    const groupTotalBySlug = new Map<string, number | null>();
    for (const group of groups) {
      const total = groupTotal(group);
      for (const entry of group) groupTotalBySlug.set(entry.slug, total);
    }
    // The account rows reuse the shared StatRows (Ahsan's order):
    // the account name reads as a normal-weight row label and its
    // total as the row value, with the exact rhythm of cards 1/2.
    const providerBlocks = (
      <StatRows
        rows={[
          ...entries.map((entry) => {
            const total = groupTotalBySlug.get(entry.slug) ?? null;
            return {
              label: entry.title,
              value: total != null ? formatBytes(total) : t("total not set"),
            };
          }),
          ...legacyBuckets.map(([key]) => ({
            label: PROVIDER_LABELS[key] || key,
            value: t("total not set"),
          })),
        ]}
      />
    );
    const hasProviderBlocks = entries.length > 0 || legacyBuckets.length > 0;

    return [
      {
        title: t("Media Library"),
        value: placeholder ?? items.length.toLocaleString(),
        change: "",
        isPositive: true,
        period: "",
        extra: (
          <StatRows
            rows={[
              { label: t("Published"), value: placeholder ?? String(published) },
              { label: t("Draft"), value: placeholder ?? String(draft) },
              { label: t("Archived"), value: placeholder ?? String(archived) },
            ]}
          />
        ),
        icon: ImageIcon,
        theme: "blue",
      },
      {
        title: t("Storage Used"),
        value: placeholder ?? formatBytes(storage ? totalUsed : undefined),
        change: "",
        isPositive: true,
        period: totalQuota != null ? "" : t("Cloudinary usage unavailable"),
        extra:
          totalQuota != null ? (
            <StatRows
              rows={[
                { label: t("Available"), value: formatBytes(totalAvailable) },
                { label: t("Total"), value: formatBytes(totalQuota) },
                { label: t("Accounts"), value: String(groups.length) },
                ...(singleGroup
                  ? [{ label: t("Plan"), value: singlePlan || "Cloudinary" }]
                  : []),
              ]}
            />
          ) : undefined,
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
        value: placeholder ?? formatBytes(storage ? totalSpace : undefined),
        change: "",
        isPositive: true,
        period: "",
        extra: hasProviderBlocks ? providerBlocks : undefined,
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
