"use client";

import React, { useState } from "react";

/**
 * The ONE person disc for the whole admin (Ahsan's standing rule:
 * wherever a person's name or detail is rendered, their profile image
 * rides beside it). The person's uploaded photo when one exists and
 * loads; otherwise — no photo, the stored placeholder value, or a
 * photo that fails to load — an initials disc in the house placeholder
 * style (--primary-soft disc, --primary-dark initials; the TopBar /
 * New Customers pattern). A surface never renders empty space beside
 * a name, and the disc's size is fixed by the caller so the name's
 * position never shifts between rows.
 */

/** The User schema's stored placeholder — it is not a photo. */
const NO_PHOTO_VALUE = "default-avatar.png";

/** A person's initials — first word + last word; a single word gives
 *  its first two letters; nothing usable gives "N". */
export function personInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "N";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The loadable photo URL inside a stored avatar value, or null when
 *  the value means "no photo" (empty, or the schema placeholder). */
export function personPhotoSrc(
  avatar?: string | null,
): string | null {
  const src = typeof avatar === "string" ? avatar.trim() : "";
  if (!src || src === NO_PHOTO_VALUE) return null;
  return src;
}

export const PersonAvatar: React.FC<{
  /** The stored avatar value (a URL, or the placeholder / empty). */
  src?: string | null;
  /** The person's display name — alt text and the initials source. */
  name: string;
  /** Disc geometry, matched to the surface's existing size. */
  sizeClass?: string;
  /** Initials size, matched to the disc size. */
  textClass?: string;
}> = ({ src, name, sizeClass = "w-8 h-8", textClass = "text-[10px]" }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const photo = personPhotoSrc(src);
  if (photo && failedSrc !== photo) {
    return (
      <img
        src={photo}
        alt={name}
        loading="lazy"
        decoding="async"
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-[var(--border)]`}
        onError={() => setFailedSrc(photo)}
      />
    );
  }
  return (
    <span
      className={`${sizeClass} rounded-full bg-[var(--primary-soft)] text-[var(--primary-dark)] flex items-center justify-center ${textClass} font-bold shrink-0`}
      aria-label={name}
    >
      {personInitials(name)}
    </span>
  );
};

export default PersonAvatar;
