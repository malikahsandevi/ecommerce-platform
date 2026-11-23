"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { extractApiError } from "@/services/api";
import { useLanguage } from "@/services/i18n";
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  PALETTE_MODES,
  PALETTE_MODE_LABELS,
  paletteById,
  resolvePaletteId,
  sanitizeLastUsed,
  type PaletteDef,
} from "@/services/palettes";
import {
  PALETTE_EVENT,
  beginPalettePreview,
  keepPreviewedPalette,
  mix,
  revertPalettePreview,
  usePalettePreview,
} from "@/services/appearance";

/** The preview window, in seconds (Ahsan's spec: 30 — time to walk
 *  the panel and judge the colors before the Keep/Revert popup).
 *  Tests may shorten it through a window override; the shipped
 *  default is always 30. */
export const PALETTE_CONFIRM_SECONDS = 30;

/** The panel's current theme mode, read off <html data-theme> and
 *  kept live with a MutationObserver (the same pattern GlobalSearch
 *  uses for data-animations) — the applied card's ring resolves its
 *  primary from the palette set of the mode on screen. */
function useThemeMode(): "dark" | "light" {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () =>
      setMode(
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "dark"
          : "light",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return mode;
}

function confirmSeconds(): number {
  try {
    const override = (window as unknown as { __PALETTE_CONFIRM_SECONDS__?: number })
      .__PALETTE_CONFIRM_SECONDS__;
    if (typeof override === "number" && Number.isFinite(override) && override > 0) {
      return override;
    }
  } catch {
    /* fall through to the default */
  }
  return PALETTE_CONFIRM_SECONDS;
}

/**
 * Settings → Appearance → Theme Colors (Ahsan's redesign).
 *
 * Palette BOXES in TWO rows of FOUR (the old 8×8 swatch table was
 * too big — Ahsan's order; the boxes later grew bigger, 4 + 4 in
 * two lines — "color cards thory bary karo aur inko 4 4 krky do
 * lines me karo", 2026-11-23): the palette name sits above its box,
 * the box is split by a vertical line into a LIGHT half and a DARK
 * half, and the caption under the box reads "Light | Dark" instead
 * of hex codes. Each half is a miniature preview of its set
 * (Ahsan: the compact box must not hide colours — "baki color
 * kha hai" — and the plain dot/bars were rejected as a design):
 * the half's own background IS the set's background colour, and
 * inside it an "Aa" sample (text colour), a primary pill and a
 * secondary pill show the rest, so all 8 colours of a palette
 * (4 light + 4 dark) are visible at a glance, like the old
 * table showed.
 * Selecting a box only previews it in the dummy cards on the right
 * (one dark card and one light card, both recoloring live) — the
 * selected box carries a light border, and the APPLIED (kept)
 * palette's box carries a ring in the applied theme's own primary
 * colour. There is no per-color editing. The single palette
 * colours the admin panel AND the storefront together.
 *
 * Apply puts the palette on the WHOLE panel as a temporary preview
 * and starts a 30-second countdown beside the Apply button — no
 * popup yet, and the preview state lives in services/appearance (not
 * in this component), so the admin can switch panels and come back
 * without cancelling it. Nothing is persisted while previewing.
 * During the countdown the Apply button becomes an ENABLED Confirm:
 * clicking it means "satisfied" — the timer dies, the palette
 * persists at once (keepPreviewedPalette) with a "Theme applied"
 * toast, and no popup ever appears. If the time completes instead,
 * the Keep/Revert popup appears — rendered GLOBALLY by the shell
 * (components/layout/PaletteDecisionPopup), because the admin may
 * be on any page by then; this picker only mirrors the outcome (a
 * Keep fires PALETTE_EVENT, which re-syncs the kept palette +
 * last-used below).
 */
export default function ThemePalettePicker({
  data,
}: {
  data?: Record<string, unknown>;
}) {
  const { t } = useLanguage();

  // The palette actually KEPT (null = nothing kept yet; the default
  // palette is what the panel shows then).
  const [savedId, setSavedId] = useState<string | null>(() => resolvePaletteId(data));
  // The column currently selected (dummy-card preview only, until applied).
  const [selectedId, setSelectedId] = useState<string>(
    () => resolvePaletteId(data) ?? DEFAULT_PALETTE_ID,
  );
  const [lastUsed, setLastUsed] = useState<string[]>(() => sanitizeLastUsed(data?.paletteLastUsed));

  // The running Apply-preview (module state in services/appearance —
  // survives this panel unmounting). counting → inline countdown;
  // deciding → the shell's global Keep/Revert popup.
  const preview = usePalettePreview();
  const previewActive = preview !== null;
  const [remaining, setRemaining] = useState(0);

  const savedIdRef = useRef(savedId);
  savedIdRef.current = savedId;
  const previewRef = useRef(preview);
  previewRef.current = preview;

  // Sync the kept palette from the settings document when it changes
  // (initial load, a save elsewhere). A preview in progress is never
  // stomped.
  const dataKey = `${String(data?.palette ?? "")}|${String(data?.adminColor ?? "")}|${String(data?.storefrontColor ?? "")}`;
  const lastDataKeyRef = useRef("");
  useEffect(() => {
    if (dataKey === lastDataKeyRef.current) return;
    lastDataKeyRef.current = dataKey;
    const resolved = resolvePaletteId(data);
    setSavedId(resolved);
    setLastUsed(sanitizeLastUsed(data?.paletteLastUsed));
    if (!previewRef.current) setSelectedId(resolved ?? DEFAULT_PALETTE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // While a preview runs, the box selection follows it; when it
  // ends by Revert, the selection falls back to the kept palette.
  const lastPreviewIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (preview) {
      lastPreviewIdRef.current = preview.previewId;
      setSelectedId(preview.previewId);
    } else if (lastPreviewIdRef.current) {
      lastPreviewIdRef.current = null;
      setSelectedId(savedIdRef.current ?? DEFAULT_PALETTE_ID);
    }
  }, [preview]);

  // The inline countdown ticker (the module owns the deadline and
  // the phase flip; this only renders the remaining seconds).
  useEffect(() => {
    if (!preview || preview.phase !== "counting") return;
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((preview.endAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [preview]);

  // A Keep completed in the shell's global popup persists through
  // persistPalette, which fires PALETTE_EVENT — mirror the new kept
  // palette + last-used here so this panel never shows a stale kept
  // palette after a decision made on another page (or this one).
  useEffect(() => {
    const onKept = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (!id || !paletteById(id)) return;
      setSavedId(id);
      savedIdRef.current = id;
      setLastUsed((current) => [id, ...current.filter((entry) => entry !== id)].slice(0, 4));
    };
    window.addEventListener(PALETTE_EVENT, onKept);
    return () => window.removeEventListener(PALETTE_EVENT, onKept);
  }, []);

  const select = (id: string) => {
    if (previewRef.current) return;
    setSelectedId(id);
  };

  const handleApply = () => {
    if (previewRef.current) return;
    if (selectedId === savedIdRef.current) return;
    // Applied to the whole panel as a preview — NOT persisted. The
    // countdown runs in module state beside the Apply button; the
    // Keep/Revert popup appears only when the time completes.
    beginPalettePreview(selectedId, confirmSeconds(), savedIdRef.current);
  };

  // Confirm (Ahsan's refinement): during the countdown the Apply
  // button becomes an ENABLED Confirm — the admin is satisfied, so
  // the timer dies at once, the palette persists through the same
  // path the popup's Keep uses, a "Theme applied" toast shows, and
  // no popup ever appears for this preview.
  const [confirming, setConfirming] = useState(false);
  const handleConfirm = async () => {
    if (confirming || !previewRef.current) return;
    setConfirming(true);
    try {
      await keepPreviewedPalette();
      toast.success(t("Theme applied"));
    } catch (error) {
      toast.error(extractApiError(error) || t("Unable to save settings."));
      revertPalettePreview();
    } finally {
      setConfirming(false);
    }
  };

  const selected = paletteById(selectedId) ?? PALETTES[0];
  const applyDisabled = previewActive || selectedId === savedId;
  // Three box states, told apart at a glance (Ahsan's order,
  // 2026-11-23: "jo applied ho uspr primary applied theme ka color
  // ho"): the APPLIED (kept) palette's box carries a ring in the
  // applied theme's OWN primary colour — resolved from that
  // palette's set for the mode on screen — so the palette that is
  // actually live is marked in its own colour. A merely SELECTED
  // box (the dummy-card preview selection) keeps the neutral light
  // border the selected table column had; every other box gets the
  // plain hairline. Applied wins over selected when both are the
  // same box (the resting state).
  const mode = useThemeMode();
  const appliedId = savedId ?? DEFAULT_PALETTE_ID;
  const boxStyle = (id: string): React.CSSProperties => {
    if (id === appliedId) {
      const primary = paletteById(id)?.[mode].primary ?? "var(--primary)";
      return {
        boxShadow: `inset 0 0 0 2px ${primary}`,
        backgroundColor: "var(--surface-muted)",
      };
    }
    return selectedId === id
      ? {
          boxShadow: "inset 0 0 0 2px rgba(255, 255, 255, 0.85)",
          backgroundColor: "var(--surface-muted)",
        }
      : { boxShadow: "inset 0 0 0 1px var(--border)" };
  };

  // One half of a palette box: a MINIATURE THEME PREVIEW of the
  // mode (Ahsan's redesign — the lone dot was rejected, and plain
  // colour bars too: "isko redesign karo, acha nhi hai"). The
  // half's background is the set's background colour, and inside
  // it sits a tiny piece of real UI: an "Aa" sample in the set's
  // text colour, a primary pill like a small button, and a
  // shorter secondary pill — so the half reads as the theme
  // itself in miniature and all four colours of the set stay
  // visible and individually measurable. The pills size as
  // fractions of the half, so nothing cramps or overflows at any
  // box width and the halves stay equal. The primary pill keeps
  // the data-palette-dot marker the panel's checks have used.
  const renderHalf = (palette: PaletteDef, mode: "light" | "dark") => {
    const set = palette[mode];
    return (
      <span
        data-palette-half={`${palette.id}:${mode}`}
        className="flex flex-1 flex-col justify-center gap-1.5 px-2.5"
        style={{
          backgroundColor: set.background,
          ...(mode === "dark"
            ? { borderLeft: "1px solid rgba(140, 140, 140, 0.45)" }
            : {}),
        }}
      >
        <span
          data-palette-swatch={`${palette.id}:${mode}:text`}
          className="text-sm font-semibold leading-none"
          style={{ color: set.text }}
        >
          Aa
        </span>
        <span
          data-palette-dot={`${palette.id}:${mode}`}
          data-palette-swatch={`${palette.id}:${mode}:primary`}
          className="h-2.5 w-4/5 rounded-full"
          style={{ backgroundColor: set.primary }}
        />
        <span
          data-palette-swatch={`${palette.id}:${mode}:secondary`}
          className="h-[7px] w-3/5 rounded-full"
          style={{ backgroundColor: set.secondary }}
        />
      </span>
    );
  };

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <h3 className="text-sm font-medium text-[var(--text)]">{t("Theme Colors")}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t("One palette colors the admin panel and the storefront together — they always share the same colors.")}
      </p>

      {lastUsed.length > 0 && (
        <div className="mt-3 flex items-center gap-2" data-testid="palette-last-used">
          <span className="text-xs text-[var(--text-muted)]">{t("Last used")}</span>
          {lastUsed.map((id) => {
            const palette = paletteById(id);
            if (!palette) return null;
            return (
              <button
                key={id}
                type="button"
                title={t(palette.name)}
                aria-label={t(palette.name)}
                data-last-used={id}
                onClick={() => select(id)}
                className={`h-7 w-7 rounded-full border border-black/20 transition ${
                  selectedId === id
                    ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--background)]"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: palette.dark.primary }}
              />
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          {/* Palette boxes (Ahsan's layout): one box per palette
              in a grid of FOUR equal-width columns — two rows of
              four (2026-11-23: bigger cards, "4 4 krky do lines me
              karo") — wrapping to 2 per row on narrow widths, so
              every box stays the SAME width — "brabar karo". The
              name sits
              above the box; the box is split by a vertical line —
              LEFT half is the LIGHT presentation, RIGHT half the
              DARK presentation, both from the palette's real sets;
              each half is a miniature of its set — its background
              plus an "Aa" text sample, a primary pill and a
              secondary pill — so the FULL colour set shows; the
              caption under the box reads "Light | Dark" where hex
              codes used to be. */}
          <div
            className="grid grid-cols-2 gap-4 min-[560px]:grid-cols-4"
            data-testid="palette-boxes"
          >
            {PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                onClick={() => select(palette.id)}
                data-palette-header={palette.id}
                aria-pressed={selectedId === palette.id}
                className="flex min-w-0 cursor-pointer flex-col text-center"
              >
                <span className="truncate px-1 pb-2 text-[13px] font-medium text-[var(--text)]">
                  {t(palette.name)}
                </span>
                <span
                  data-palette-box={palette.id}
                  data-palette-applied={palette.id === appliedId ? "true" : undefined}
                  className="block rounded-lg p-1 transition"
                  style={boxStyle(palette.id)}
                >
                  <span className="flex h-20 overflow-hidden rounded-md">
                    {renderHalf(palette, "light")}
                    {renderHalf(palette, "dark")}
                  </span>
                </span>
                <span
                  data-palette-caption={palette.id}
                  className="px-1 pt-2 text-[11px] text-[var(--text-muted)]"
                >
                  {t("Light")} | {t("Dark")}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {preview?.phase === "counting" ? (
              <Button onClick={handleConfirm} disabled={confirming} data-testid="palette-apply">
                {t("Confirm")}
              </Button>
            ) : (
              <Button onClick={handleApply} disabled={applyDisabled} data-testid="palette-apply">
                {t("Apply")}
              </Button>
            )}
            {preview?.phase === "counting" ? (
              <span className="flex items-center gap-2" data-testid="palette-countdown-inline">
                <span className="text-sm font-bold tabular-nums text-[var(--text)]">
                  {remaining}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{t("seconds")}</span>
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <span
                    className="block h-1.5 rounded-full bg-[var(--primary)] transition-all duration-200"
                    style={{
                      width: `${preview.totalSeconds > 0 ? (remaining / preview.totalSeconds) * 100 : 0}%`,
                    }}
                  />
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t("Preview applied — look around the panel, nothing is saved yet.")}
                </span>
              </span>
            ) : selectedId !== savedId && !previewActive ? (
              <span className="text-xs text-[var(--text-muted)]">
                {t("Previewing — apply to use this palette.")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="w-full shrink-0 xl:w-72" data-testid="palette-preview">
          <h4 className="text-xs font-medium text-[var(--text-muted)]">{t("Preview")}</h4>
          {PALETTE_MODES.map((mode) => {
            const set = selected[mode];
            const suffix = mode === "dark" ? "" : "-light";
            return (
              <div key={mode} className="mt-3">
                <p className="text-[11px] font-medium text-[var(--text-muted)]">
                  {t(PALETTE_MODE_LABELS[mode])}
                </p>
                <div
                  className="mt-1 rounded-xl border p-4 transition-colors duration-200"
                  data-testid={`preview-stage${suffix}`}
                  style={{
                    backgroundColor: set.background,
                    borderColor: mix(set.background, set.text, 0.18),
                  }}
                >
                  <div
                    className="rounded-lg p-4"
                    data-testid={`preview-card${suffix}`}
                    style={{ backgroundColor: mix(set.background, set.text, 0.07) }}
                  >
                    <h5
                      className="text-sm font-semibold"
                      data-testid={`preview-heading${suffix}`}
                      style={{ color: set.text }}
                    >
                      {t("Dashboard")}
                    </h5>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: mix(set.text, set.background, 0.45) }}
                    >
                      {t("Buttons, text and surfaces follow the selected palette.")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                        data-testid={`preview-primary${suffix}`}
                        style={{ backgroundColor: set.primary }}
                      >
                        {t("Primary")}
                      </span>
                      <span
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                        data-testid={`preview-secondary${suffix}`}
                        style={{ backgroundColor: set.secondary }}
                      >
                        {t("Secondary")}
                      </span>
                    </div>
                    <div
                      className="mt-4 h-2 rounded-full"
                      style={{ backgroundColor: mix(set.background, set.text, 0.12) }}
                    >
                      <div
                        className="h-2 w-2/3 rounded-full transition-colors duration-200"
                        style={{ backgroundColor: set.primary }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* No Keep/Revert popup here on purpose: it renders globally
          from the shell (PaletteDecisionPopup) so it appears on
          whatever page the admin is on when the countdown ends. */}
    </div>
  );
}
