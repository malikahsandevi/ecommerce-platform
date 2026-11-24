"use client";

import { useRef, useState } from "react";
import { Download, FileJson, LoaderCircle, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import { SettingsCard } from "./SettingsControls";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { securityCheckDialog } from "@/components/ui/SecurityCheckDialog";
import { settingsService } from "@/services/settingsService";
import type { BackupRestoreCounts } from "@/services/settingsService";
import { extractApiError, sanitizeApiMessage } from "@/services/api";
import { toast } from "@/components/ui/Toast";
import { useLanguage } from "@/services/i18n";

// ── Backup & Recovery ───────────────────────────────────────────────
// Super-Admin-only (the switch in SettingsPanels renders the lock
// notice for every other role, and the API refuses them anyway): a
// backup is ONE downloadable file holding the whole store — settings
// with every integration's stored configuration, roles & permissions,
// and every business collection. Restoring REPLACES the current data
// with the file's contents. Both operations are Settings saves under
// the Lock: each runs the per-save security check, and the API
// re-verifies the password server-side before generating or writing
// anything. Passwords and two-factor secrets are NEVER in the file —
// accounts travel as records only (see the restore card's copy).

const COUNT_LABELS: Array<[keyof BackupRestoreCounts, string]> = [
  ["settings", "Settings"],
  ["rolePermissions", "Roles & Permissions"],
  ["products", "Products"],
  ["categories", "Categories"],
  ["brands", "Brands"],
  ["coupons", "Coupons"],
  ["orders", "Orders"],
  ["users", "Users"],
  ["reviews", "Reviews"],
  ["media", "Media"],
];

interface LoadedBackup {
  fileName: string;
  createdAt?: string;
  storeName?: string;
  counts: Partial<BackupRestoreCounts>;
  /** The parsed file, sent back to the API on restore. */
  payload: unknown;
}

/** Reads an API error that arrived as a Blob (responseType "blob"
 *  turns even a 403 JSON body into one) back into the API's own
 *  message — the same handling the Data Export download uses. */
async function blobErrorMessage(error: unknown): Promise<string> {
  let message = extractApiError(error);
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) message = sanitizeApiMessage(parsed.message);
    } catch {
      /* keep the generic message */
    }
  }
  return message;
}

function countRows(counts: Partial<BackupRestoreCounts>) {
  return COUNT_LABELS.filter(([key]) => typeof counts[key] === "number");
}

