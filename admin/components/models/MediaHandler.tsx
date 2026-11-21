import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  X,
  Info,
  Music,
  FileText,
  Box,
  AlertCircle,
  Image as ImageIcon,
  Trash2,
  Check,
  Lock,
  Zap,
} from "lucide-react";
import Button from "@/components/ui/Button";

/** Per-file image optimization settings (add mode, images only). */
export interface ImageOptimization {
  convert: boolean;
  format: "webp" | "jpeg" | "png" | "original";
  compress: boolean;
}

export interface MediaItem {
  id?: number | string;
  _id?: string;
  /** The raw picked file — present only for not-yet-uploaded items. */
  file?: File;
  title: string;
  altText: string;
  caption: string;
  description: string;
  dimensions: string;
  size: string;
  type: string;
  ext: string;
  date: string;
  previewUrl: string;
  mediaCategory: "image" | "video" | "audio" | "model3d" | "document";
  /** Library status from the Media schema: published | draft | archived. */
  status: string;
  /** Circular-tick selection state in the upload queue (add mode). */
  ticked?: boolean;
  /** This file's image optimization settings (add mode, images only). */
  opt?: ImageOptimization;
  /**
   * Effective upload facts once client-side processing produced the file
   * that will actually be uploaded. Set only when processing changes the
   * upload (different format, or a smaller same-format re-encode).
   */
  effSize?: number;
  effType?: string;
  effName?: string;
  /** `${id}|${targetMime}` the eff* fields belong to — guards stale results. */
  procKey?: string;
  /** Processing was attempted for the current settings and failed. */
  procFailed?: boolean;
}

interface MediaHandlerModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  initialData?: any | null;
  onClose: () => void;
  onSave: (mediaData: any) => void;
  onDelete?: (mediaId: any) => void;
}

type OptScope = "active" | "selected" | "all";

const DEFAULT_OPT: ImageOptimization = {
  convert: true,
  format: "webp",
  compress: true,
};

const FORMAT_OPTIONS: { value: ImageOptimization["format"]; label: string }[] = [
  { value: "webp", label: "WebP" },
  { value: "jpeg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "original", label: "Keep Original" },
];

const FORMAT_MIME: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  png: "image/png",
};

const MIME_LABEL: Record<string, string> = {
  "image/webp": "WebP",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

/** Source formats a canvas re-encode can reproduce at maximum quality. */
const REENCODABLE = ["image/png", "image/jpeg", "image/webp"];

const SCROLLBAR_CLASSES =
  "[&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-[4px] [&::-webkit-scrollbar-button]:hidden [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent]";

const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/**
 * The MIME type this item would be processed into, or null when its
 * settings leave the file untouched (no conversion, no compression, or a
 * source format canvas cannot re-encode).
 */
const targetMimeFor = (item: MediaItem): string | null => {
  if (item.mediaCategory !== "image" || !item.file) return null;
  const opt = item.opt ?? DEFAULT_OPT;
  if (opt.convert && opt.format !== "original") {
    return FORMAT_MIME[opt.format] || null;
  }
  if (opt.compress && REENCODABLE.includes(item.file.type)) {
    return item.file.type;
  }
  return null;
};

const processedNameFor = (name: string, mime: string): string => {
  const ext =
    mime === "image/webp" ? ".webp" : mime === "image/jpeg" ? ".jpg" : ".png";
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base}${ext}`;
};

/**
 * Re-encodes an image at its natural dimensions through a canvas at
 * MAXIMUM quality (1.0). The export also strips embedded metadata, which
 * is where the size saving comes from when quality stays at max.
 */
const canvasProcessImage = (file: File, targetMime: string): Promise<Blob | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        if (targetMime === "image/jpeg") {
          // JPEG has no alpha — flatten transparency onto white.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          },
          targetMime,
          1.0,
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

/** Circular tick — filled orange with a white check, or a hollow ring. */
const TickCircle: React.FC<{ on: boolean; onSurface?: boolean }> = ({
  on,
  onSurface,
}) => (
  <span
    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
      on
        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
        : onSurface
          ? "border-[var(--text-muted)] bg-transparent text-transparent"
          : "border-gray-400 bg-white/90 text-transparent"
    }`}
  >
    <Check size={12} strokeWidth={4} />
  </span>
);

