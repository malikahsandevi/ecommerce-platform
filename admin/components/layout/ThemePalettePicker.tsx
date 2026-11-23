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
import { applyPalette, mix, persistPalette } from "@/services/appearance";

/** The Keep/Revert confirmation window, in seconds (Ahsan's spec).
 *  Tests may shorten it through a window override; the shipped
 *  default is always 15. */
export const PALETTE_CONFIRM_SECONDS = 15;

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
 * column only PREVIEWS it — the dummy cards on the right recolor
 * live and the selected column carries a light border. There is no
 * per-color editing. The single palette colours the admin panel AND
 * the storefront together.
 *
 * Apply puts the previewed palette live on the whole panel and opens
 * the Keep/Revert popup with a 15-second countdown: Keep persists
 * it (Setting doc + device stores + last-used), Revert — or the
 * countdown running out, or a backdrop click — restores the
 * previously kept palette everywhere.
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
  // The column currently selected (preview only, until kept).
  const [selectedId, setSelectedId] = useState<string>(
    () => resolvePaletteId(data) ?? DEFAULT_PALETTE_ID,
  );
  const [lastUsed, setLastUsed] = useState<string[]>(() => sanitizeLastUsed(data?.paletteLastUsed));
  const [pending, setPending] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [remaining, setRemaining] = useState(PALETTE_CONFIRM_SECONDS);
  const [totalSeconds, setTotalSeconds] = useState(PALETTE_CONFIRM_SECONDS);

  const pendingRef = useRef(false);
  const endAtRef = useRef(0);
  const savedIdRef = useRef(savedId);
  savedIdRef.current = savedId;

  // Sync the kept palette from the settings document when it changes
  // (initial load, a save elsewhere). A preview in progress is never
  // stomped; the pending popup owns the screen while it is open.
  const dataKey = `${String(data?.palette ?? "")}|${String(data?.adminColor ?? "")}|${String(data?.storefrontColor ?? "")}`;
  const lastDataKeyRef = useRef("");
  useEffect(() => {
    if (dataKey === lastDataKeyRef.current) return;
    lastDataKeyRef.current = dataKey;
    const resolved = resolvePaletteId(data);
    setSavedId(resolved);
    setLastUsed(sanitizeLastUsed(data?.paletteLastUsed));
    if (!pendingRef.current) setSelectedId(resolved ?? DEFAULT_PALETTE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const revert = () => {
    // Restore the previously kept palette everywhere: the panel's
    // variables (clearing every override when nothing was ever kept)
    // and the table selection.
    applyPalette(savedIdRef.current);
    setSelectedId(savedIdRef.current ?? DEFAULT_PALETTE_ID);
    pendingRef.current = false;
    setPending(false);
  };
  const revertRef = useRef(revert);
  revertRef.current = revert;

  // The countdown: reaching zero reverts on its own.
  useEffect(() => {
    if (!pending) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) revertRef.current();
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [pending]);

  // Escape reverts too (the shared backdrop hook defers Escape to
  // alertdialogs, so the popup handles its own).
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") revertRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  const backdrop = useBackdropClose(() => revertRef.current(), pending && !keeping);

  const select = (id: string) => {
    if (pendingRef.current) return;
    setSelectedId(id);
  };

  const handleApply = () => {
    if (pendingRef.current) {
      // Restart cleanly: restore the kept palette before applying
      // the new preview on top of it.
      revertRef.current();
    }
    if (selectedId === savedIdRef.current) return;
    const seconds = confirmSeconds();
    // Applied for real — the whole panel recolors — but NOT yet
    // persisted: Keep is what saves it.
    applyPalette(selectedId);
    setTotalSeconds(seconds);
    setRemaining(seconds);
    endAtRef.current = Date.now() + seconds * 1000;
    pendingRef.current = true;
    setPending(true);
  };

  const handleKeep = async () => {
    if (keeping) return;
    setKeeping(true);
    const id = selectedId;
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
      pendingRef.current = false;
      setPending(false);
      toast.success(t("Palette saved."));
    } catch (error) {
      toast.error(extractApiError(error) || t("Unable to save settings."));
      revertRef.current();
    } finally {
      setKeeping(false);
    }
  };

  const selected = paletteById(selectedId) ?? PALETTES[0];
  const applyDisabled = pending || selectedId === savedId;
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

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleApply} disabled={applyDisabled} data-testid="palette-apply">
              {t("Apply")}
            </Button>
            {selectedId !== savedId && !pending && (
              <span className="text-xs text-[var(--text-muted)]">
                {t("Previewing — apply to use this palette.")}
              </span>
            )}
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

      {pending && (
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
              {t("This palette is applied now. Keep it to save it, or revert to bring the previous palette back. If the time runs out, the previous palette comes back on its own.")}
            </p>
            <div className="mt-4 flex items-end justify-center gap-2">
              <span
                className="text-4xl font-bold tabular-nums text-[var(--text)]"
                data-testid="palette-countdown"
              >
                {remaining}
              </span>
              <span className="pb-1 text-sm text-[var(--text-muted)]">{t("seconds")}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-1.5 rounded-full bg-[var(--primary)] transition-all duration-200"
                style={{ width: `${totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 0}%` }}
              />
            </div>
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