export default function BackupPanel({ timeZone }: { timeZone?: string }) {
  const { t } = useLanguage();
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loaded, setLoaded] = useState<LoadedBackup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCreatedAt = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  };

  const createBackup = async () => {
    // Settings Lock: creating a backup is a Settings save — verify
    // first; a cancel creates nothing. The API re-verifies the
    // password server-side before the file is generated, so a wrong
    // password can never leak it.
    const securityPassword = await securityCheckDialog({
      message: t("Enter your own account password to create a backup."),
      confirmLabel: t("Verify & Create"),
    });
    if (!securityPassword) return;
    setCreating(true);
    try {
      const response = await settingsService.createBackup(securityPassword);
      const disposition = String(response.headers?.["content-disposition"] || "");
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = match ? match[1] : "backup.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t("Backup downloaded."));
    } catch (error) {
      toast.error(await blobErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const record = parsed as {
        format?: unknown;
        version?: unknown;
        createdAt?: unknown;
        storeName?: unknown;
        data?: Record<string, unknown>;
      } | null;
      if (
        !record ||
        typeof record !== "object" ||
        record.format !== "ecommerce-admin-backup" ||
        !record.data ||
        typeof record.data !== "object"
      ) {
        toast.error(t("That file is not a backup file for this store."));
        return;
      }
      const counts: Partial<BackupRestoreCounts> = {};
      for (const [key] of COUNT_LABELS) {
        const value = record.data[key];
        if (Array.isArray(value)) counts[key] = value.length;
      }
      setLoaded({
        fileName: file.name,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
        storeName: typeof record.storeName === "string" ? record.storeName : undefined,
        counts,
        payload: parsed,
      });
    } catch {
      toast.error(t("That file could not be read. Choose a backup file created by this store."));
    }
  };

  const restoreBackup = async () => {
    if (!loaded) return;
    // Unmistakable danger confirmation FIRST (this replaces the
    // store's current data), then the Settings Lock security check —
    // the same order every other destructive Settings write uses.
    const confirmed = await confirmDialog({
      title: t("Restore this backup?"),
      message: t(
        "This REPLACES the store's current settings and data with the backup's contents. Anything created or changed after the backup was taken will be lost. This cannot be undone.",
      ),
      confirmLabel: t("Restore Backup"),
      variant: "danger",
    });
    if (!confirmed) return;
    const securityPassword = await securityCheckDialog({
      message: t("Enter your own account password to restore this backup."),
      confirmLabel: t("Verify & Restore"),
    });
    if (!securityPassword) return;
    setRestoring(true);
    try {
      const { counts } = await settingsService.restoreBackup(loaded.payload, securityPassword);
      const total = COUNT_LABELS.reduce(
        (sum, [key]) => sum + (typeof counts[key] === "number" ? Number(counts[key]) : 0),
        0,
      );
      toast.success(
        t("Backup restored — {count} records are back. Reloading…").replace(
          "{count}",
          String(total),
        ),
      );
      // The restore may have replaced the theme, language, currency
      // and every panel's data — reload so the whole admin re-reads
      // the restored state, exactly as it would on a fresh sign-in.
      window.setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast.error(extractApiError(error));
      setRestoring(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SettingsCard
        title="Create Backup"
        description="Download one file with the whole store: every setting (including each integration's stored configuration), roles and permissions, products, categories, brands, coupons, orders, customers, reviews and media records."
      >
        <p className="max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
          {t(
            "For safety, account passwords and two-factor secrets are never written into a backup file — accounts are backed up as records only. Integration settings are included in full, because a settings restore is impossible without them. Keep the downloaded file private.",
          )}
        </p>
        <div className="mt-6 flex justify-end border-t border-[var(--border)] pt-5">
          <Button
            onClick={() => void createBackup()}
            disabled={creating}
            icon={creating ? LoaderCircle : Download}
          >
            {creating ? t("Creating...") : t("Create Backup")}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Restore Backup"
        description="Replace the store's current settings and data with a backup file's contents."
      >
        <p className="max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
          {t(
            "Accounts are restored as records: an account that still exists keeps its current password and two-factor setup, and an account that was deleted comes back needing a new password set by an admin before it can sign in. Accounts created after the backup was taken are removed by a restore — your own account is always kept.",
          )}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            void pickFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            icon={Upload}
          >
            {t("Choose Backup File")}
          </Button>
          {loaded && (
            <span className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-soft)]">
              <FileJson size={15} className="shrink-0 text-[var(--primary)]" />
              <span className="truncate font-medium text-[var(--text)]">{loaded.fileName}</span>
              {loaded.storeName && <span>· {loaded.storeName}</span>}
              {loaded.createdAt && <span>· {formatCreatedAt(loaded.createdAt)}</span>}
            </span>
          )}
        </div>

        {loaded && (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 sm:grid-cols-3 lg:grid-cols-5">
            {countRows(loaded.counts).map(([key, label]) => (
              <div key={key} className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-[var(--text-muted)]">{t(label)}</dt>
                <dd className="text-sm font-semibold text-[var(--text)]">
                  {loaded.counts[key]}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-6 flex justify-end border-t border-[var(--border)] pt-5">
          <Button
            variant="danger"
            onClick={() => void restoreBackup()}
            disabled={!loaded || restoring}
            icon={restoring ? LoaderCircle : Upload}
          >
            {restoring ? t("Restoring...") : t("Restore This Backup")}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
