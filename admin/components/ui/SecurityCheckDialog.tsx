"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import { SettingsInput } from "@/components/layout/SettingsControls";
import { useLanguage } from "@/services/i18n";

/**
 * The Settings Lock's per-save security check (Ahsan's order: EVERY
 * save inside Settings verifies the admin's own password again, for
 * that save). One reusable modal in the ConfirmDialog family — same
 * backdrop/card, backdrop press and Escape are a CANCEL (nothing is
 * saved), and the entered password is handed to exactly one save
 * request by the caller:
 *
 *   const password = await securityCheckDialog();
 *   if (!password) return;                    // cancelled — no save
 *   await settingsService.updateSection(section, value, password);
 *
 * The password is never kept: the dialog's field state is cleared as
 * it resolves, and nothing stores the value beyond the request it
 * rides with. Without a mounted host the dialog resolves `null`
 * (the safe, nothing-happens answer), never a native prompt.
 */
export interface SecurityCheckDialogOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
}

interface PendingRequest {
  options: SecurityCheckDialogOptions;
  resolve: (value: string | null) => void;
}

let enqueueRequest: ((request: PendingRequest) => void) | null = null;

export function securityCheckDialog(
  options: SecurityCheckDialogOptions = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    if (enqueueRequest) {
      enqueueRequest({ options, resolve });
    } else {
      resolve(null);
    }
  });
}

/** Thrown by save flows when the admin cancels the security check, so
 *  callers whose errors surface in a form can tell "cancelled — stay
 *  silent" apart from a real failure. */
export class SecurityCheckCancelledError extends Error {
  constructor() {
    super("Security check cancelled.");
    this.name = "SecurityCheckCancelledError";
  }
}

export function isSecurityCheckCancelled(error: unknown): boolean {
  return error instanceof SecurityCheckCancelledError;
}

export const SecurityCheckDialogHost: React.FC = () => {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const backdropPressRef = useRef(false);

  useEffect(() => {
    enqueueRequest = (request) =>
      setQueue((current) => [...current, request]);
    return () => {
      enqueueRequest = null;
    };
  }, []);

  const current = queue[0] ?? null;

  const finish = useCallback((value: string | null) => {
    setQueue((pending) => {
      const [head, ...rest] = pending;
      head?.resolve(value);
      return rest;
    });
    // The password leaves with the resolution — never kept in state.
    setPassword("");
    setError("");
  }, []);

  const handleCancel = useCallback(() => finish(null), [finish]);

  const handleSubmit = useCallback(() => {
    if (!current) return;
    if (!password) {
      setError(t("Enter your password to continue."));
      return;
    }
    finish(password);
  }, [current, password, finish, t]);

  // Escape cancels — the shared rule for every popup in the panel.
  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, handleCancel]);

  if (!current) return null;

  const { options } = current;
  const title = options.title ?? t("Security check");

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          handleCancel();
        }
        backdropPressRef.current = false;
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text)]">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
              {options.message ??
                t("Enter your own account password to save this change.")}
            </p>
          </div>
        </div>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <SettingsInput
            label="Your password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError("");
            }}
            autoFocus
          />
          {error && (
            <p
              className="mt-3 rounded-lg border border-red-300 bg-red-500/10 p-2.5 text-xs text-red-600"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="md" onClick={handleCancel}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" size="md" type="submit">
              {options.confirmLabel ?? t("Verify & Save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SecurityCheckDialogHost;
