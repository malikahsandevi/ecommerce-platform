"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useBackdropClose } from "@/hooks/useBackdropClose";
import { extractApiError } from "@/services/api";
import { useAdminAuth } from "@/services/authContext";
import { useLanguage } from "@/services/i18n";
import {
  keepPreviewedPalette,
  revertPalettePreview,
  usePalettePreview,
} from "@/services/appearance";

/**
 * The palette Keep/Revert decision popup — mounted ONCE by the admin
 * shell (AdminShell), NOT by the Appearance picker (Ahsan's order:
 * "user jha bhi hai" — wherever the user is). Apply starts a 30s
 * preview whose state lives in services/appearance module state; the
 * user may close Settings and wander the panel during the countdown,
 * so when the time completes and the phase flips to "deciding", THIS
 * global mount is what shows the popup — on the Dashboard, Products,
 * any route inside the shell.
 *
 * Semantics are the picker's original ones, unchanged: Keep persists
 * (Setting doc + device stores + last-used) with a "Theme saved"
 * toast; Revert — or a backdrop press / Escape — restores the
 * previously kept palette everywhere and persists nothing.
 *
 * While signed out (the login popup is up) the popup stays hidden but
 * the pending "deciding" phase is NOT dropped: the module state keeps
 * it, and the moment the shell is authenticated again this mount
 * renders it. A full page reload is different by design — the preview
 * was never persisted, so the previously kept palette paints and no
 * decision is owed.
 */
export default function PaletteDecisionPopup() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAdminAuth();
  const preview = usePalettePreview();
  const deciding = isAuthenticated && preview?.phase === "deciding";
  const [keeping, setKeeping] = useState(false);

  const previewRef = useRef(preview);
  previewRef.current = preview;

  const handleRevert = () => {
    revertPalettePreview();
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

  const handleKeep = async () => {
    if (keeping || !previewRef.current) return;
    setKeeping(true);
    try {
      // The one shared persist path (Setting doc + device stores +
      // last-used, then the preview ends) — the picker's Confirm
      // button runs exactly the same helper.
      await keepPreviewedPalette();
      toast.success(t("Theme saved"));
    } catch (error) {
      toast.error(extractApiError(error) || t("Unable to save settings."));
      revertRef.current();
    } finally {
      setKeeping(false);
    }
  };

  if (!deciding) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm animate-in fade-in duration-150"
      role="alertdialog"
      aria-modal="true"
      aria-label={t("Keep this palette?")}
      data-testid="palette-decision-popup"
      data-global-palette-popup="true"
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
  );
}
