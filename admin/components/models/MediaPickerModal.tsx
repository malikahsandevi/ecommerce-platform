"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Pencil, Search, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { effectiveMediaAlt, mediaService } from "@/services/resourceRegistry";
import { extractApiError } from "@/services/api";
import type { MediaItem } from "@/config/mediaConfig";
import type { GalleryImage } from "@/components/models/ProductMediaManager";
import { useLanguage } from "@/services/i18n";

export interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the picked media, in the order they were clicked. */
  onConfirm: (picked: GalleryImage[]) => void;
  /** Images already in the product — shown as "Added", never re-added. */
  existing: GalleryImage[];
  /** The product's total image cap (7). */
  maxTotal: number;
  /** Single-pick mode (e.g. Settings logo/favicon): one image, generic
   *  wording instead of the product-gallery wording. */
  single?: boolean;
  /** When given (image-field flow), an "Edit" action appears once an
   *  item is selected — the caller opens the cropper for that item and
   *  confirms the cropped result as the pick. */
  onEditSelected?: (item: MediaItem) => void;
}

/**
 * "Select Media" library picker: search by name, alt text or id, browse
 * the newest media by default, multi-select up to the product's free
 * slots, and confirm to insert. A top-level component with stable,
 * id-keyed list items — typing in the search box never remounts it, so
 * the input keeps focus while results refresh (the settings-panel bug).
 */
export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  existing,
  maxTotal,
  single = false,
  onEditSelected,
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const requestSeq = useRef(0);
  // Backdrop dismissal (same pattern as FormModal): only a press that
  // starts AND ends on this overlay closes the picker — never a click
  // inside the panel, and never the form underneath.
  const backdropPressRef = useRef(false);

  const remaining = Math.max(0, maxTotal - existing.length);
  const limitHit = selected.length >= remaining;

  const addedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of existing) {
      if (entry.mediaId) keys.add(`id:${entry.mediaId}`);
      if (entry.url) keys.add(`url:${entry.url}`);
    }
    return keys;
  }, [existing]);

  const isAdded = (media: MediaItem): boolean =>
    addedKeys.has(`id:${media._id}`) || addedKeys.has(`url:${media.url}`);

  // Fresh state every time the picker opens; the first load (empty
  // query) is the whole library, newest first.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelected([]);
    setError("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const seq = ++requestSeq.current;
    setLoading(true);

    const timer = setTimeout(
      () => {
        mediaService
          .search(query.trim(), 60)
          .then((items) => {
            if (requestSeq.current !== seq) return;
            setResults(items as MediaItem[]);
            setError("");
          })
          .catch((fetchError) => {
            if (requestSeq.current !== seq) return;
            setResults([]);
            setError(extractApiError(fetchError));
          })
          .finally(() => {
            if (requestSeq.current === seq) setLoading(false);
          });
      },
      query ? 300 : 0,
    );

    return () => clearTimeout(timer);
  }, [isOpen, query]);

  if (!isOpen) return null;

  const toggle = (media: MediaItem) => {
    if (isAdded(media)) return;
    setSelected((prev) => {
      if (prev.some((item) => item._id === media._id)) {
        return prev.filter((item) => item._id !== media._id);
      }
      if (prev.length >= remaining) return prev;
      return [...prev, media];
    });
  };

  const handleConfirm = () => {
    onConfirm(
      selected.map((media) => ({
        url: media.url || "",
        publicId: media.path,
        mediaId: media._id,
        alt: effectiveMediaAlt(media),
        isMain: false,
      })),
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col border border-[var(--border)]">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--surface-muted)] shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-[var(--text)] text-base">{t("Select Media")}</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {single
                ? t("Pick one image from the media library.")
                : t("Pick images from the media library to add to this product.")}
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label={t("Close picker")} className="close-x" />
        </div>

        {/* SEARCH */}
        <div className="p-4 sm:px-5 pb-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={query}
              // Codes are UPPERCASE — normalise as the user types so the
              // box itself shows the canonical form. The other matches
              // (name, alt text) are case-insensitive on the server, so
              // uppercasing the query loses nothing.
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              placeholder={t("Search by name, alt text or code…")}
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] transition-colors"
            />
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-2">
            {single
              ? selected.length > 0
                ? t("1 image selected.")
                : t("Select one image from the library.")
              : remaining === 0
                ? t("This product already has the maximum of {maxTotal} images.").replace("{maxTotal}", String(maxTotal))
                : t("{remaining} of {maxTotal} image slots available — {selected} selected.").replace("{remaining}", String(remaining)).replace("{maxTotal}", String(maxTotal)).replace("{selected}", String(selected.length))}
            {!single && limitHit && remaining > 0 && (
              <span className="text-[var(--primary)] font-semibold">
                {" "}
                {t("Slot limit reached; deselect one to pick another.")}
              </span>
            )}
          </p>
        </div>

        {/* RESULTS */}
        <div className="flex-1 overflow-y-auto p-4 sm:px-5 pt-2 min-h-40 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full">
          {error ? (
            <p className="text-xs text-red-500 py-6 text-center">{error}</p>
          ) : loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
              {t("Loading media…")}
            </div>
          ) : results.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic py-10 text-center">
              {query
                ? t("No media matches that search. Try a name, alt text or code.")
                : t("The media library is empty — upload an image first.")}
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {results.map((media) => {
                const added = isAdded(media);
                const picked = selected.some((item) => item._id === media._id);
                const disabled = added || (!picked && limitHit);
                const alt = effectiveMediaAlt(media);
                return (
                  <button
                    key={media._id || media.url}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(media)}
                    title={alt}
                    className={`relative rounded-xl overflow-hidden border text-left transition-all ${
                      picked
                        ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
                        : "border-[var(--border)]"
                    } ${disabled && !picked ? "opacity-55 cursor-not-allowed" : "hover:border-[var(--primary)] cursor-pointer"}`}
                  >
                    <div className="aspect-square bg-[var(--surface-muted)]">
                      {media.url ? (
                        <img
                          src={media.url}
                          alt={alt}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    {picked && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shadow">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                    {added && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/65 text-white text-[9px] font-bold">
                        {t("Added")}
                      </span>
                    )}
                    <span className="block px-1.5 py-1 bg-[var(--surface)]">
                      <span className="block text-[10px] font-semibold text-[var(--text)] truncate">
                        {media.originalName || media.filename || t("Untitled file")}
                      </span>
                      <span className="block text-[9px] text-[var(--text-muted)] truncate">
                        {media.code ? `${media.code} · ${alt}` : alt}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ACTIONS */}
        <div className="p-3 sm:p-4 border-t border-[var(--border)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 bg-[var(--surface-muted)] shrink-0">
          {single && onEditSelected && selected.length === 1 && (
            <Button
              variant="secondary"
              size="md"
              type="button"
              icon={Pencil}
              onClick={() => onEditSelected(selected[0])}
            >
              {t("Edit")}
            </Button>
          )}
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={selected.length === 0}
            onClick={handleConfirm}
          >
            {single ? t("Select Image") : t("Add Selected ({count})").replace("{count}", String(selected.length))}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MediaPickerModal;
