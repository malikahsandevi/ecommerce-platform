"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { useBackdropClose } from "@/hooks/useBackdropClose";
import { useLanguage } from "@/services/i18n";

/**
 * DateRangePicker — the shared From/To date-range popup (Ahsan's
 * "Filters by Date" component; first used by the Revenue Analytics
 * card's Custom period, built to be reused by other pages later).
 *
 * Layout (his spec): a "From" label with an input UNDER it, a "-"
 * separator, a "To" label with an input under it — then ONE custom
 * calendar panel below that both inputs and clicks drive together:
 *  - Typing a valid date in an input moves the calendar selection.
 *  - Clicking the calendar fills the inputs. First click sets From,
 *    second click sets To, and the whole From→To span highlights.
 *  - While picking To, dates before From are shown muted but are NOT
 *    disabled — clicking one makes it the new From and picking
 *    continues from there. A typed To earlier than From behaves the
 *    same way (it restarts From) instead of erroring.
 *
 * Dates travel as ISO day strings ("2026-11-12"); the inputs show
 * NUMBERS ONLY in dd mm yyyy form ("12 11 2026" — his order: no
 * month names). Typed input is accepted with spaces, dashes or
 * slashes between the parts ("12 11 2026", "12-11-2026",
 * "12/11/2026"; 1–2 digit day/month), and the selection follows
 * LIVE while typing: a valid day on its own selects that day in the
 * shown month, day+month navigates the calendar to that month
 * (typing "8" selects the 8th; continuing "8 11" selects 8 Nov).
 *
 * The calendar NEVER goes beyond today: future days render muted
 * and are inert, the next-month navigation stops at the current
 * month, and a typed future date is not accepted as a selection.
 *
 * The calendar is fully custom-rendered (no <input type="date">, no
 * library widget) and themed from the palette variables: endpoints
 * solid primary with white text, in-range days on the primary-soft
 * wash.
 *
 * Dismissal follows the house rule: backdrop press (start + end on
 * the overlay) or Escape = Cancel — the previously active range is
 * left untouched; only the footer's Apply commits.
 */

export interface DateRange {
  /** ISO day string, yyyy-mm-dd. */
  from: string;
  /** ISO day string, yyyy-mm-dd. */
  to: string;
}

export interface DateRangePickerProps {
  open: boolean;
  /** The currently active range (the popup opens showing it), or null. */
  value: DateRange | null;
  onApply: (range: DateRange) => void;
  /** Cancel — backdrop press, Escape, or the Cancel button. */
  onClose: () => void;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local Date → ISO day string (yyyy-mm-dd). */
export const toIsoDay = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** ISO day string → local Date at midnight (null when malformed). */
export const fromIsoDay = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIsoDay(d) === iso ? d : null;
};

/** "12 11 2026" — the input display form: numbers only, dd mm yyyy. */
export const formatRangeDay = (iso: string): string => {
  const d = fromIsoDay(iso);
  if (!d) return "";
  return `${pad2(d.getDate())} ${pad2(d.getMonth() + 1)} ${d.getFullYear()}`;
};

/** "12 Nov" — the short form used on the closed dropdown trigger. */
export const formatRangeDayShort = (iso: string): string => {
  const d = fromIsoDay(iso);
  if (!d) return "";
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
};

/**
 * Parse a COMPLETE typed date: dd mm yyyy with spaces, dashes or
 * slashes between the parts ("12 11 2026", "12-11-2026",
 * "12/11/2026"; day and month may be 1–2 digits), or an ISO day
 * ("2026-11-12"). Returns the ISO day or null for anything that is
 * not a real calendar date.
 */
export const parseRangeDay = (text: string): string | null => {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return fromIsoDay(trimmed) ? trimmed : null;
  }
  const m = /^(\d{1,2})[\s\/-](\d{1,2})[\s\/-](\d{4})$/.exec(trimmed);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) {
    return null;
  }
  return toIsoDay(d);
};

/**
 * Parse a PARTIALLY typed date for the live selection that follows
 * the typing: the parts typed so far (same separators as
 * parseRangeDay) resolve against the calendar's currently shown
 * month — a day alone selects that day in the shown month, day +
 * month selects that day in that month of the shown year, and a
 * fully typed year wins when present. Returns null while the parts
 * cannot form a real date yet (the selection simply stays put).
 */
