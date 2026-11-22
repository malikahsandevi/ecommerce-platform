import { useEffect, useRef } from "react";

/**
 * Shared overlay dismissal — Ahsan's rule: EVERY popup closes when the
 * user clicks OUTSIDE its box. Spread the returned props on the
 * popup's full-screen overlay element:
 *
 *   const backdrop = useBackdropClose(onClose, isOpen);
 *   <div className="fixed inset-0 …" {...backdrop}> <div box/> </div>
 *
 * The popup closes only when the press BOTH starts and ends on the
 * overlay itself — a drag that begins inside the box (e.g. selecting
 * text) and ends outside never closes it accidentally. Closing always
 * means CANCEL: `onClose` must never save or confirm anything.
 *
 * Escape closes too, except while a ConfirmDialog (role="alertdialog")
 * is stacked above — its own Escape handling wins there.
 *
 * `enabled` gates both gestures (pass the popup's open state, and
 * false while a submit is busy so a mid-save popup can't be dismissed
 * out from under its own request).
 */
export function useBackdropClose(onClose: () => void, enabled = true) {
  const pressRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="alertdialog"]')) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  return {
    onMouseDown: (event: React.MouseEvent) => {
      pressRef.current = event.target === event.currentTarget;
    },
    onClick: (event: React.MouseEvent) => {
      if (enabled && pressRef.current && event.target === event.currentTarget) {
        onClose();
      }
      pressRef.current = false;
    },
  };
}
