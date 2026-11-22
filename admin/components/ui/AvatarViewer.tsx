"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, X } from "lucide-react";
import { useLanguage } from "@/services/i18n";

/**
 * Avatar image viewer with a shared-element (FLIP) morph.
 *
 * Used on the user-image spots (details-panel header avatar, customers
 * table avatar): hovering the image shows an eye overlay; clicking
 * grows the image out of its avatar box into a large rounded frame —
 * over the details panel's own region when opened from the panel, or a
 * centred frame of the same proportions when opened from the table.
 * Closing (X, backdrop click, or Esc) shrinks it back into the avatar
 * box it came from. Avatars without an image never render this — the
 * initial-letter tiles stay non-clickable.
 */

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

const MORPH_MS = 300;
const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const MORPH_TRANSITION = `left ${MORPH_MS}ms ${EASING}, top ${MORPH_MS}ms ${EASING}, width ${MORPH_MS}ms ${EASING}, height ${MORPH_MS}ms ${EASING}, border-radius ${MORPH_MS}ms ${EASING}`;

interface AnimState {
  from: Rect;
  frame: Rect;
  /** "from" renders the image at the avatar box; "to" at the frame. */
  stage: "from" | "to";
  closing: boolean;
}

export interface AvatarViewerTriggerProps {
  src: string;
  alt: string;
  /** Size classes for the avatar box, e.g. "w-10 h-10" or "w-8 h-8". */
  sizeClass: string;
  /** Corner style of the avatar box: "rounded-full" or "rounded-lg". */
  roundedClass: "rounded-full" | "rounded-lg";
  /** Initial letter shown if the image fails to load (self-managed fallback). */
  fallbackLabel?: string;
  /** Extra classes for the avatar box (borders etc.). */
  className?: string;
  /** Notified when the image fails, for parents that manage the fallback. */
  onError?: () => void;
}

export const AvatarViewerTrigger: React.FC<AvatarViewerTriggerProps> = ({
  src,
  alt,
  sizeClass,
  roundedClass,
  fallbackLabel,
  className = "",
  onError,
}) => {
  const { t } = useLanguage();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const [anim, setAnim] = useState<AnimState | null>(null);
  /** False only for the viewer's very first render (placed, not yet morphing). */
  const [primed, setPrimed] = useState(false);
  const timersRef = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const measureTrigger = useCallback((): Rect | null => {
    const el = triggerRef.current;
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      radius: roundedClass === "rounded-full" ? r.width / 2 : 8,
    };
  }, [roundedClass]);

  const openViewer = (event: React.MouseEvent) => {
    event.stopPropagation();
    const el = triggerRef.current;
    const from = measureTrigger();
    if (!el || !from) return;

    // Frame: over the details panel's own region when the avatar lives
    // in one (the panel is an <aside>); otherwise a centred frame of
    // the same proportions.
    const aside = el.closest("aside");
    let frame: Rect;
    if (aside) {
      const a = aside.getBoundingClientRect();
      const inset = 6;
      frame = {
        left: a.left + inset,
        top: a.top + inset,
        width: a.width - inset * 2,
        height: a.height - inset * 2,
        radius: 20,
      };
    } else {
      const w = Math.min(336, window.innerWidth - 32);
      const h = Math.min(600, window.innerHeight * 0.72);
      frame = {
        left: (window.innerWidth - w) / 2,
        top: (window.innerHeight - h) / 2,
        width: w,
        height: h,
        radius: 20,
      };
    }

    setPrimed(false);
    setAnim({ from, frame, stage: "from", closing: false });
    // Two frames later the image sits at the avatar box; flipping the
    // stage then morphs it into the frame.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPrimed(true);
        setAnim((a) => (a ? { ...a, stage: "to" } : a));
      });
    });
  };

  const closeViewer = useCallback(() => {
    setAnim((current) => {
      if (!current || current.closing) return current;
      // Re-measure the avatar box — it may have moved (scroll, layout)
      // since the viewer opened. If it is gone, shrink in place (fade).
      const fresh = measureTrigger();
      return { ...current, from: fresh ?? current.from, stage: "from", closing: true };
    });
    later(() => {
      setAnim(null);
      setPrimed(false);
    }, MORPH_MS + 40);
  }, [later, measureTrigger]);

  // Esc closes; body scroll is locked while the viewer is up.
  useEffect(() => {
    if (!anim) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [anim, closeViewer]);

  if (failed && fallbackLabel !== undefined) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center bg-[var(--primary-soft)] font-bold text-[var(--primary)] ${sizeClass} ${roundedClass} ${className}`}
      >
        {fallbackLabel}
      </span>
    );
  }

  const rect = anim ? (anim.stage === "from" ? anim.from : anim.frame) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openViewer}
        aria-label={t("View {name} image").replace("{name}", alt)}
        title={t("View image")}
        className={`group relative block shrink-0 cursor-pointer overflow-hidden ${sizeClass} ${roundedClass} ${className}`}
      >
        <img
          src={src}
          alt={alt}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Eye className="h-4 w-4" />
        </span>
      </button>

      {anim &&
        rect &&
        createPortal(
          <div className="fixed inset-0 z-[94]">
            {/* Backdrop — clicking outside the image closes. */}
            <div
              data-avatar-viewer-backdrop
              onClick={closeViewer}
              className="absolute inset-0 bg-black/60"
              style={{
                opacity: anim.closing ? 0 : 1,
                transition: `opacity ${MORPH_MS}ms ease`,
              }}
            />
            {/* The morphing image itself: avatar box <-> frame. */}
            <img
              src={src}
              alt={alt}
              data-avatar-viewer-image
              className="fixed z-[95] object-cover shadow-2xl"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                borderRadius: rect.radius,
                transition: primed ? MORPH_TRANSITION : undefined,
              }}
            />
            {anim.stage === "to" && !anim.closing && (
              <button
                type="button"
                onClick={closeViewer}
                aria-label={t("Close image viewer")}
                className="animate-in fade-in fixed z-[96] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white shadow-lg transition-colors duration-200 hover:bg-[var(--primary)]"
                style={{
                  left: anim.frame.left + anim.frame.width - 44,
                  top: anim.frame.top + 12,
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

export default AvatarViewerTrigger;