export const parsePartialRangeDay = (
  text: string,
  anchorYear: number,
  anchorMonth: number,
): string | null => {
  const groups = (text || "")
    .trim()
    .split(/[\s\/-]+/)
    .filter((g) => g.length > 0);
  if (groups.length === 0 || groups.length > 3) return null;
  if (!groups.every((g) => /^\d+$/.test(g))) return null;
  const day = Number(groups[0]);
  if (day < 1 || day > 31) return null;
  let month = anchorMonth;
  let year = anchorYear;
  if (groups.length >= 2) {
    const m = Number(groups[1]);
    if (m < 1 || m > 12) return null;
    month = m - 1;
  }
  if (groups.length === 3) {
    if (groups[2].length > 4) return null;
    // A year still being typed (fewer than 4 digits) does not move
    // the candidate yet — day + month already selected live.
    if (groups[2].length === 4) year = Number(groups[2]);
  }
  const d = new Date(year, month, day);
  if (d.getDate() !== day || d.getMonth() !== month) return null;
  return toIsoDay(d);
};

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  open,
  value,
  onApply,
  onClose,
}) => {
  const { t } = useLanguage();
  const [selFrom, setSelFrom] = useState<string | null>(null);
  const [selTo, setSelTo] = useState<string | null>(null);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));

  // (Re)initialise from the active range every time the popup opens.
  useEffect(() => {
    if (!open) return;
    setSelFrom(value?.from ?? null);
    setSelTo(value?.to ?? null);
    setFromText(value ? formatRangeDay(value.from) : "");
    setToText(value ? formatRangeDay(value.to) : "");
    const anchor = value?.from ? fromIsoDay(value.from) : new Date();
    const anchorMonth = startOfMonth(anchor ?? new Date());
    const currentMonth = startOfMonth(new Date());
    // The calendar never opens beyond the current month.
    setViewMonth(anchorMonth > currentMonth ? currentMonth : anchorMonth);
  }, [open, value]);

  const backdrop = useBackdropClose(onClose, open);

  const pickingTo = Boolean(selFrom && !selTo);

  // The calendar's hard ceiling: today. Future days are inert, the
  // month navigation stops at the current month, and typed future
  // dates never become a selection.
  const todayIso = toIsoDay(new Date());

  const syncTexts = (from: string | null, to: string | null) => {
    setFromText(from ? formatRangeDay(from) : "");
    setToText(to ? formatRangeDay(to) : "");
  };

  const handleDayClick = (iso: string) => {
    if (iso > todayIso) return; // future day — inert
    if (!selFrom || (selFrom && selTo)) {
      // Fresh selection: this day becomes From, To picking restarts.
      setSelFrom(iso);
      setSelTo(null);
      syncTexts(iso, null);
      return;
    }
    if (iso >= selFrom) {
      setSelTo(iso);
      syncTexts(selFrom, iso);
    } else {
      // Before From while picking To: NOT disabled by design — the
      // day becomes the new From and picking continues from there.
      setSelFrom(iso);
      syncTexts(iso, null);
    }
  };

  /** A typed date lands in the From field (complete or live-partial). */
  const applyTypedFrom = (iso: string) => {
    setSelFrom(iso);
    // A From moved past the current To restarts To picking.
    if (selTo && selTo < iso) {
      setSelTo(null);
      setToText("");
    }
    const d = fromIsoDay(iso);
    if (d) setViewMonth(startOfMonth(d));
  };

  /** A typed date lands in the To field (complete or live-partial). */
  const applyTypedTo = (iso: string) => {
    if (!selFrom) {
      setSelFrom(iso);
      setFromText(formatRangeDay(iso));
    } else if (iso < selFrom) {
      // Typed To earlier than From: same rule as the calendar — the
      // date becomes the new From and picking continues.
      setSelFrom(iso);
      setSelTo(null);
      setFromText(formatRangeDay(iso));
      setToText("");
    } else {
      setSelTo(iso);
    }
    const d = fromIsoDay(iso);
    if (d) setViewMonth(startOfMonth(d));
  };

  /**
   * The candidate a field's current text resolves to on THIS
   * keystroke: a complete date wins; otherwise the live partial
   * (day alone, then day + month) against the shown month. Future
   * candidates are rejected — the selection stays where it was.
   */
  const typedCandidate = (text: string): string | null => {
    const iso =
      parseRangeDay(text) ??
      parsePartialRangeDay(text, viewMonth.getFullYear(), viewMonth.getMonth());
    if (!iso || iso > todayIso) return null;
    return iso;
  };

  const handleFromText = (text: string) => {
    setFromText(text);
    const iso = typedCandidate(text);
    if (iso) applyTypedFrom(iso);
  };

  const handleToText = (text: string) => {
    setToText(text);
    const iso = typedCandidate(text);
    if (iso) applyTypedTo(iso);
  };

  // Weekday header letters from Intl (locale-aware, no dict strings):
  // 2023-01-01 was a Sunday, so the week renders Sun → Sat.
  const weekdayLetters = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2023, 0, 1 + i).toLocaleDateString(undefined, {
          weekday: "narrow",
        })
      ),
    []
  );

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const offset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: Array<{ iso: string; day: number } | null> = [];
    for (let i = 0; i < offset; i++) list.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      list.push({ iso: toIsoDay(new Date(year, month, day)), day });
    }
    return list;
  }, [viewMonth]);

  if (!open) return null;

  const monthTitle = viewMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // The next-month navigation stops at the current month — the
  // calendar table never goes beyond today.
  const atCurrentMonth =
    viewMonth.getFullYear() === new Date().getFullYear() &&
    viewMonth.getMonth() === new Date().getMonth();

  const moveMonth = (delta: number) =>
    setViewMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      return next > startOfMonth(new Date()) ? prev : next;
    });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      {...backdrop}
      data-testid="date-range-picker-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Custom range")}
        data-testid="date-range-picker"
        className="w-full max-w-sm rounded-2xl border border-(--border) bg-(--background) p-4 shadow-2xl"
      >
        {/* From — To inputs (his layout: label, input under it, the
            "-" separator between the two fields). */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor="drp-from-input"
              className="mb-1 block text-xs font-semibold text-(--text-muted)"
            >
              {t("From")}
            </label>
            <input
              id="drp-from-input"
              data-testid="drp-from-input"
              type="text"
              value={fromText}
              onChange={(e) => handleFromText(e.target.value)}
              onBlur={() => setFromText(selFrom ? formatRangeDay(selFrom) : "")}
              placeholder="01 01 2026"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-(--border) bg-(--surface-muted) px-2.5 text-sm text-(--text) outline-none transition focus:border-(--primary)"
            />
          </div>
          <span className="pb-2 font-semibold text-(--text-muted)">-</span>
          <div className="flex-1">
            <label
              htmlFor="drp-to-input"
              className="mb-1 block text-xs font-semibold text-(--text-muted)"
            >
              {t("To")}
            </label>
            <input
              id="drp-to-input"
              data-testid="drp-to-input"
              type="text"
              value={toText}
              onChange={(e) => handleToText(e.target.value)}
              onBlur={() => setToText(selTo ? formatRangeDay(selTo) : "")}
              placeholder="08 01 2026"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-(--border) bg-(--surface-muted) px-2.5 text-sm text-(--text) outline-none transition focus:border-(--primary)"
            />
          </div>
        </div>

        {/* The one custom calendar panel both inputs drive. */}
        <div className="mt-4" data-testid="drp-calendar">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              data-testid="drp-prev-month"
              aria-label={t("Previous month")}
              onClick={() => moveMonth(-1)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-(--border) text-(--text-muted) transition hover:bg-(--surface-muted)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p
              className="text-sm font-bold text-(--text)"
              data-testid="drp-month-title"
            >
              {monthTitle}
            </p>
            <button
              type="button"
              data-testid="drp-next-month"
              aria-label={t("Next month")}
              onClick={() => moveMonth(1)}
              disabled={atCurrentMonth}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-(--border) text-(--text-muted) transition hover:bg-(--surface-muted) disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {weekdayLetters.map((letter, i) => (
              <span
                key={i}
                className="flex h-7 items-center justify-center text-[11px] font-semibold text-(--text-muted)"
              >
                {letter}
              </span>
            ))}
            {cells.map((cell, i) => {
              if (!cell) return <span key={`blank-${i}`} />;
              const isEndpoint =
                cell.iso === selFrom || (selTo !== null && cell.iso === selTo);
              const inRange =
                selFrom !== null &&
                selTo !== null &&
                cell.iso > selFrom &&
                cell.iso < selTo;
              const mutedBefore = pickingTo && selFrom !== null && cell.iso < selFrom;
              const isFuture = cell.iso > todayIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-testid={`drp-day-${cell.iso}`}
                  data-iso={cell.iso}
                  aria-disabled={isFuture || undefined}
                  onClick={() => handleDayClick(cell.iso)}
                  className={`drp-day flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                    isFuture
                      ? "drp-day-future cursor-default text-(--text-muted) opacity-40"
                      : `cursor-pointer ${
                          isEndpoint
                            ? "drp-day-endpoint font-bold"
                            : inRange
                              ? "drp-day-inrange text-(--text)"
                              : mutedBefore
                                ? "drp-day-muted text-(--text-muted) hover:bg-(--surface-muted)"
                                : "text-(--text) hover:bg-(--surface-muted)"
                        }`
                  }`}
                  style={
                    isEndpoint
                      ? { backgroundColor: "var(--primary)", color: "#ffffff" }
                      : inRange
                        ? { backgroundColor: "var(--primary-soft)" }
                        : undefined
                  }
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={() => {
              if (selFrom && selTo) onApply({ from: selFrom, to: selTo });
            }}
            disabled={!selFrom || !selTo}
            data-testid="drp-apply"
          >
            {t("Apply")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
