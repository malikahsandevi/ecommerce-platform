"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PackageCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import { SettingsInput } from "@/components/layout/SettingsControls";
import { useLanguage } from "@/services/i18n";

/**
 * The tracking-number prompt shown when an order is being marked
 * Shipped without a tracking number yet (same promise pattern as
 * the Settings security check). Three ways out:
 *   • a typed number  → resolve(number) — saved with the status change
 *   • "Ship without"  → resolve("") — the order ships numberless and
 *     the number can be added later in the order's Shipment section
 *   • Cancel / backdrop / Escape → resolve(null) — the save is aborted
 * Without a mounted host the prompt resolves null (the safe,
 * nothing-happens answer), never a native prompt.
 */
interface PendingRequest {
  resolve: (value: string | null) => void;
}

let enqueueRequest: ((request: PendingRequest) => void) | null = null;

export function trackingNumberPrompt(): Promise<string | null> {
  return new Promise((resolve) => {
    if (enqueueRequest) {
      enqueueRequest({ resolve });
    } else {
      resolve(null);
    }
  });
}

export const TrackingNumberPromptHost: React.FC = () => {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [trackingNumber, setTrackingNumber] = useState("");
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
    setTrackingNumber("");
  }, []);

  const handleCancel = useCallback(() => finish(null), [finish]);

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

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-label={t("Add a tracking number")}
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
            <PackageCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text)]">{t("Add a tracking number")}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
              {t("This order is being marked as shipped. Add the courier tracking number now, or ship without one and add it later.")}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <SettingsInput
            label="Tracking Number"
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            autoFocus
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={handleCancel}>
            {t("Cancel")}
          </Button>
          <Button variant="secondary" size="md" onClick={() => finish("")}>
            {t("Ship without a tracking number")}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => finish(trackingNumber.trim())}
          >
            {t("Save & Ship")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TrackingNumberPromptHost;
