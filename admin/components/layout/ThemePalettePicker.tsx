"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useBackdropClose } from "@/hooks/useBackdropClose";
import { extractApiError } from "@/services/api";
import { useLanguage } from "@/services/i18n";
import { settingsService } from "@/services/settingsService";
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  PALETTE_ROLES,
  PALETTE_ROLE_LABELS,
  paletteById,
  resolvePaletteId,
  sanitizeLastUsed,
} from "@/services/palettes";
import {
  beginPalettePreview,
  endPalettePreview,
  mix,
  persistPalette,
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
 * ONE table: rows are the four color roles (Primary / Secondary /
 * Text / Background), columns are ready-made palettes. Selecting a
 * column only previews it in the dummy cards on the right — the
 * selected column carries a light border. There is no per-color
 * editing. The single palette colours the admin panel AND the
 * storefront together.
 *
 * Apply puts the palette on the WHOLE panel as a temporary preview
 * and starts a 30-second countdown beside the Apply button — no
 * popup yet, and the preview state lives in services/appearance (not
 * in this component), so the admin can switch panels and come back
 * without cancelling it. Nothing is persisted while previewing.
 * When the countdown completes, the Keep/Revert popup appears: Keep
 * saves the palette (Setting doc + device stores + last-used) with a
 * "Theme saved" toast; Revert — or a backdrop click / Escape —
 * restores the previously kept palette everywhere.
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
  const [keeping, setKeeping] = useState(false);

  // The running Apply-preview (module state in services/appearance —
  // survives this panel unmounting). counting → inline countdown;
  // deciding → the Keep/Revert popup.
  const preview = usePalettePreview();
  const previewActive = preview !== null;
  const deciding = preview?.phase === "deciding";
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

  const handleRevert = () => {
    revertPalettePreview();
    setSelectedId(savedIdRef.current ?? DEFAULT_PALETTE_ID);
  };
  const revertRef = useRef(handleRevert);
  revertRef.current = handleRevert;

  // Escape reverts while the popup is up (the shared backdrop hook
  // defers Escape to alertdialogs, so the popup handles its own).
  useEffect(() => {
    if (!deciding) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") revertRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deciding]);

  const backdrop = useBackdropClose(() => revertRef.current(), deciding && !keeping);

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

  const handleKeep = async () => {
    if (keeping || !previewRef.current) return;
    setKeeping(true);
    const id = previewRef.current.previewId;
    const nextLastUsed = [id, ...lastUsed.filter((entry) => entry !== id)].slice(0, 4);
    try {
      await settingsService.updateSection("appearance", {
        palette: id,
        paletteLastUsed: nextLastUsed,
      });
      persistPalette(id);
      setSavedId(id);
      savedIdRef.current = id;
      setLastUsed(nextLastUsed);
      endPalettePreview();
      toast.success(t("Theme saved"));
    } catch (error) {
      toast.error(extractApiError(error) || t("Unable to save settings."));
      revertRef.current();
    } finally {
      setKeeping(false);
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
                style={{ backgroundColor: palette.colors.primary }}
              />
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          <div className="overflow-x-auto">
            <table
              className="w-full border-separate"
              style={{ borderSpacing: 4 }}
              data-testid="palette-table"
            >
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
                {PALETTE_ROLES.map((role) => (
                  <tr key={role}>
                    <th className="px-1 text-left text-sm font-medium text-[var(--text)]">
                      {t(PALETTE_ROLE_LABELS[role])}
                    </th>
                    {PALETTES.map((palette) => (
                      <td
                        key={palette.id}
                        onClick={() => select(palette.id)}
                        data-palette-cell={`${palette.id}:${role}`}
                        className="cursor-pointer rounded-lg p-1.5 transition"
                        style={columnStyle(palette.id)}
                      >
                        <div
                          className="h-9 rounded-md border border-black/20"
                          style={{ backgroundColor: palette.colors[role] }}
                        />
                        <div className="mt-1 text-center text-[10px] text-[var(--text-muted)]">
                          {palette.colors[role]}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={handleApply} disabled={applyDisabled} data-testid="palette-apply">
              {t("Apply")}
            </Button>
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
          <div
            className="mt-2 rounded-xl border p-4 transition-colors duration-200"
            data-testid="preview-stage"
            style={{
              backgroundColor: selected.colors.background,
              borderColor: mix(selected.colors.background, selected.colors.text, 0.18),
            }}
          >
            <div
              className="rounded-lg p-4"
              data-testid="preview-card"
              style={{ backgroundColor: mix(selected.colors.background, selected.colors.text, 0.07) }}
            >
              <h5
                className="text-sm font-semibold"
                data-testid="preview-heading"
                style={{ color: selected.colors.text }}
              >
                {t("Dashboard")}
              </h5>
              <p
                className="mt-1 text-xs"
                style={{ color: mix(selected.colors.text, selected.colors.background, 0.45) }}
              >
                {t("Buttons, text and surfaces follow the selected palette.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                  data-testid="preview-primary"
                  style={{ backgroundColor: selected.colors.primary }}
                >
                  {t("Primary")}
                </span>
                <span
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                  data-testid="preview-secondary"
                  style={{ backgroundColor: selected.colors.secondary }}
                >
                  {t("Secondary")}
                </span>
              </div>
              <div
                className="mt-4 h-2 rounded-full"
                style={{ backgroundColor: mix(selected.colors.background, selected.colors.text, 0.12) }}
              >
                <div
                  className="h-2 w-2/3 rounded-full transition-colors duration-200"
                  style={{ backgroundColor: selected.colors.primary }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {deciding && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-label={t("Keep this palette?")}
          {...backdrop}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--text)]">{t("Keep this palette?")}</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {t("The preview time is complete. Keep this palette to save it as your theme, or revert to bring the previous palette back.")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => revertRef.current()} disabled={keeping}>
                {t("Revert")}
              </Button>
              <Button onClick={handleKeep} disabled={keeping} data-testid="palette-keep">
                {keeping ? t("Saving...") : t("Keep")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
