import { Download, Plus, RefreshCcwDot } from "lucide-react";

/** Shape of a record from GET /media (plus the derived `status` the list adapter adds). */
export interface MediaItem {
  code?: string;
  _id?: string;
  filename?: string;
  originalName?: string;
  url?: string;
  path?: string;
  mimeType?: string;
  size?: number;
  extension?: string;
  dimensions?: { width?: number; height?: number };
  storageType?: string;
  title?: string;
  altText?: string;
  description?: string;
  isActive?: boolean;
  status?: string;
  createdAt?: string;
}

const formatSize = (bytes?: number): string => {
  if (!bytes && bytes !== 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const displayName = (media: MediaItem): string =>
  media.originalName || media.filename || "Untitled file";

/** The alt a media item is shown with: its written alt, else its name. */
const effectiveAlt = (media: MediaItem): string =>
  media.altText || media.originalName || media.filename || "";

const dimensionsText = (media: MediaItem): string =>
  media.dimensions?.width && media.dimensions?.height
    ? `${media.dimensions.width} × ${media.dimensions.height}`
    : "—";

const statusOf = (media: MediaItem): string =>
  media.status || (media.isActive === false ? "inactive" : "active");

export const mediaConfig = {
  routeTitle: "Media",

  // Static header-strip label (the old first tab's wording). Display
  // only — status filtering lives in the FilterBar dropdown.
  allLabel: "All Media",

  buttons: [
    {
      id: "export",
      label: "Export Media",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Upload Media",
      icon: Plus,
      variant: "primary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "refresh",
      label: "Refresh Data",
      icon: RefreshCcwDot,
      variant: "primary" as const,
      show: true,
      disabled: false,
    },
  ],

  searchFields: ["originalName", "filename", "altText", "mimeType", "extension", "code"],

  columnHeaders: {
    _id: "ID",
    name: "Name",
    type: "Type",
    size: "Size",
    dimensions: "Dimensions",
    status: "Status",
  },

  // Sortable header columns (Part 4) — values come from the RAW row
  // (Size sorts by bytes, not the formatted cell).
  sortableColumns: {
    name: { get: (media: MediaItem) => displayName(media), type: "string" },
    size: { field: "size", type: "number" },
    status: { get: (media: MediaItem) => statusOf(media), type: "string" },
  },

  mapTableData: (media: MediaItem) => ({
    id: media._id,
    _id: media._id,
    code: media.code,
    image: media.mimeType?.startsWith("image/") ? media.url || "" : "",
    name: displayName(media),
    type: media.mimeType || "—",
    size: formatSize(media.size),
    dimensions: dimensionsText(media),
    status: statusOf(media),
  }),

  mapDetailData: (media: MediaItem) => ({
    id: media._id,
    code: media.code,
    title: displayName(media),
    status: statusOf(media),
    image: media.mimeType?.startsWith("image/") ? media.url : undefined,
    shortDescription: effectiveAlt(media) || media.mimeType || "",
    attributes: {
      "File Name": displayName(media),
      URL: media.url || "—",
      "Media Type": media.mimeType || "—",
      Extension: media.extension || "—",
      Size: formatSize(media.size),
      Dimensions: dimensionsText(media),
      Storage: media.storageType || "—",
      "Alt Text": effectiveAlt(media) || "—",
      Uploaded: media.createdAt ? new Date(media.createdAt).toLocaleDateString() : "—",
    },
    // The detail panel renders a copy button after the URL value; it copies
    // the FULL url even though the visible value is truncated.
    copyableAttributes: media.url ? { URL: media.url } : undefined,
    description: media.description || "",
  }),

  // The media page uses the upload modal rather than the generic form; this
  // mapper only exists so the shared page plumbing has a fallback.
  mapFormData: (media?: MediaItem) => ({
    name: media ? displayName(media) : "",
    url: media?.url || "",
    altText: media?.altText || "",
  }),

  // Table Filters — lifecycle status. (The list page appends a
  // file-type filter whose options derive from the loaded records.)
  filters: [
    {
      id: "status",
      placeholder: "All Statuses",
      options: [
        { label: "All Statuses", value: "all" },
        { label: "Published", value: "published" },
        { label: "Draft", value: "draft" },
        { label: "Archived", value: "archived" },
      ],
    },
  ],

  categoryOptions: [],
  brandOptions: [],
  statusOptions: [
    { label: "Published", value: "published" },
    { label: "Draft", value: "draft" },
    { label: "Archived", value: "archived" },
  ],
};
