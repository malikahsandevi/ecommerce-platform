"use client";

import React, { useState } from "react";
import { Images, Star, UploadCloud, X } from "lucide-react";
import Button from "@/components/ui/Button";
import MediaPickerModal from "@/components/models/MediaPickerModal";
import { effectiveMediaAlt, mediaService } from "@/services/resourceRegistry";
import { extractApiError } from "@/services/api";
import { useLanguage } from "@/services/i18n";

/** One image in a product's gallery (the API's canonical entry shape). */
export interface GalleryImage {
  url: string;
  publicId?: string;
  mediaId?: string;
  alt?: string;
  isMain?: boolean;
  // Legacy names, still read when older records are edited.
  altText?: string;
  isPrimary?: boolean;
}

export const MAX_PRODUCT_IMAGES = 7;

export interface ProductMediaManagerProps {
  value: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  maxImages?: number;
}

const entryAlt = (entry: GalleryImage): string =>
  entry.alt ?? entry.altText ?? "";

/**
 * The product form's media manager: a strip of the chosen images (max 7)
 * with one MAIN image, fed two ways — uploading new files (signed direct
 * upload, which also registers them in the library) and the "Select
 * Media" library picker. Category/brand forms keep the single-image
 * field; this manager is product-only.
 */
export const ProductMediaManager: React.FC<ProductMediaManagerProps> = ({
  value,
  onChange,
  maxImages = MAX_PRODUCT_IMAGES,
}) => {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const images = Array.isArray(value) ? value : [];
  const atMax = images.length >= maxImages;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError("");
    try {
      const next = [...images];
      for (const file of Array.from(files)) {
        if (next.length >= maxImages) break;
        const uploaded = await mediaService.upload({ file, title: file.name, purpose: "products" });
        if (!uploaded?.url) throw new Error(t("The upload did not return a URL."));
        next.push({
          url: uploaded.url,
          publicId: uploaded.path,
          mediaId: uploaded._id,
          alt: effectiveMediaAlt(uploaded),
          isMain: next.length === 0,
        });
      }
      onChange(next);
    } catch (error) {
      setUploadError(extractApiError(error));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (index: number) => {
    const removedWasMain = Boolean(images[index]?.isMain ?? images[index]?.isPrimary);
    const next = images
      .filter((_, i) => i !== index)
      .map((entry) => ({ ...entry }));
    if (removedWasMain && next.length > 0) {
      next[0] = { ...next[0], isMain: true };
    }
    onChange(next);
  };

  const handleSetMain = (index: number) => {
    const flagged = images.map((entry, i) => ({ ...entry, isMain: i === index }));
    const main = flagged[index];
    onChange([main, ...flagged.filter((_, i) => i !== index)]);
  };

  const handlePickerConfirm = (picked: GalleryImage[]) => {
    const next = [...images];
    for (const entry of picked) {
      if (next.length >= maxImages) break;
      next.push({ ...entry, isMain: next.length === 0 });
    }
    onChange(next);
    setPickerOpen(false);
  };

  return (
    <div>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((entry, index) => {
            const isMain = Boolean(entry.isMain ?? entry.isPrimary ?? index === 0);
            return (
              <div
                key={`${entry.mediaId || entry.publicId || entry.url}-${index}`}
                className={`relative w-20 h-20 rounded-xl overflow-hidden border group ${
                  isMain ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : "border-[var(--border)]"
                }`}
              >
                <img
                  src={entry.url}
                  alt={entryAlt(entry)}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                {isMain && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-[var(--primary)] text-white text-[9px] font-bold shadow">
                    {t("Main")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  aria-label={t("Remove image")}
                  title={t("Remove image")}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
                {!isMain && (
                  <button
                    type="button"
                    onClick={() => handleSetMain(index)}
                    aria-label={t("Set as main image")}
                    title={t("Set as main image")}
                    className="absolute bottom-1 left-1 h-5 px-1.5 rounded-full bg-black/60 text-white flex items-center gap-1 text-[9px] font-semibold hover:bg-[var(--primary)] transition-colors cursor-pointer"
                  >
                    <Star className="w-3 h-3" />
                    {t("Main")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mb-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-4 text-center text-[11px] text-[var(--text-muted)]">
          {t("No images yet — upload files or select from the media library.")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium transition-colors ${
            uploading || atMax
              ? "opacity-50 pointer-events-none"
              : "cursor-pointer hover:border-[var(--primary)]"
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          {uploading ? t("Uploading…") : t("Upload")}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        <Button
          variant="secondary"
          size="md"
          type="button"
          icon={Images}
          disabled={atMax}
          onClick={() => setPickerOpen(true)}
          className="text-xs"
        >
          {t("Select Media")}
        </Button>

        <span className="text-[11px] text-[var(--text-muted)]">
          {t("{count} / {max} images").replace("{count}", String(images.length)).replace("{max}", String(maxImages))}
          {atMax && (
            <span className="text-[var(--primary)] font-semibold">
              {" "}
              — {t("Max {max} images").replace("{max}", String(maxImages))}
            </span>
          )}
        </span>
      </div>

      {uploadError && <p className="mt-1 text-[11px] text-red-500">{uploadError}</p>}

      <MediaPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={handlePickerConfirm}
        existing={images}
        maxTotal={maxImages}
      />
    </div>
  );
};

export default ProductMediaManager;
