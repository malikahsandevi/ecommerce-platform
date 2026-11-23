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
  PALETTE_ROLES,
  PALETTE_ROLE_LABELS,
  paletteById,
  resolvePaletteId,
  sanitizeLastUsed,
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
 * ONE table: rows are the eight color roles — each palette's DARK
 * set (Primary / Secondary / Text / Background) followed by its
 * LIGHT set — columns are ready-made palettes. Selecting a column
 * only previews it in the dummy cards on the right (one dark card
 * and one light card, both recoloring live) — the selected column
 * carries a light border. There is no per-color editing. The single
 * palette colours the admin panel AND the storefront together.
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

  // While a preview runs, the table selection follows it; when it
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
  const columnStyle = (id: string): React.CSSProperties =>
    selectedId === id
      ? {
          boxShadow: "inset 0 0 0 2px rgba(255, 255, 255, 0.85)",
          backgroundColor: "var(--surface-muted)",
        }
      : { boxShadow: "inset 0 0 0 1px var(--border)" };

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
          <div className="overflow-x-auto">
            {/* Fixed layout + an equal-fraction colgroup: every
                palette column is the SAME width (Ahsan: "kuch box
                bary or kuch choty hain, brabar karo") — content
                (name/hex length) can never stretch a column, and at
                narrower widths all columns shrink together. */}
            <table
              className="w-full table-fixed border-separate"
              style={{ borderSpacing: 4 }}
              data-testid="palette-table"
            >
              <colgroup>
                <col style={{ width: "10%" }} />
                {PALETTES.map((palette) => (
                  <col key={palette.id} style={{ width: "11.25%" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="px-1 text-left text-xs font-medium text-[var(--text-muted)]">
                    {t("Palette")}
                  </th>
                  {PALETTES.map((palette) => (
                    <th
                      key={palette.id}
                      onClick={() => select(palette.id)}
                      data-palette-header={palette.id}
                      aria-pressed={selectedId === palette.id}
                      className="cursor-pointer rounded-lg px-2 py-2 text-center text-xs font-medium text-[var(--text)] transition"
                      style={columnStyle(palette.id)}
                    >
                      {t(palette.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PALETTE_MODES.map((mode) =>
                  PALETTE_ROLES.map((role) => (
                    <tr key={`${mode}-${role}`}>
                      <th className="px-1 text-left text-sm font-medium text-[var(--text)]">
                        {t(`${PALETTE_MODE_LABELS[mode]} ${PALETTE_ROLE_LABELS[role]}`)}
                      </th>
                      {PALETTES.map((palette) => (
                        <td
                          key={palette.id}
                          onClick={() => select(palette.id)}
                          data-palette-cell={`${palette.id}:${mode}:${role}`}
                          className="cursor-pointer rounded-lg p-1.5 transition"
                          style={columnStyle(palette.id)}
                        >
                          <div
                            className="h-9 rounded-md border border-black/20"
                            style={{ backgroundColor: palette[mode][role] }}
                          />
                          <div className="mt-1 truncate text-center text-[10px] text-[var(--text-muted)]">
                            {palette[mode][role]}
                          </div>
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
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
