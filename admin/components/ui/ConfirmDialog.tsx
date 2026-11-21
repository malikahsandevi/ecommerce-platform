"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * The admin's own confirmation dialog — the ONLY confirmation UI in the
 * panel. It replaces every browser-native `confirm()` / `alert()` (which
 * showed the hosting domain in the title and clashed with the panel's
 * design). Usage:
 *
 *   if (await confirmDialog({ message: "Delete this media?", variant: "danger" })) { … }
 *   await noticeDialog({ message: "Saved." });            // single-button mode
 *
 * An optional async `onConfirm` runs while the dialog shows a busy state;
 * if it throws, the dialog stays open with the error shown inside.
 * `ConfirmDialogHost` must be mounted once (the root layout's shell does)
 * — without a host, confirmDialog resolves `false` rather than ever
 * falling back to a native dialog.
 */
export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" renders a solid red confirm button for destructive actions. */
  variant?: "primary" | "danger";
  /** Single-button notice mode (the alert() replacement). */
  notice?: boolean;
  onConfirm?: () => Promise<void>;
}

interface PendingRequest {
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
}

let enqueueRequest: ((request: PendingRequest) => void) | null = null;

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (enqueueRequest) {
      enqueueRequest({ options, resolve });
    } else {
      resolve(false);
    }
  });
}

export function noticeDialog(
  options: Omit<ConfirmDialogOptions, "notice" | "onConfirm">,
): Promise<void> {
  return confirmDialog({ ...options, notice: true }).then(() => undefined);
}

export const ConfirmDialogHost: React.FC = () => {
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    enqueueRequest = (request) =>
      setQueue((current) => [...current, request]);
    return () => {
      enqueueRequest = null;
    };
  }, []);

  const current = queue[0] ?? null;

  const finish = useCallback((value: boolean) => {
    setQueue((pending) => {
      const [head, ...rest] = pending;
      head?.resolve(value);
      return rest;
    });
    setBusy(false);
    setError("");
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!current || busy) return;
    if (current.options.onConfirm) {
      setBusy(true);
      setError("");
      try {
        await current.options.onConfirm();
        finish(true);
      } catch (confirmError) {
        setBusy(false);
        setError(
          confirmError instanceof Error
            ? confirmError.message
            : "Something went wrong. Please try again.",
        );
      }
      return;
    }
    finish(true);
  }, [current, busy, finish]);

  const handleCancel = useCallback(() => {
    if (busy) return;
    finish(false);
  }, [busy, finish]);

  // Escape cancels a confirmation; in notice mode it acknowledges.
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (current.options.notice) void handleConfirm();
        else handleCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, handleConfirm, handleCancel]);

  if (!current) return null;

  const { options } = current;
  const danger = options.variant === "danger";
  const title =
    options.title ?? (options.notice ? "Notice" : danger ? "Are you sure?" : "Confirm");

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (options.notice) void handleConfirm();
        else handleCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              danger
                ? "bg-red-500/10 text-red-500"
                : "bg-[var(--primary-soft)] text-[var(--primary)]"
            }`}
          >
            {danger ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
              {options.message}
            </p>
          </div>
        </div>

        {error && (
          <p
            className="mt-3 rounded-lg border border-red-300 bg-red-500/10 p-2.5 text-xs text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {!options.notice && (
            <Button variant="ghost" size="md" onClick={handleCancel} disabled={busy}>
              {options.cancelLabel ?? "Cancel"}
            </Button>
          )}
          <Button
            variant={danger ? "danger" : "primary"}
            size="md"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={
              danger
                ? "bg-red-500! text-white! border-red-500! hover:bg-red-600!"
                : undefined
            }
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                Working...
              </span>
            ) : (
              (options.confirmLabel ?? (options.notice ? "OK" : "Confirm"))
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogHost;
