"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { sanitizeApiMessage } from "@/services/api";

/**
 * The panel's toast system — the ONLY transient-message UI. It replaces
 * the old full-width banner that sat under the TopBar on the list pages
 * (and the matching strips on the Settings page): those pushed the whole
 * page down every time a "… saved successfully." message appeared.
 *
 *   toast.success("Customers updated successfully.");
 *   toast.error("Email is already in use.");
 *   toast.info("Showing the first 100 of 240 records.");
 *
 * Toasts stack in the bottom-right corner (newest at the bottom),
 * auto-dismiss after ~4 seconds, and pause their countdown while
 * hovered. `ToastHost` must be mounted once (the root layout's shell
 * does); without a host, calls are dropped rather than falling back to
 * any native UI.
 */

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const DURATION_MS = 4000;
const EXIT_MS = 220;

let pushToast: ((item: Omit<ToastItem, "id">) => void) | null = null;

function emit(kind: ToastKind, message: string): void {
  if (!message) return;
  // Every toast passes the main-point guard (services/api): a
  // technical-shaped string — a raw validation dump, a driver error,
  // a stack trace — is replaced by its short human equivalent here,
  // at the one choke point no call site can bypass.
  pushToast?.({ kind, message: sanitizeApiMessage(message) });
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  info: (message: string) => emit("info", message),
};

const KIND_STYLES: Record<
  ToastKind,
  { icon: typeof CheckCircle2; chip: string; bar: string }
> = {
  success: {
    icon: CheckCircle2,
    chip: "bg-emerald-500/15 text-emerald-500",
    bar: "bg-emerald-500",
  },
  error: {
    icon: AlertCircle,
    chip: "bg-red-500/15 text-red-500",
    bar: "bg-red-500",
  },
  info: {
    icon: Info,
    chip: "bg-orange-500/15 text-orange-500",
    bar: "bg-orange-500",
  },
};

function ToastCard({
  item,
  onDone,
}: {
  item: ToastItem;
  onDone: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  // Progress-bar state: a width percentage plus the transition duration
  // that animates it to 0. Pausing freezes the bar at its current width.
  const [bar, setBar] = useState<{ width: number; duration: number }>({
    width: 100,
    duration: 0,
  });
  const barRef = useRef<HTMLDivElement>(null);
  const remainingRef = useRef(DURATION_MS);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const leavingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setLeaving(true);
    window.setTimeout(() => onDone(item.id), EXIT_MS);
  }, [item.id, onDone]);

  const runCountdown = useCallback(() => {
    startedAtRef.current = Date.now();
    // Next frame so the transition actually animates from the set width.
    requestAnimationFrame(() => {
      setBar((current) => ({ width: 0, duration: remainingRef.current }));
    });
    timerRef.current = window.setTimeout(dismiss, remainingRef.current);
  }, [dismiss]);

  useEffect(() => {
    runCountdown();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [runCountdown]);

  const pause = () => {
    if (leavingRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startedAtRef.current),
    );
    // Freeze the bar exactly where it is.
    const el = barRef.current;
    if (el) {
      const parent = el.parentElement;
      const pct = parent
        ? (el.getBoundingClientRect().width / parent.getBoundingClientRect().width) * 100
        : (remainingRef.current / DURATION_MS) * 100;
      setBar({ width: pct, duration: 0 });
    }
  };

  const resume = () => {
    if (leavingRef.current) return;
    runCountdown();
  };

  const { icon: Icon, chip, bar: barColor } = KIND_STYLES[item.kind];

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`toast-card pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 shadow-xl ${
        leaving ? "toast-card-leaving" : ""
      }`}
    >
      <span
        className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${chip}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="min-w-0 flex-1 pt-0.5 text-xs leading-relaxed text-[var(--text)]">
        {item.message}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="close-x shrink-0 rounded-md p-0.5 text-[var(--text-muted)] cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {/* Auto-dismiss countdown, along the bottom edge. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--border)]/40">
        <div
          ref={barRef}
          className={`h-full ${barColor}`}
          style={{
            width: `${bar.width}%`,
            transition:
              bar.duration > 0
                ? `width ${bar.duration}ms linear`
                : undefined,
          }}
        />
      </div>
    </div>
  );
}

export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    pushToast = (item) => {
      idRef.current += 1;
      const id = idRef.current;
      // Keep at most 5 on screen; the newest stays at the bottom.
      setItems((current) => [...current.slice(-4), { ...item, id }]);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDone={remove} />
      ))}
    </div>
  );
};