const Toggle: React.FC<{
  on: boolean;
  onToggle: () => void;
  label: string;
}> = ({ on, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
      on ? "bg-[var(--primary)]" : "bg-[var(--border)]"
    }`}
  >
    <span
      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
        on ? "left-[22px]" : "left-0.5"
      }`}
    />
  </button>
);

const MediaHandlerModal: React.FC<MediaHandlerModalProps> = ({
  isOpen,
  mode,
  initialData,
  onClose,
  onSave,
  onDelete,
}) => {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [scope, setScope] = useState<OptScope>("selected");
  const [isPreparing, setIsPreparing] = useState(false);

  /** Processed blobs by `${itemId}|${targetMime}`; null = processing failed. */
  const processedBlobsRef = useRef<Map<string, Blob | null>>(new Map());
  const processingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      if (mode === "edit" && initialData) {
        setMediaList([
          {
            id: initialData._id || initialData.id || Date.now(),
            title: initialData.title || initialData.name || "",
            altText: initialData.altText || "",
            caption: initialData.caption || "",
            description: initialData.description || "",
            dimensions: initialData.dimensions || "N/A",
            size: initialData.size || "0 MB",
            type: initialData.type || "application/octet-stream",
            ext: initialData.ext || "",
            date: initialData.date || new Date().toISOString().split("T")[0],
            previewUrl: initialData.previewUrl || initialData.url || "",
            mediaCategory: initialData.mediaCategory || "image",
            status: initialData.status || "published",
          },
        ]);
        setSelectedIndex(0);
      } else {
        setMediaList([]);
        setSelectedIndex(0);
      }
      setErrorMessage("");
      setScope("selected");
      setIsPreparing(false);
    }
  }, [isOpen, mode, initialData]);

  const currentItem = mediaList[selectedIndex];
  const tickedCount = mediaList.filter((item) => item.ticked).length;
  const allTicked = mediaList.length > 0 && tickedCount === mediaList.length;

  /**
   * The upload this item will actually produce once processing is taken
   * into account: `{ type, size }` for a processed file (size undefined
   * while a cross-format conversion is still processing), or null when
   * the original file goes up unchanged.
   */
  const effectiveOf = (item: MediaItem): { type: string; size?: number } | null => {
    if (item.mediaCategory !== "image" || !item.file || item.procFailed) {
      return null;
    }
    const mime = targetMimeFor(item);
    if (!mime) return null;
    const key = `${item.id}|${mime}`;
    if (item.procKey === key) {
      // Processing finished for the current settings: the upload only
      // changes when a smaller processed file was produced.
      return item.effType ? { type: item.effType, size: item.effSize } : null;
    }
    // Not processed yet — a pending cross-format conversion is expected
    // to change the upload; its real size lands when processing does.
    if (mime !== item.file.type) return { type: mime, size: undefined };
    return null;
  };

  const willOptimize = (item: MediaItem): boolean => effectiveOf(item) !== null;

  const getProcessedBlob = async (
    item: MediaItem,
    mime: string,
  ): Promise<Blob | null> => {
    const key = `${item.id}|${mime}`;
    if (processedBlobsRef.current.has(key)) {
      return processedBlobsRef.current.get(key) ?? null;
    }
    const blob = item.file ? await canvasProcessImage(item.file, mime) : null;
    processedBlobsRef.current.set(key, blob);
    return blob;
  };

  // Process queued images in the background whenever their settings make
  // them eligible, so the before/after sizes and badges show real numbers.
  useEffect(() => {
    if (!isOpen || mode !== "add") return;
    mediaList.forEach((item) => {
      const mime = targetMimeFor(item);
      if (!mime || !item.file) return;
      const key = `${item.id}|${mime}`;
      if (item.procKey === key || processingKeysRef.current.has(key)) return;
      processingKeysRef.current.add(key);
      const file = item.file;
      canvasProcessImage(file, mime).then((blob) => {
        processingKeysRef.current.delete(key);
        processedBlobsRef.current.set(key, blob);
        setMediaList((prev) =>
          prev.map((it) => {
            if (it.id !== item.id) return it;
            // Settings moved on while this was processing — the newer
            // key's run owns the item now.
            if (`${it.id}|${targetMimeFor(it)}` !== key) return it;
            if (!blob) {
              return {
                ...it,
                procKey: key,
                procFailed: true,
                effSize: undefined,
                effType: undefined,
                effName: undefined,
              };
            }
            // Optimization must never make a file BIGGER (a max-quality
            // WebP of an already-tight JPEG can grow) — when the processed
            // file is not smaller, the original uploads instead.
            const useProcessed = blob.size < file.size;
            return {
              ...it,
              procKey: key,
              procFailed: false,
              effSize: useProcessed ? blob.size : undefined,
              effType: useProcessed ? mime : undefined,
              effName: useProcessed ? processedNameFor(file.name, mime) : undefined,
            };
          }),
        );
      });
    });
  }, [isOpen, mode, mediaList]);

  if (!isOpen) return null;

  const ALLOWED_EXTENSIONS = [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "csv",
    "glb",
    "gltf",
  ];

  const validateAndGetCategory = (
    file: File,
  ): MediaItem["mediaCategory"] | null => {
    const fileType = file.type.toLowerCase();
    const extension = file.name.split(".").pop()?.toLowerCase() || "";

    if (fileType.startsWith("image/")) return "image";
    if (fileType.startsWith("video/")) return "video";
    if (fileType.startsWith("audio/")) return "audio";
    if (ALLOWED_EXTENSIONS.includes(extension)) {
      return extension === "glb" || extension === "gltf"
        ? "model3d"
        : "document";
    }
    return null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;

    setErrorMessage("");
    const validItems: MediaItem[] = [];
    let hasInvalidFiles = false;

    files.forEach((file, i) => {
      const category = validateAndGetCategory(file);

      if (!category) {
        hasInvalidFiles = true;
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      const newItem: MediaItem = {
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        title: file.name,
        altText: file.name.split(".")[0].replace(/[-_]/g, " "),
        caption: "",
        description: "",
        dimensions:
          category === "image" || category === "video" ? "Detecting..." : "N/A",
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        type: file.type || `application/${file.name.split(".").pop()}`,
        ext: `.${file.name.split(".").pop()}`,
        date: new Date().toISOString().split("T")[0],
        previewUrl: previewUrl,
        mediaCategory: category,
        status: "published",
        ticked: true,
        opt: { ...DEFAULT_OPT },
      };

      if (category === "image") {
        const img = new Image();
        img.src = previewUrl;
        img.onload = () => {
          setMediaList((prev) =>
            prev.map((item) =>
              item.id === newItem.id
                ? {
                    ...item,
                    dimensions: `${img.naturalWidth} x ${img.naturalHeight} px`,
                  }
                : item,
            ),
          );
        };
      }

      validItems.push(newItem);
    });

    if (hasInvalidFiles) {
      setErrorMessage(
        "Some unsupported files were rejected. Only Images, Videos, Audios and Documents are allowed.",
      );
    }

    if (validItems.length > 0) {
      if (mediaList.length === 0) {
        // Land on the first IMAGE in the batch (not simply the first
        // file) so the optimization panel opens on something it can
        // actually optimize.
        const firstImageIdx = validItems.findIndex(
          (item) => item.mediaCategory === "image",
        );
        setSelectedIndex(firstImageIdx >= 0 ? firstImageIdx : 0);
      }
      setMediaList((prev) => [...prev, ...validItems]);
    }
    // Allow picking the same file again later.
    e.target.value = "";
  };

  const handleInputChange = (field: keyof MediaItem, value: string) => {
    if (selectedIndex === undefined || !mediaList[selectedIndex]) return;
    setMediaList((prev) => {
      const updated = [...prev];
      updated[selectedIndex] = { ...updated[selectedIndex], [field]: value };
      return updated;
    });
  };

  const toggleTick = (index: number) => {
    setMediaList((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, ticked: !item.ticked } : item,
      ),
    );
  };

  const handleSelectAllToggle = () => {
    const next = !allTicked;
    setMediaList((prev) => prev.map((item) => ({ ...item, ticked: next })));
  };

  /** Drops an item's cached processing state (add mode). */
  const clearProcessingCacheFor = (item: MediaItem) => {
    const prefix = `${item.id}|`;
    processedBlobsRef.current.forEach((_, key) => {
      if (key.startsWith(prefix)) processedBlobsRef.current.delete(key);
    });
    processingKeysRef.current.forEach((key) => {
      if (key.startsWith(prefix)) processingKeysRef.current.delete(key);
    });
  };

  /** Removes one queued file (add mode) and keeps the active index sane. */
  const removeQueueItem = (index: number) => {
    const item = mediaList[index];
    if (item) {
      if (item.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
      clearProcessingCacheFor(item);
    }
    setMediaList((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) {
        return Math.max(0, Math.min(prev, mediaList.length - 2));
      }
      return prev;
    });
  };

  /** Clears the whole upload queue (add mode "Remove All"). */
  const handleRemoveAll = () => {
    mediaList.forEach((item) => {
      if (item.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    processedBlobsRef.current.clear();
    processingKeysRef.current.clear();
    setMediaList([]);
    setSelectedIndex(0);
  };

  /** Writes a settings patch to every file in the current scope. */
  const applyOpt = (patch: Partial<ImageOptimization>) => {
    setMediaList((prev) => {
      // "This Image" targets the active image; when the active file is
      // not an image it falls back to the first queued image.
      const activeItem = prev[selectedIndex];
      const primaryIndex =
        activeItem &&
        activeItem.mediaCategory === "image" &&
        activeItem.file
          ? selectedIndex
          : prev.findIndex(
              (it) => it.mediaCategory === "image" && it.file,
            );
      const targets = new Set<number>();
      if (scope === "active") {
        if (primaryIndex >= 0) targets.add(primaryIndex);
      } else if (scope === "all") {
        prev.forEach((_, i) => targets.add(i));
      } else {
        prev.forEach((item, i) => {
          if (item.ticked) targets.add(i);
        });
        // Nothing ticked — fall back to the primary image so the control
        // the user is looking at still responds.
        if (targets.size === 0 && primaryIndex >= 0) {
          targets.add(primaryIndex);
        }
      }
      return prev.map((item, i) =>
        targets.has(i)
          ? { ...item, opt: { ...(item.opt ?? DEFAULT_OPT), ...patch } }
          : item,
      );
    });
  };

  const handleSaveClick = async () => {
    if (mode === "edit") {
      if (currentItem) onSave(currentItem);
      return;
    }
    if (!mediaList.length || isPreparing) return;
    setIsPreparing(true);
    try {
      // Every queued item uploads: images whose settings optimize them
      // send their processed file, everything else sends the original.
      const payloads: MediaItem[] = [];
      for (const item of mediaList) {
        let file = item.file;
        if (file && item.mediaCategory === "image") {
          const mime = targetMimeFor(item);
          if (mime) {
            const blob = await getProcessedBlob(item, mime);
            if (blob && blob.size < file.size) {
              file = new File([blob], processedNameFor(file.name, mime), {
                type: mime,
              });
            }
          }
        }
        payloads.push({ ...item, file });
      }
      onSave(payloads);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleDeleteClick = () => {
    if (!currentItem) return;
    if (onDelete) {
      onDelete(currentItem.id || currentItem._id);
    }
    const updatedList = mediaList.filter((_, idx) => idx !== selectedIndex);
    setMediaList(updatedList);
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  };

  const renderThumbnail = (item: MediaItem) => {
    switch (item.mediaCategory) {
      case "image":
        return (
          <img
            src={item.previewUrl}
            alt={item.altText || item.title || ""}
            className="w-full h-full object-cover"
          />
        );
      case "video":
        return (
          <video src={item.previewUrl} className="w-full h-full object-cover" />
        );
      case "audio":
        return <Music className="w-8 h-8 text-[var(--primary)]" />;
      case "model3d":
        return <Box className="w-8 h-8 text-[var(--text-soft)]" />;
      default:
        return <FileText className="w-8 h-8 text-[var(--text-muted)]" />;
    }
  };

  const renderDropZone = (className: string) => (
    <label
      className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] ${className}`}
    >
      <Upload className="w-8 h-8 sm:w-10 sm:h-10 mb-2 text-[var(--primary)]" />
      <p className="text-xs sm:text-sm font-medium text-center text-[var(--text)]">
        DRAG & DROP MEDIA FILES HERE
      </p>
      <p className="text-[11px] sm:text-xs mt-1 text-center text-[var(--text-muted)]">
        Accepted: Images, Videos, Audio & Documents
      </p>
      <input
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.glb,.gltf"
        className="hidden"
        onChange={handleFileUpload}
      />
    </label>
  );

  const renderDetailsColumn = (widthClass: string) => (
    <div
      className={`w-full ${widthClass} p-3 flex flex-col gap-3 overflow-y-auto bg-[var(--background)] ${SCROLLBAR_CLASSES} border rounded-xl border-[var(--border)]`}
    >
      {currentItem ? (
        <>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4 text-[var(--text-muted)]">
              MEDIA DETAILS
            </h3>
            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs mb-1 text-[var(--text-soft)]">
                  Title / Name
                </label>
                <input
                  type="text"
                  value={currentItem.title}
                  onChange={(e) =>
                    handleInputChange("title", e.target.value)
                  }
                  className="w-full rounded-md px-3 py-1.5 text-xs focus:outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-xs mb-1 text-[var(--text-soft)]">
                  Alt Text (SEO){" "}
                  <Info size={12} className="text-[var(--text-muted)]" />
                </label>
                <input
                  type="text"
                  value={currentItem.altText}
                  onChange={(e) =>
                    handleInputChange("altText", e.target.value)
                  }
                  className="w-full rounded-md px-3 py-1.5 text-xs focus:outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-[var(--text-soft)]">
                  Caption
                </label>
                <textarea
                  rows={2}
                  value={currentItem.caption}
                  onChange={(e) =>
                    handleInputChange("caption", e.target.value)
                  }
                  className="w-full rounded-md px-3 py-1.5 text-xs focus:outline-none resize-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-[var(--text-soft)]">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={currentItem.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  className="w-full rounded-md px-3 py-1.5 text-xs focus:outline-none resize-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-[var(--text-soft)]">
                  Status
                </label>
                <select
                  value={currentItem.status || "published"}
                  onChange={(e) => handleInputChange("status", e.target.value)}
                  className="w-full rounded-md px-3 py-1.5 text-xs focus:outline-none bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)]"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--text-muted)]">
              System Auto-Generated Info (Read-only)
            </h3>
            <div className="space-y-2 text-xs text-[var(--text-soft)]">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Category</span>
                <span className="font-mono capitalize">
                  {currentItem.mediaCategory}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">
                  Dimensions
                </span>
                <span className="font-mono">
                  {currentItem.dimensions}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">
                  File Size
                </span>
                <span className="font-mono">{currentItem.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">
                  Media Type
                </span>
                <span className="font-mono">{currentItem.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">
                  Upload Date
                </span>
                <span className="font-mono">{currentItem.date}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 min-h-[150px]">
          <Info className="w-10 h-10 mb-2 opacity-30 text-[var(--text-muted)]" />
          <p className="text-xs font-medium text-[var(--text-soft)]">
            No details available
          </p>
          <p className="text-[11px] mt-1 text-[var(--text-muted)]">
            Upload media files to view and edit details here.
          </p>
        </div>
      )}
    </div>
  );

  /* ------------------------- Add-mode pieces ------------------------- */

  const badgeOf = (item: MediaItem) => {
    if (item.mediaCategory !== "image" || !item.file) return null;
    const eff = effectiveOf(item);
    if (eff) {
      return (
        <span className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-full bg-green-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          <Zap size={9} className="fill-current" />
          {MIME_LABEL[eff.type] || "Optimized"}
        </span>
      );
    }
    return (
      <span className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
        Original
      </span>
    );
  };

  const renderUploadedPanel = () => (
    <div className="flex min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Uploaded Images
        </h3>
        <div className="flex items-center gap-3">
          {mediaList.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAllToggle}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--primary)]"
            >
              <TickCircle on={allTicked} onSurface />
              {allTicked ? "Deselect All" : "Select All"}
            </button>
          )}
          <span className="text-[11px] text-[var(--text-muted)]">
            {mediaList.length} {mediaList.length === 1 ? "file" : "files"}
            {mediaList.length > 3 ? " — scroll →" : ""}
          </span>
        </div>
      </div>

      {mediaList.length > 0 ? (
        <div
          className={`mt-3 flex flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-2 ${SCROLLBAR_CLASSES}`}
        >
          {mediaList.map((item, index) => (
            <div
              key={item.id}
              onClick={() => setSelectedIndex(index)}
              className={`group relative aspect-square h-full shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all bg-[var(--background)] ${
                selectedIndex === index
                  ? "border-[var(--primary)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex h-full w-full items-center justify-center overflow-hidden">
                {renderThumbnail(item)}
              </div>
              <button
                type="button"
                aria-label={item.ticked ? "Deselect file" : "Select file"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTick(index);
                }}
                className="absolute left-1.5 top-1.5 z-10"
              >
                <TickCircle on={!!item.ticked} />
              </button>
              {badgeOf(item)}
              {/* Hover / active remove bar — sits just above the filename
                  strip so both stay readable. */}
              <div
                className={`absolute inset-x-0 bottom-[17px] z-10 transition-all duration-150 ${
                  selectedIndex === index
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                }`}
              >
                <button
                  type="button"
                  aria-label={`Remove ${item.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeQueueItem(index);
                  }}
                  className="flex w-full items-center justify-center gap-1 bg-red-600/90 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <Trash2 size={11} />
                  Remove
                </button>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1.5 py-0.5 text-center text-[9px] truncate text-[var(--text-soft)]">
                {item.title}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-center">
          <ImageIcon className="mb-2 h-10 w-10 opacity-40 text-[var(--text-muted)]" />
          <p className="text-xs sm:text-sm font-medium text-[var(--text)]">
            No media yet
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
            Upload media to see details and manage attributes.
          </p>
        </div>
      )}
    </div>
  );

  const renderOptimizationPanel = () => {
    const imageItems = mediaList.filter(
      (item) => item.mediaCategory === "image" && item.file,
    );
    const activeIsImage = !!(
      currentItem &&
      currentItem.mediaCategory === "image" &&
      currentItem.file
    );
    // The panel always works on an image when one is queued: the active
    // image, or the first queued image when the active file is something
    // else (video, document…). Only a queue with zero images shows the
    // "images only" note.
    const displayItem: MediaItem | null =
      (activeIsImage ? currentItem : imageItems[0]) ?? null;
    const usingFallback = !!displayItem && !activeIsImage;
    const panelOpt: ImageOptimization = displayItem?.opt ?? DEFAULT_OPT;
    const optimizedCount = imageItems.filter(willOptimize).length;
    const originalCount = imageItems.length - optimizedCount;
    const totalOriginal = mediaList.reduce(
      (sum, item) => sum + (item.file?.size ?? 0),
      0,
    );
    const totalEffective = mediaList.reduce((sum, item) => {
      if (!item.file) return sum;
      const eff = effectiveOf(item);
      return sum + (eff?.size ?? item.file.size);
    }, 0);
    const displayEff = displayItem ? effectiveOf(displayItem) : null;
    const displayOriginalSize = displayItem?.file?.size;
    const displaySavedPct =
      displayEff?.size !== undefined && displayOriginalSize
        ? Math.round((1 - displayEff.size / displayOriginalSize) * 100)
        : null;

    return (
      <div
        className={`flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5 p-3 ${SCROLLBAR_CLASSES}`}
      >
        <h3 className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
          <Zap size={14} className="fill-current" />
          Image Optimization
          <span className="rounded-full bg-[var(--primary)] px-1.5 py-px text-[9px] font-bold text-white">
            NEW
          </span>
        </h3>

        {mediaList.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            Add an image to optimize it before upload.
          </p>
        ) : imageItems.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            Optimization applies to images only.
          </p>
        ) : (
          <>
            {/* Scope */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-soft)]">
                Apply to:
              </span>
              {(
                [
                  { value: "active", label: "This Image" },
                  { value: "selected", label: `Selected (${tickedCount})` },
                  { value: "all", label: "All Images" },
                ] as { value: OptScope; label: string }[]
              ).map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setScope(chip.value)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-all ${
                    scope === chip.value
                      ? "border-[var(--primary)] bg-[var(--primary)] font-semibold text-white"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)]"
                  }`}
                >
                  {chip.label}
                  {scope === chip.value && <Check size={11} strokeWidth={3.5} />}
                </button>
              ))}
            </div>

            {/* Convert */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  Convert to WebP
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Smaller size, same quality — pages load faster
                </p>
              </div>
              <Toggle
                on={panelOpt.convert}
                onToggle={() => applyOpt({ convert: !panelOpt.convert })}
                label="Convert to WebP"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={!panelOpt.convert}
                  onClick={() => applyOpt({ format: option.value })}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-all ${
                    panelOpt.format === option.value
                      ? "border-[var(--primary)] bg-[var(--primary)] font-semibold text-white"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)]"
                  } ${!panelOpt.convert ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {option.label}
                  {panelOpt.format === option.value && (
                    <Check size={11} strokeWidth={3.5} />
                  )}
                </button>
              ))}
            </div>

            {/* Compress */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  Compress Image
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Quality stays at MAX — only the size goes down
                </p>
              </div>
              <Toggle
                on={panelOpt.compress}
                onToggle={() => applyOpt({ compress: !panelOpt.compress })}
                label="Compress Image"
              />
            </div>

            {/* Locked quality bar */}
            <div>
              <div className="h-1.5 rounded-full bg-[var(--primary)]" />
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>Smaller size</span>
                <span className="flex items-center gap-1 font-semibold text-[var(--primary)]">
                  Quality: MAXIMUM (100%)
                  <Lock size={10} />
                </span>
                <span>Full quality</span>
              </div>
            </div>

            {/* Before / after — shows the display image (the active
                image, or the first queued image as a fallback). */}
            {usingFallback && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Selected file is not an image — showing the first image.
              </p>
            )}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="max-w-[40%] truncate font-medium text-[var(--text)]">
                  {displayItem?.title}
                </span>
                {displayItem?.procFailed ? (
                  <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-soft)]">
                    Original — processing failed
                  </span>
                ) : displayEff ? (
                  <span className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)] line-through">
                      {formatBytes(displayOriginalSize)}
                    </span>
                    <span>→</span>
                    <span className="font-bold text-green-600">
                      {displayEff.size !== undefined
                        ? `~${formatBytes(displayEff.size)} ${MIME_LABEL[displayEff.type] || ""}`
                        : `Converting to ${MIME_LABEL[displayEff.type] || "optimized"}…`}
                    </span>
                    {displaySavedPct !== null && displaySavedPct > 0 && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                        −{displaySavedPct}%
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-soft)]">
                      {formatBytes(displayOriginalSize)}
                    </span>
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-soft)]">
                      Original
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--border)] pt-2">
                <span className="font-semibold text-[var(--text)]">
                  Total ({optimizedCount} optimized, {originalCount} original)
                </span>
                <span className="font-medium text-[var(--text-soft)]">
                  {formatBytes(totalOriginal)} →{" "}
                  <span className="font-bold text-[var(--primary)]">
                    ~{formatBytes(totalEffective)}
                  </span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  /* ------------------------------ Render ------------------------------ */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="w-full max-w-5xl rounded-xl overflow-hidden flex flex-col h-[95vh] sm:max-h-[90vh] shadow-[0_0_20px_rgba(249,115,22,0.15)] bg-[var(--surface)] text-[var(--text)] border border-[var(--primary)]">
        {/* Header */}
        <div className="flex items-center justify-between p-3 shrink-0 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-[var(--text)]">
              {mode === "edit" ? "Edit Media Details" : "Media Upload Panel"}
            </h2>
            <p className="text-[11px] sm:text-xs text-[var(--text-muted)]">
              Strictly accepts Images, Videos, Audios, and Documents only.
            </p>
          </div>
          <Button variant="ghost" size="md" className="border-none" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        {mode === "edit" ? (
          /* ------------------------- Edit mode (unchanged layout) ------------------------- */
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden p-3 gap-3">
            {/* Left Panel */}
            <div className="w-full md:w-1/2 flex flex-col gap-3 overflow-y-auto shrink-0 md:shrink overflow-hidden">
              {errorMessage && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-md text-xs">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {renderDropZone("h-55 shrink-0")}

              {/* Gallery Grid / Empty State */}
              <div className="border border-dashed rounded-xl border-[var(--border)] bg-[var(--background)] h-full max-h-35 md:max-h-full overflow-hidden p-3 pr-1">
                {mediaList.length > 0 ? (
                  <div className={`overflow-y-auto overflow-x-hidden pr-1 max-h-full grid grid-cols-4 sm:grid-cols-5 md:grid-cols-4 gap-3 ${SCROLLBAR_CLASSES}`}>
                    {mediaList.map((item, index) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedIndex(index)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all flex items-center justify-center bg-[var(--background)] ${
                          selectedIndex === index
                            ? "border-[var(--primary)]"
                            : "border-[var(--border)] border-2"
                        }`}
                      >
                        <div className="w-full h-full flex items-center justify-center overflow-hidden">
                          {renderThumbnail(item)}
                        </div>
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 text-[9px] truncate bg-black/80 text-[var(--text-soft)] text-center">
                          {item.title}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col mr-2 items-center justify-center text-center border border-dashed rounded-xl border-[var(--border)] bg-[var(--background)]">
                    <ImageIcon className="w-10 h-10 sm:w-12 sm:h-12 mb-2 opacity-40 text-[var(--text-muted)]" />
                    <p className="text-xs sm:text-sm font-medium text-[var(--text)]">
                      No media yet
                    </p>
                    <p className="text-[11px] sm:text-xs mt-1 text-[var(--text-muted)]">
                      Upload media to see details and manage attributes.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel */}
            {renderDetailsColumn("md:w-1/2")}
          </div>
        ) : (
          /* ------------------------------ Add mode ------------------------------ */
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 lg:overflow-hidden">
            {errorMessage && (
              <div className="flex shrink-0 items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Row 1 — drop zone | uploaded images (50/50) */}
            <div className="grid shrink-0 gap-3 md:grid-cols-2 md:h-[232px]">
              {renderDropZone("h-48 md:h-full")}
              {renderUploadedPanel()}
            </div>

            {/* Row 2 — optimization | details (50/50) */}
            <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
              {renderOptimizationPanel()}
              {renderDetailsColumn("min-h-0")}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0 bg-[var(--surface)] border-t border-[var(--border)]">
          <div className="flex min-w-0 items-center gap-3">
            {mode === "add" ? (
              <Button
                variant="danger"
                size="md"
                icon={Trash2}
                onClick={handleRemoveAll}
                disabled={mediaList.length === 0}
              >
                Remove All
              </Button>
            ) : (
              <Button
                variant="danger"
                size="md"
                icon={Trash2}
                onClick={handleDeleteClick}
                disabled={!currentItem}
              >
                Remove Media
              </Button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={`${currentItem? "primary":"ghost"}`}
              size="md"
              onClick={handleSaveClick}
              disabled={!currentItem || isPreparing}
            >
              {isPreparing ? "Processing..." : "Save Media Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaHandlerModal;
