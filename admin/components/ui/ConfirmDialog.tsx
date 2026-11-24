"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useLanguage } from "@/services/i18n";

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
  /**
   * Optional detail lines fetched WHILE the dialog is open (the
   * delete-impact warnings). While it loads, a brief loading line
   * shows under the message; the resolved text renders under it. A
   * rejection or an empty result shows nothing extra — the plain
   * confirm stays exactly as it was and is never blocked by it.
   */
  loadDetails?: () => Promise<string | null>;
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

/**
 * Three-way variant of the same dialog (same host, same styling, same
 * backdrop/Escape = Cancel rule): Cancel vs. a primary action vs. an
 * alternative action. Used by the service builder's save-guard popup
 * ("Change this one" vs. "Make new one"). Without a host it resolves
 * "cancel" — the safe, nothing-happens answer.
 */
export interface ChoiceDialogOptions {
  title?: string;
  message: string;
  confirmLabel: string;
  altLabel: string;
  cancelLabel?: string;
}

export type ChoiceDialogResult = "cancel" | "confirm" | "alt";

interface PendingChoice {
  options: ChoiceDialogOptions;
  resolve: (value: ChoiceDialogResult) => void;
}

let enqueueChoice: ((request: PendingChoice) => void) | null = null;

export function choiceDialog(options: ChoiceDialogOptions): Promise<ChoiceDialogResult> {
  return new Promise((resolve) => {
    if (enqueueChoice) {
      enqueueChoice({ options, resolve });
    } else {
      resolve("cancel");
    }
  });
}

export function noticeDialog(
  options: Omit<ConfirmDialogOptions, "notice" | "onConfirm">,
): Promise<void> {
  return confirmDialog({ ...options, notice: true }).then(() => undefined);
}

export const ConfirmDialogHost: React.FC = () => {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [choiceQueue, setChoiceQueue] = useState<PendingChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<{ loading: boolean; text: string }>({
    loading: false,
    text: "",
  });

  useEffect(() => {
    enqueueRequest = (request) =>
      setQueue((current) => [...current, request]);
    enqueueChoice = (request) =>
      setChoiceQueue((current) => [...current, request]);
    return () => {
      enqueueRequest = null;
      enqueueChoice = null;
    };
  }, []);

  const current = queue[0] ?? null;
  const currentChoice = current ? null : (choiceQueue[0] ?? null);

  // Async detail lines (loadDetails): fetch when a request carrying
  // a loader becomes the visible one. Any failure resolves to "no
  // extra lines" — the fallback is the plain confirm, never a trap.
  useEffect(() => {
    const loader = current?.options.loadDetails;
    if (!loader) {
      setDetails({ loading: false, text: "" });
      return;
    }
    let cancelled = false;
    setDetails({ loading: true, text: "" });
    loader()
      .then((text) => {
        if (!cancelled) setDetails({ loading: false, text: text || "" });
      })
      .catch(() => {
        if (!cancelled) setDetails({ loading: false, text: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [current]);

  const finishChoice = useCallback((value: ChoiceDialogResult) => {
    setChoiceQueue((pending) => {
      const [head, ...rest] = pending;
      head?.resolve(value);
      return rest;
    });
  }, []);

  // Escape cancels a choice dialog, and a backdrop press (start AND
  // end on the backdrop, the shared pattern) is always a Cancel.
  const choiceBackdropPressRef = useRef(false);
  useEffect(() => {
    if (!currentChoice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishChoice("cancel");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentChoice, finishChoice]);

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
            : t("Something went wrong. Please try again."),
        );
      }
      return;
    }
    finish(true);
  }, [current, busy, finish, t]);

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

  // Backdrop dismissal follows the shared press pattern (Ahsan's rule:
  // every popup closes on an outside click): the press must BOTH start
  // and end on the backdrop itself, so a drag out of the box never
  // cancels by accident. A backdrop close is always a CANCEL — in
  // notice mode it is the single acknowledge action.
  const backdropPressRef = useRef(false);

  if (!current && !currentChoice) return null;

  // Three-way choice dialog — rendered only after every hook above
  // has run (an early return before the hooks would break them).
  if (currentChoice) {
    const choice = currentChoice.options;
    const choiceTitle = choice.title ?? t("Confirm");
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
        role="alertdialog"
        aria-modal="true"
        aria-label={choiceTitle}
        onMouseDown={(event) => {
          choiceBackdropPressRef.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (choiceBackdropPressRef.current && event.target === event.currentTarget) {
            finishChoice("cancel");
          }
          choiceBackdropPressRef.current = false;
        }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <Info className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text)]">{choiceTitle}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                {choice.message}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => finishChoice("cancel")}>
              {choice.cancelLabel ?? t("Cancel")}
            </Button>
            <Button variant="primary" size="md" onClick={() => finishChoice("confirm")}>
              {choice.confirmLabel}
            </Button>
            <Button variant="outline" size="md" onClick={() => finishChoice("alt")}>
              {choice.altLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const { options } = current;
  const danger = options.variant === "danger";
  const title =
    options.title ??
    (options.notice ? t("Notice") : danger ? t("Are you sure?") : t("Confirm"));

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          if (options.notice) void handleConfirm();
          else handleCancel();
        }
        backdropPressRef.current = false;
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {/* The icon badge follows the THEME in both variants
              (Ahsan's order): primary-soft circle, primary icon —
              the fixed red/pink badge clashed with every palette.
              The danger CONFIRM BUTTON below stays red: that is a
              semantic destructive-action signal, not decoration. */}
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"
          >
            {danger ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
              {options.message}
            </p>
            {options.loadDetails && details.loading && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-soft)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("Checking where this is used...")}
              </p>
            )}
            {details.text && (
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed font-medium text-[var(--text)]">
                {details.text}
              </p>
            )}
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
              {options.cancelLabel ?? t("Cancel")}
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
                {t("Working...")}
              </span>
            ) : (
              (options.confirmLabel ?? (options.notice ? t("OK") : t("Confirm")))
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogHost;
