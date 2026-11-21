"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, X, ZoomIn } from "lucide-react";
import Button from "@/components/ui/Button";
import { mediaService } from "@/services/resourceRegistry";
import { extractApiError } from "@/services/api";

export interface ImageCropperProps {
  isOpen: boolean;
  /** The image to crop (any URL the browser can load with CORS). */
  imageUrl: string | null;
  onClose: () => void;
  /** Receives the URL of the cropped image after it has been uploaded
   *  and registered in the media library. */
  onApply: (result: { url: string }) => void;
}

const OUTPUT_SIZE = 512;

/**
 * "Set image" crop popup: the image sits in a square frame behind a
 * circular mask (avatars render round, so the circle is the truth).
 * Drag to reposition, zoom with the slider; Apply renders the visible
 * square through a canvas, uploads it via the signed media flow and
 * hands the new URL back. Cancel changes nothing.
 */
export const ImageCropper: React.FC<ImageCropperProps> = ({
  isOpen,
  imageUrl,
  onClose,
  onApply,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [frameSize, setFrameSize] = useState(320);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  // Fresh state + a CORS-readable copy of the image every time it opens.
  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
    setLoadError("");
    setApplyError("");
    setApplying(false);
    imgRef.current = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setLoadError("This image could not be loaded for editing.");
    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  // Measure the frame once it is on screen (it is viewport-capped).
  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      if (frameRef.current) setFrameSize(frameRef.current.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen]);

  if (!isOpen || !imageUrl) return null;

  const F = frameSize;
  // Cover-fit scale: at zoom 1 the image exactly covers the square.
  const baseScale = natural ? Math.max(F / natural.w, F / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : F;
  const dispH = natural ? natural.h * scale : F;
  const maxOx = Math.max(0, (dispW - F) / 2);
  const maxOy = Math.max(0, (dispH - F) / 2);
  const ox = Math.max(-maxOx, Math.min(maxOx, offset.x));
  const oy = Math.max(-maxOy, Math.min(maxOy, offset.y));
  const imgLeft = (F - dispW) / 2 + ox;
  const imgTop = (F - dispH) / 2 + oy;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!natural || applying) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox, oy };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.ox + (e.clientX - drag.x),
      y: drag.oy + (e.clientY - drag.y),
    });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const handleApply = async () => {
    const img = imgRef.current;
    if (!img || !natural || applying) return;
    setApplying(true);
    setApplyError("");
    try {
      // The frame's square in source-image coordinates.
      const sx = -imgLeft / scale;
      const sy = -imgTop / scale;
      const side = F / scale;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available in this browser.");
      ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) {
        throw new Error("The cropped image could not be created.");
      }
      const file = new File([blob], "cropped-image.jpg", { type: "image/jpeg" });
      const record = await mediaService.upload({ file, title: "Cropped image" });
      if (!record?.url) throw new Error("The upload did not return a URL.");
      onApply({ url: record.url });
    } catch (error) {
      setApplyError(
        error instanceof Error && /taint|security|cross-origin/i.test(error.message)
          ? "This image cannot be edited because its source blocks editing (CORS)."
          : extractApiError(error) || "The cropped image could not be saved.",
      );
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-[var(--border)]">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--surface-muted)] shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
              <Pencil className="w-4 h-4 text-[var(--primary)]" />
              Set Image
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Drag the image to centre it — the circle is how it will appear.
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close editor" />
        </div>

        {/* FRAME */}
        <div className="p-4 sm:p-5 flex flex-col items-center gap-4">
          <div
            ref={frameRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative w-[320px] max-w-[78vw] aspect-square rounded-2xl overflow-hidden bg-[var(--surface-muted)] border border-[var(--border)] touch-none select-none cursor-grab active:cursor-grabbing"
          >
            {natural ? (
              <>
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  crossOrigin="anonymous"
                  className="absolute max-w-none pointer-events-none"
                  style={{ width: dispW, height: dispH, left: imgLeft, top: imgTop }}
                />
                {/* Circular mask: everything outside the circle is dimmed. */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="w-full h-full rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] px-6 text-center">
                {loadError ? (
                  <span className="text-red-500">{loadError}</span>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                    Loading image…
                  </>
                )}
              </div>
            )}
          </div>

          {/* ZOOM */}
          <div className="w-[320px] max-w-[78vw] flex items-center gap-2.5">
            <ZoomIn className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              disabled={!natural || applying}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-[var(--primary)]"
            />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] w-10 text-right">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {applyError && <p className="text-[11px] text-red-500 text-center">{applyError}</p>}
        </div>

        {/* ACTIONS */}
        <div className="p-3 sm:p-4 border-t border-[var(--border)] flex items-center justify-end gap-2 sm:gap-3 bg-[var(--surface-muted)] shrink-0">
          <Button variant="outline" size="md" type="button" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!natural || applying}
            onClick={() => void handleApply()}
          >
            {applying ? "Uploading…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropper;
