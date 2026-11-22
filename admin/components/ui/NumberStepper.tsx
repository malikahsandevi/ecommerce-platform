"use client";

import { useLanguage } from "@/services/i18n";

/**
 * Custom number-input steppers (Ahsan: the browser's native spinner
 * arrows are replaced by our own — "custom lagwo"). Two small stacked
 * filled-triangle buttons at the input's right edge, muted at rest and
 * primary on hover — the same triangle glyphs the scrollbars use. The
 * native spinners are hidden globally in globals.css; these buttons
 * are the only steppers a number input shows.
 */

/** Compute the next value for a step click: the field's step, clamped
 *  to its min/max, with float dust rounded off at the step's own
 *  precision (0.01 steps stay exact). An empty/unparseable current
 *  value starts from 0 (or the min, when stepping down past it). */
export function steppedValue(
  current: unknown,
  dir: 1 | -1,
  step: number,
  min?: number,
  max?: number,
): number {
  const base =
    current === "" || current === null || current === undefined
      ? 0
      : Number(current);
  const from = Number.isFinite(base) ? base : 0;
  let next = from + dir * step;
  const decimals = (() => {
    const s = String(step);
    return s.includes(".") ? s.split(".")[1].length : 0;
  })();
  next = Number(next.toFixed(Math.max(decimals, 0)));
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

export function StepperButtons({
  onStep,
  disabled = false,
}: {
  onStep: (dir: 1 | -1) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const btn =
    "flex items-center justify-center w-5 h-[11px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors disabled:opacity-40 disabled:hover:text-[var(--text-muted)]";
  return (
    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Increase value")}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onStep(1)}
        className={btn}
      >
        <svg viewBox="0 0 10 10" className="w-[9px] h-[9px]" aria-hidden="true">
          <path d="M5 1.5 9 8 H1 Z" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Decrease value")}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onStep(-1)}
        className={btn}
      >
        <svg viewBox="0 0 10 10" className="w-[9px] h-[9px]" aria-hidden="true">
          <path d="M5 8.5 1 2 H9 Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
