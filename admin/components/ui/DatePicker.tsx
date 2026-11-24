"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { useBackdropClose } from "@/hooks/useBackdropClose";
import { useLanguage } from "@/services/i18n";
import {
  toIsoDay,
  fromIsoDay,
  formatRangeDay,
  parseRangeDay,
  parsePartialRangeDay,
} from "@/components/ui/DateRangePicker";

/**
 * DatePicker — the single-date sibling of the shared DateRangePicker
 * (the generic form's `date` field type renders it, e.g. the coupon
 * form's Valid From / Valid Until). It reuses the range picker's
 * calendar machinery and language wholesale: the same numbers-only
 * "dd mm yyyy" typed input with live partial parsing, the same
 * custom-rendered calendar panel (no <input type="date">, no library
 * widget), the same palette theming, and the same dismissal rule —
 * backdrop press or Escape = Cancel; only Apply commits.
 *
 * Two deliberate differences from the range picker:
 *  - ONE date, not a From/To pair: a single input drives the
 *    calendar, and clicking a day selects just that day.
 *  - NO "today" ceiling: form dates legitimately live in the future
 *    (a coupon can be scheduled to start next month), so future days
 *    are selectable and month navigation is unrestricted both ways.
 *
 * Values travel as ISO day strings ("2026-11-12") — byte-identical
 * to what the native date input produced, so stored data and every
 * consumer of the field value are untouched.
 */

export interface DatePickerProps {
  open: boolean;
  /** The field's current value (ISO day), or null when empty. */
  value: string | null;
  /** Heading shown above the input (the field's label). */
  title?: string;
  onApply: (iso: string) => void;
  /** Cancel — backdrop press, Escape, or the Cancel button. */
  onClose: () => void;
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export const DatePicker: React.FC<DatePickerProps> = ({
  open,
  value,
  title,
  onApply,
  onClose,
}) => {
  const { t } = useLanguage();
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));

  // (Re)initialise from the field's value every time the popup opens.
  useEffect(() => {
    if (!open) return;
    const iso = value && fromIsoDay(value) ? value : null;
    setSel(iso);
    setText(iso ? formatRangeDay(iso) : "");
    const anchor = iso ? fromIsoDay(iso) : new Date();
    setViewMonth(startOfMonth(anchor ?? new Date()));
  }, [open, value]);

  const backdrop = useBackdropClose(onClose, open);

  const handleDayClick = (iso: string) => {
    setSel(iso);
    setText(formatRangeDay(iso));
  };

  /**
   * The candidate the typed text resolves to on THIS keystroke: a
   * complete date wins; otherwise the live partial (day alone, then
   * day + month) against the shown month — exactly the range
   * picker's rule, minus its future rejection.
   */
  const typedCandidate = (raw: string): string | null =>
    parseRangeDay(raw) ??
    parsePartialRangeDay(raw, viewMonth.getFullYear(), viewMonth.getMonth());

  const handleText = (raw: string) => {
    setText(raw);
    const iso = typedCandidate(raw);
    if (iso) {
      setSel(iso);
      const d = fromIsoDay(iso);
      if (d) setViewMonth(startOfMonth(d));
    }
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

  const moveMonth = (delta: number) =>
    setViewMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      {...backdrop}
      data-testid="date-picker-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || t("Date")}
        data-testid="date-picker"
        className="w-full max-w-sm rounded-2xl border border-(--border) bg-(--background) p-4 shadow-2xl"
      >
        <div>
          <label
            htmlFor="dp-input"
            className="mb-1 block text-xs font-semibold text-(--text-muted)"
          >
            {title || t("Date")}
          </label>
          <input
            id="dp-input"
            data-testid="dp-input"
            type="text"
            value={text}
            onChange={(e) => handleText(e.target.value)}
            onBlur={() => setText(sel ? formatRangeDay(sel) : "")}
            placeholder="01 01 2026"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-full rounded-lg border border-(--border) bg-(--surface-muted) px-2.5 text-sm text-(--text) outline-none transition focus:border-(--primary)"
          />
        </div>

        {/* The one custom calendar panel the input drives. */}
        <div className="mt-4" data-testid="dp-calendar">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              data-testid="dp-prev-month"
              aria-label={t("Previous month")}
              onClick={() => moveMonth(-1)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-(--border) text-(--text-muted) transition hover:bg-(--surface-muted)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-bold text-(--text)" data-testid="dp-month-title">
              {monthTitle}
            </p>
            <button
              type="button"
              data-testid="dp-next-month"
              aria-label={t("Next month")}
              onClick={() => moveMonth(1)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-(--border) text-(--text-muted) transition hover:bg-(--surface-muted)"
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
              const isSelected = cell.iso === sel;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-testid={`dp-day-${cell.iso}`}
                  data-iso={cell.iso}
                  onClick={() => handleDayClick(cell.iso)}
                  className={`flex h-9 cursor-pointer items-center justify-center rounded-lg text-sm transition-colors ${
                    isSelected
                      ? "font-bold"
                      : "text-(--text) hover:bg-(--surface-muted)"
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: "var(--primary)", color: "#ffffff" }
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
              if (sel) onApply(sel);
            }}
            disabled={!sel}
            data-testid="dp-apply"
          >
            {t("Apply")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DatePicker;
