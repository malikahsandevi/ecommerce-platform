"use client";

import { useEffect, useState } from "react";
import { apiClient } from "./api";
import { toIsoDay } from "@/components/ui/DateRangePicker";

/**
 * Store timezone (Settings → General → Time Zone) — the canonical
 * day for every date filter in the panel. The server already treats
 * it as canonical (dashboard buckets, revenue range and the export's
 * by-date filter all resolve days in the store timezone); the
 * panel's own FilterBar presets and record-day comparisons used to
 * run on the BROWSER's local day, so a browser in another timezone
 * saw a different "Last 7 Days" than the export of the same list
 * produced. These helpers resolve days in the store timezone once
 * the shell has loaded it, falling back to the browser-local day
 * while it is unknown (identical whenever browser and store share a
 * timezone). Mirrors the currency plumbing (services/currency.ts):
 * the shell fetches the settings bootstrap once signed in; a
 * localStorage mirror lets the first render after a reload already
 * use the saved zone.
 */

export const STORE_TIMEZONE_EVENT = "admin:store-timezone";
const STORAGE_KEY = "admin-store-timezone";

let activeTimeZone: string | null = null;

const isUsableTimeZone = (tz: string | null | undefined): tz is string => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export function getStoreTimeZone(): string | null {
  if (activeTimeZone) return activeTimeZone;
  if (typeof window !== "undefined") {
    try {
      const cached = window.localStorage.getItem(STORAGE_KEY);
      if (isUsableTimeZone(cached)) return cached;
    } catch {
      /* storage unavailable — fall through */
    }
  }
  return null;
}

export function applyStoreTimeZone(tz: string | undefined | null): void {
  if (!isUsableTimeZone(tz)) return;
  activeTimeZone = tz;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, tz);
    } catch {
      /* non-fatal */
    }
    window.dispatchEvent(new Event(STORE_TIMEZONE_EVENT));
  }
}

/** Loads the store timezone once and applies it. Reads the shell
 *  bootstrap slice (GET /settings/bootstrap) — readable by every
 *  staff session, like the currency and the language. */
export async function fetchAndApplyStoreTimeZone(): Promise<void> {
  try {
    const { data } = await apiClient.get("/settings/bootstrap");
    applyStoreTimeZone(data?.general?.timeZone);
  } catch {
    /* settings may be unreachable — the panel keeps its cached zone */
  }
}

/** Subscribes a component to the active store timezone. */
export function useStoreTimeZone(): string | null {
  const [tz, setTz] = useState<string | null>(() => getStoreTimeZone());
  useEffect(() => {
    const update = () => setTz(getStoreTimeZone());
    update();
    window.addEventListener(STORE_TIMEZONE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(STORE_TIMEZONE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return tz;
}

/** ISO day (yyyy-mm-dd) of an instant in the store timezone. */
export function dayKeyInStoreTz(date: Date): string {
  const tz = getStoreTimeZone();
  if (!tz) return toIsoDay(date);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return toIsoDay(date);
  }
}

/** Calendar arithmetic on a yyyy-mm-dd day key (DST-free: the math
 *  runs on the key itself, in UTC, never on instants). */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** "Last N days" as a store-timezone day range: the store's today
 *  minus (N−1) days through the store's today, inclusive. */
export function presetRangeInStoreTz(days: number): { from: string; to: string } {
  const to = dayKeyInStoreTz(new Date());
  return { from: addDaysToDayKey(to, -(days - 1)), to };
}
