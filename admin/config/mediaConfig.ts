import { Download, Plus, RefreshCcwDot } from "lucide-react";

/** Shape of a record from GET /media (plus the derived `status` the list adapter adds). */
export interface MediaItem {
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

const dimensionsText = (media: MediaItem): string =>
  media.dimensions?.width && media.dimensions?.height
    ? `${media.dimensions.width} × ${media.dimensions.height}`
    : "—";

const statusOf = (media: MediaItem): string =>
  media.status || (media.isActive === false ? "inactive" : "active");

export const mediaConfig = {
  routeTitle: "Media",

  tabs: ["All Media", "Active", "Inactive"],

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

  searchFields: ["originalName", "filename", "altText", "mimeType", "extension"],

  columnHeaders: {
    _id: "ID",
    name: "File Name",
    type: "Type",
    size: "Size",
    dimensions: "Dimensions",
    status: "Status",
  },

  mapTableData: (media: MediaItem) => ({
    id: media._id,
    _id: media._id,
    image: media.mimeType?.startsWith("image/") ? media.url || "" : "",
    name: displayName(media),
    type: media.mimeType || "—",
    size: formatSize(media.size),
    dimensions: dimensionsText(media),
    status: statusOf(media),
  }),

  mapDetailData: (media: MediaItem) => ({
    id: media._id,
    title: displayName(media),
    status: statusOf(media),
    image: media.mimeType?.startsWith("image/") ? media.url : undefined,
    shortDescription: media.altText || media.mimeType || "",
    attributes: {
      "File Name": displayName(media),
      URL: media.url || "—",
      "MIME Type": media.mimeType || "—",
      Extension: media.extension || "—",
      Size: formatSize(media.size),
      Dimensions: dimensionsText(media),
      Storage: media.storageType || "—",
      "Alt Text": media.altText || "—",
      Uploaded: media.createdAt ? new Date(media.createdAt).toLocaleDateString() : "—",
    },
    description: media.description || "",
  }),

  // The media page uses the upload modal rather than the generic form; this
  // mapper only exists so the shared page plumbing has a fallback.
  mapFormData: (media?: MediaItem) => ({
    name: media ? displayName(media) : "",
    url: media?.url || "",
    altText: media?.altText || "",
  }),

  filters: [],

  categoryOptions: [],
  brandOptions: [],
  statusOptions: [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ],
};
