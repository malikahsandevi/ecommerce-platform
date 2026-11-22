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
  Loader2,
  Package,
  Award,
  FolderTree,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { mediaService, purposeFromAssetUrl } from "@/services/resourceRegistry";

/** One product in the Edit Media panel's "Used In" list. */
export interface MediaUsageProduct {
  _id: string;
  code?: string | null;
  name: string;
  image?: string;
  status?: string;
}

/** One brand or category in the Edit Media panel's "Used In" list. */
export interface MediaUsageEntity {
  _id: string;
  code?: string | null;
  name: string;
  image?: string;
  /** "active" | "inactive" (derived from isActive by the API). */
  status?: string;
}

/** Everything using the media item being edited ("Used In" panel). */
export interface MediaUsage {
  products: MediaUsageProduct[];
  brands: MediaUsageEntity[];
  categories: MediaUsageEntity[];
}

export type MediaUsageType = "product" | "brand" | "category";

const EMPTY_USAGE: MediaUsage = { products: [], brands: [], categories: [] };

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
  /** Object URL of the processed blob — what thumbnails/previews show
   *  once processing produced the file that will actually be used, so
   *  the user SEES the processed image, not the original. */
  effUrl?: string;
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
  /** Edit mode "Used In": open this product's edit form. */
  onOpenProduct?: (productId: string) => void;
  /** Edit mode "Used In": open the edit form of any usage entry. */
  onOpenUsage?: (type: MediaUsageType, id: string) => void;
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
  "[&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-[4px] [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent]";

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
  onOpenProduct,
  onOpenUsage,
}) => {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [scope, setScope] = useState<OptScope>("selected");
  const [isPreparing, setIsPreparing] = useState(false);
  /** The optimizer's explicit Convert/Compress button is running. */
  const [isOptimizing, setIsOptimizing] = useState(false);
  /** Per-file progress of the button's run: files finished / total,
   *  plus whether one is currently in flight (its segment shows half
   *  full). Drives the fill INSIDE the Convert & Compress button. */
  const [optProgress, setOptProgress] = useState<{
    done: number;
    total: number;
    active: boolean;
  } | null>(null);
  /** Edit mode: everything using this media item ("Used In" panel). */
  const [usage, setUsage] = useState<MediaUsage>(EMPTY_USAGE);
  const [usageLoading, setUsageLoading] = useState(false);
  /** Edit mode: the saved image file could not be fetched for the optimizer. */
  const [editFileFailed, setEditFileFailed] = useState(false);

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
            opt: { ...DEFAULT_OPT },
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
      setIsOptimizing(false);
      setEditFileFailed(false);
      setUsage(EMPTY_USAGE);
    }
  }, [isOpen, mode, initialData]);

  // Edit mode: load everything using this media item for "Used In".
  useEffect(() => {
    if (!isOpen || mode !== "edit") return;
    const mediaId = initialData?._id || initialData?.id;
    if (!mediaId) {
      setUsage(EMPTY_USAGE);
      return;
    }
    let cancelled = false;
    setUsageLoading(true);
    mediaService
      .usage(String(mediaId))
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => {
        if (!cancelled) setUsage(EMPTY_USAGE);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, initialData]);

  // Edit mode: the optimizer works on the SAVED image, so fetch it into
  // a File once — from then on the item flows through the exact same
  // client-side processing pipeline as a freshly picked file in add
  // mode (background processing effect below, before/after sizes, and
  // the never-grow rule all apply unchanged).
  useEffect(() => {
    if (!isOpen || mode !== "edit") return;
    const item = mediaList[0];
    if (!item || item.mediaCategory !== "image" || item.file) return;
    if (!item.previewUrl) {
      setEditFileFailed(true);
      return;
    }
    let cancelled = false;
    const sourceUrl = item.previewUrl;
    fetch(sourceUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const urlName = sourceUrl.split("/").pop()?.split("?")[0] || "";
        const mime = blob.type || item.type || "image/png";
        const fallbackName = `image.${
          mime === "image/jpeg"
            ? "jpg"
            : mime === "image/webp"
              ? "webp"
              : mime === "image/gif"
                ? "gif"
                : "png"
        }`;
        const file = new File([blob], urlName.includes(".") ? urlName : fallbackName, {
          type: mime,
        });
        setMediaList((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, file } : it)),
        );
      })
      .catch(() => {
        if (!cancelled) setEditFileFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, mediaList]);

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

  /**
   * Stores a finished processing run on its item. Guarded: if the
   * item's settings moved on while processing, the newer key's run
   * owns the item and this stale result is dropped. The never-grow
   * rule lives here: a processed file that is not smaller than the
   * original is discarded and the original is kept (eff* stay empty,
   * which the panels read as "Already optimal — original kept").
   */
  const applyProcessedResult = (
    item: MediaItem,
    key: string,
    blob: Blob | null,
  ) => {
    const file = item.file;
    if (!file) return;
    const mime = key.slice(key.lastIndexOf("|") + 1);
    setMediaList((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it;
        if (`${it.id}|${targetMimeFor(it)}` !== key) return it;
        if (!blob) {
          if (it.effUrl) URL.revokeObjectURL(it.effUrl);
          return {
            ...it,
            procKey: key,
            procFailed: true,
            effSize: undefined,
            effType: undefined,
            effName: undefined,
            effUrl: undefined,
          };
        }
        const useProcessed = blob.size < file.size;
        // The displayed image must BECOME the processed result: hand
        // the thumbnails/previews an object URL for the processed blob
        // (revoking the superseded one). Without this the panel's
        // numbers changed but the picture never did, so the optimizer
        // looked like it did nothing.
        let effUrl: string | undefined;
        if (useProcessed) {
          effUrl = URL.createObjectURL(blob);
          if (it.effUrl && it.effUrl !== effUrl) {
            URL.revokeObjectURL(it.effUrl);
          }
        } else if (it.effUrl) {
          URL.revokeObjectURL(it.effUrl);
        }
        return {
          ...it,
          procKey: key,
          procFailed: false,
          effSize: useProcessed ? blob.size : undefined,
          effType: useProcessed ? mime : undefined,
          effName: useProcessed ? processedNameFor(file.name, mime) : undefined,
          effUrl,
        };
      }),
    );
  };

  /** Item indexes the current scope points at (same targeting as applyOpt). */
  const scopeIndexes = (): number[] => {
    const activeItem = mediaList[selectedIndex];
    const primaryIndex =
      activeItem && activeItem.mediaCategory === "image" && activeItem.file
        ? selectedIndex
        : mediaList.findIndex(
            (it) => it.mediaCategory === "image" && it.file,
          );
    const targets = new Set<number>();
    if (scope === "active") {
      if (primaryIndex >= 0) targets.add(primaryIndex);
    } else if (scope === "all") {
      mediaList.forEach((_, i) => targets.add(i));
    } else {
      mediaList.forEach((item, i) => {
        if (item.ticked) targets.add(i);
      });
      if (targets.size === 0 && primaryIndex >= 0) {
        targets.add(primaryIndex);
      }
    }
    return [...targets];
  };

  /**
   * The optimizer panel's Convert/Compress button: runs the canvas
   * pipeline for the given items NOW and waits for the results, so
   * the sizes, savings and badges on screen are final when it
   * finishes — not only at Save time. Results land in the same cache
   * Save reads, so Save never reprocesses unchanged settings. A
   * cached failure is retried (its cache entry is dropped first).
   */
  const runOptimizationNow = async (items: MediaItem[]) => {
    const work = items.filter((it) => it.file && targetMimeFor(it));
    if (!work.length || isOptimizing) return;
    setIsOptimizing(true);
    // Progress is real, per file: items whose processing already
    // finished (background run or an earlier click) count as done
    // immediately; each remaining file moves the fill as it completes.
    let done = work.filter(
      (it) => it.procKey === `${it.id}|${targetMimeFor(it)}`,
    ).length;
    setOptProgress({ done, total: work.length, active: done < work.length });
    try {
      for (const item of work) {
        const mime = targetMimeFor(item);
        if (!mime) continue;
        const key = `${item.id}|${mime}`;
        if (item.procKey === key) continue;
        if (
          processedBlobsRef.current.has(key) &&
          processedBlobsRef.current.get(key) === null
        ) {
          processedBlobsRef.current.delete(key);
        }
        setOptProgress({ done, total: work.length, active: true });
        const blob = await getProcessedBlob(item, mime);
        applyProcessedResult(item, key, blob);
        done += 1;
        setOptProgress({ done, total: work.length, active: done < work.length });
      }
    } finally {
      setIsOptimizing(false);
      setOptProgress(null);
    }
  };

  /** True when processing already ran for the item's CURRENT settings
   *  and the original was kept because the result was not smaller. */
  const keptOriginal = (item: MediaItem): boolean => {
    const mime = targetMimeFor(item);
    if (!mime || item.procFailed || item.effType) return false;
    return item.procKey === `${item.id}|${mime}`;
  };

  /** The Convert/Compress button's label follows the panel's toggles. */
  const optButtonLabel = (
    opt: ImageOptimization,
    running: boolean,
  ): string => {
    if (running) {
      return opt.compress && !opt.convert ? "Compressing…" : "Converting…";
    }
    if (opt.convert && opt.compress) return "Convert & Compress";
    if (opt.convert) {
      if (opt.format === "original") return "Convert Image";
      const label =
        FORMAT_OPTIONS.find((f) => f.value === opt.format)?.label ?? "WebP";
      return `Convert to ${label}`;
    }
    if (opt.compress) return "Compress Image";
    return "Convert & Compress";
  };

  // Process queued images in the background whenever their settings make
  // them eligible, so the before/after sizes and badges show real numbers.
  // Edit mode runs the same pipeline for its single (fetched) image.
  useEffect(() => {
    if (!isOpen) return;
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
        applyProcessedResult(item, key, blob);
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
      if (item.effUrl) {
        URL.revokeObjectURL(item.effUrl);
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
      if (item.effUrl) {
        URL.revokeObjectURL(item.effUrl);
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

  /** Edit mode: optimization settings apply to the single edited image. */
  const applyEditOpt = (patch: Partial<ImageOptimization>) => {
    setMediaList((prev) =>
      prev.map((item, i) =>
        i === selectedIndex
          ? { ...item, opt: { ...(item.opt ?? DEFAULT_OPT), ...patch } }
          : item,
      ),
    );
  };

  const handleSaveClick = async () => {
    if (mode === "edit") {
      if (!currentItem || isPreparing) return;
      setIsPreparing(true);
      setErrorMessage("");
      try {
        let itemToSave: MediaItem = currentItem;
        // When the optimizer produced a SMALLER file, replace the saved
        // file behind this record first: upload the processed file
        // directly to Cloudinary, then swap it in via PUT /media/:id/file
        // (same record, same code — every link keeps working, and the
        // backend rewrites stored URL references + destroys the old
        // asset). Only then does the normal details save proceed.
        if (currentItem.mediaCategory === "image" && currentItem.file) {
          const mime = targetMimeFor(currentItem);
          if (mime) {
            const blob = await getProcessedBlob(currentItem, mime);
            if (blob && blob.size < currentItem.file.size) {
              const optimizedFile = new File(
                [blob],
                processedNameFor(currentItem.file.name, mime),
                { type: mime },
              );
              // The replacement stays in the same folder family as
              // the record it replaces (storage organization).
              const uploaded = await mediaService.uploadAsset(
                optimizedFile,
                purposeFromAssetUrl(currentItem.previewUrl),
              );
              const updated = await mediaService.replaceFile(
                String(currentItem.id),
                {
                  url: uploaded.secure_url,
                  publicId: uploaded.public_id,
                  size: uploaded.bytes,
                  mimeType: mime,
                  format: uploaded.format,
                  dimensions:
                    uploaded.width && uploaded.height
                      ? { width: uploaded.width, height: uploaded.height }
                      : undefined,
                  filename:
                    String(uploaded.public_id || "").split("/").pop() ||
                    undefined,
                },
              );
              itemToSave = {
                ...currentItem,
                previewUrl: updated?.url || uploaded.secure_url,
              };
            }
          }
        }
        // The fetched File must not travel upward — the page treats an
        // item WITH a file as a brand-new upload.
        const { file: _fetchedFile, ...details } = itemToSave;
        onSave(details);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The optimized image could not be saved. Nothing was changed — please try again.",
        );
      } finally {
        setIsPreparing(false);
      }
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
            src={item.effUrl || item.previewUrl}
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
    // Only files that will actually be optimized carry a badge. A file
    // staying original shows NO badge at all — the badge's absence is
    // the signal.
    if (!eff) return null;
    return (
      <span className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-full bg-green-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
        <Zap size={9} className="fill-current" />
        {MIME_LABEL[eff.type] || "Optimized"}
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
          className={`mt-3 flex gap-3 overflow-x-auto overflow-y-hidden pb-2 ${SCROLLBAR_CLASSES}`}
        >
          {mediaList.map((item, index) => (
            <div
              key={item.id}
              onClick={() => setSelectedIndex(index)}
              className={`group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-all bg-[var(--background)] ${
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
              {/* Hover / active remove bar — parked below the card's
                  bottom edge, it slides up over the filename strip. */}
              <div
                className={`absolute inset-x-0 bottom-0 z-10 transition-transform duration-200 ${
                  selectedIndex === index
                    ? "translate-y-0"
                    : "translate-y-full group-hover:translate-y-0"
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

  /**
   * The optimizer's explicit action button, pinned to the panel's
   * bottom (mt-auto): pressing it runs the conversion/compression
   * immediately for the panel's scope instead of waiting for Save.
   * Its label follows the Convert/Compress toggles, and it shows
   * progress while the pipeline runs.
   */
  const renderOptRunButton = (
    opt: ImageOptimization,
    disabled: boolean,
    onRun: () => void,
  ) => {
    // The progress fill lives INSIDE the button: a lighter shade of
    // the button's own colour sweeping left → right behind the label,
    // sized by the real per-file progress (an in-flight file holds
    // its segment at half). The label carries the percentage.
    const pct =
      optProgress && optProgress.total > 0
        ? Math.min(
            100,
            Math.round(
              ((optProgress.done + (optProgress.active ? 0.5 : 0)) /
                optProgress.total) *
                100,
            ),
          )
        : 0;
    return (
      <div className="mt-auto pt-1">
        <button
          type="button"
          disabled={disabled || isOptimizing}
          onClick={onRun}
          className="relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isOptimizing && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-white/30 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
          <span className="relative z-10 flex items-center justify-center gap-2">
            {isOptimizing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Zap size={16} className="fill-current" />
            )}
            {optButtonLabel(opt, isOptimizing)}
            {isOptimizing && optProgress ? ` ${pct}%` : ""}
          </span>
        </button>
      </div>
    );
  };

  const renderOptimizationPanel = (forcedOverlayText?: string) => {
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

    // With no image in the queue the panel still renders in full — a
    // light veil covers it until an image arrives. Edit mode forces the
    // veil with its own text: optimization only applies to new uploads.
    const showOptimizerOverlay = forcedOverlayText
      ? true
      : imageItems.length === 0;

    return (
      <div className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5">
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 ${SCROLLBAR_CLASSES} ${
            showOptimizerOverlay ? "pointer-events-none" : ""
          }`}
        >
        <h3 className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
          <Zap size={14} className="fill-current" />
          Image Optimization
          <span className="rounded-full bg-[var(--primary)] px-1.5 py-px text-[9px] font-bold text-white">
            NEW
          </span>
        </h3>

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
                image, or the first queued image as a fallback). With no
                image queued, a placeholder box sits under the veil. */}
            {usingFallback && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Selected file is not an image — showing the first image.
              </p>
            )}
            {displayItem ? (
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
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
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
                      {displayItem && keptOriginal(displayItem)
                        ? "Already optimal — original kept"
                        : "Original"}
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
            ) : (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text-muted)]">
                    No image
                  </span>
                  <span className="text-[var(--text-muted)]">—</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--border)] pt-2">
                  <span className="font-semibold text-[var(--text)]">
                    Total ({optimizedCount} optimized, {originalCount} original)
                  </span>
                  <span className="text-[var(--text-muted)]">—</span>
                </div>
              </div>
            )}

            {/* Run button — pinned to the bottom of the panel: runs
                the pipeline for the current scope right now. */}
            {renderOptRunButton(
              panelOpt,
              !displayItem ||
                (!panelOpt.convert && !panelOpt.compress) ||
                !scopeIndexes().some((i) => {
                  const it = mediaList[i];
                  return it && it.file && targetMimeFor(it);
                }),
              () =>
                runOptimizationNow(
                  scopeIndexes()
                    .map((i) => mediaList[i])
                    .filter(Boolean),
                ),
            )}
          </>
        </div>

        {showOptimizerOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[var(--surface)]/75 backdrop-blur-[1px]">
            <ImageIcon className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="px-4 text-center text-sm font-medium text-[var(--text-soft)]">
              {forcedOverlayText ?? "Upload image to use Image Optimizer"}
            </p>
          </div>
        )}
      </div>
    );
  };

  /* ------------------------- Edit-mode pieces ------------------------- */

  /** Large preview of the item being edited (top-left of the panel). */
  const renderEditPreview = (item: MediaItem) => {
    switch (item.mediaCategory) {
      case "image":
        return (
          <img
            src={item.effUrl || item.previewUrl}
            alt={item.altText || item.title || ""}
            className="max-h-full max-w-full object-contain"
          />
        );
      case "video":
        return (
          <video
            src={item.previewUrl}
            controls
            className="max-h-full max-w-full object-contain"
          />
        );
      case "audio":
        return <Music className="h-16 w-16 text-[var(--primary)]" />;
      case "model3d":
        return <Box className="h-16 w-16 text-[var(--text-soft)]" />;
      default:
        return <FileText className="h-16 w-16 text-[var(--text-muted)]" />;
    }
  };

  const renderEditPreviewPanel = () => (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Media Preview
      </h3>
      <div className="relative mt-3 flex h-44 min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] md:h-auto">
        {currentItem ? (
          renderEditPreview(currentItem)
        ) : (
          <ImageIcon className="h-10 w-10 opacity-40 text-[var(--text-muted)]" />
        )}
        {/* The processed image carries the same ⚡ badge as the
            upload strip, so the conversion is visibly marked on the
            preview itself. */}
        {currentItem && badgeOf(currentItem)}
      </div>
      {currentItem && (
        <p className="mt-2 shrink-0 truncate text-center text-[11px] text-[var(--text-muted)]">
          {currentItem.title}
        </p>
      )}
    </div>
  );

  const renderUsedInPanel = () => {
    const usageTotal =
      usage.products.length + usage.brands.length + usage.categories.length;

    const openUsage = (type: MediaUsageType, id: string) => {
      if (onOpenUsage) {
        onOpenUsage(type, id);
      } else if (type === "product") {
        onOpenProduct?.(id);
      }
    };
    const canOpen = (type: MediaUsageType) =>
      Boolean(onOpenUsage || (type === "product" && onOpenProduct));

    // One flat list, same order as before: products, brands, categories.
    const entries: { type: MediaUsageType; entity: MediaUsageEntity }[] = [
      ...usage.products.map((entity) => ({
        type: "product" as MediaUsageType,
        entity,
      })),
      ...usage.brands.map((entity) => ({
        type: "brand" as MediaUsageType,
        entity,
      })),
      ...usage.categories.map((entity) => ({
        type: "category" as MediaUsageType,
        entity,
      })),
    ];

    const TYPE_META: Record<
      MediaUsageType,
      { label: string; Icon: React.ElementType }
    > = {
      product: { label: "Product", Icon: Package },
      brand: { label: "Brand", Icon: Award },
      category: { label: "Category", Icon: FolderTree },
    };

    // Status presentation: Published/Active get the filled orange tick
    // (echoing the upload cards' ticks); everything else (Draft,
    // Inactive, Pending Review…) gets the muted variant. The tooltip
    // carries the human-readable status title.
    const statusMeta = (type: MediaUsageType, raw?: string) => {
      const status = (
        raw || (type === "product" ? "draft" : "active")
      ).toLowerCase();
      return {
        positive: status === "published" || status === "active",
        label: status
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      };
    };

    const badgeTooltip = (text: string, align: "left" | "right") => (
      <span
        data-tooltip={text}
        className={`pointer-events-none absolute top-full z-30 mt-1 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 text-[9px] font-semibold text-white opacity-0 shadow transition-opacity duration-150 group-hover/badge:opacity-100 ${
          align === "left" ? "left-0" : "right-0"
        }`}
      >
        {text}
      </span>
    );

    const renderUsageCard = (
      type: MediaUsageType,
      entity: MediaUsageEntity,
    ) => {
      const { Icon: TypeIcon, label: typeLabel } = TYPE_META[type];
      const status = statusMeta(type, entity.status);
      return (
        <button
          key={`${type}-${entity._id}`}
          type="button"
          disabled={!canOpen(type)}
          onClick={() => openUsage(type, entity._id)}
          title={canOpen(type) ? `Open ${entity.name} for editing` : entity.name}
          className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-[var(--background)] text-left transition-all ${
            canOpen(type)
              ? "cursor-pointer border-[var(--border)] hover:border-[var(--primary)]"
              : "cursor-default border-[var(--border)]"
          }`}
        >
          <span className="flex h-full w-full items-center justify-center overflow-hidden">
            {entity.image ? (
              <img
                src={entity.image}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xl font-bold text-[var(--text-muted)]">
                {(entity.name || "?").trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>

          {/* Status tick — top-left, where the upload cards keep theirs. */}
          <span className="group/badge absolute left-1.5 top-1.5 z-10">
            <span
              data-status={status.label}
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                status.positive
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-gray-400 bg-white/90 text-gray-500"
              }`}
            >
              <Check size={12} strokeWidth={4} />
            </span>
            {badgeTooltip(status.label, "left")}
          </span>

          {/* Type chip — top-right corner icon. */}
          <span className="group/badge absolute right-1.5 top-1.5 z-10">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white">
              <TypeIcon size={11} />
            </span>
            {badgeTooltip(typeLabel, "right")}
          </span>

          {/* Name strip — same as the upload cards' filename strip. */}
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/80 px-1.5 py-0.5 text-center text-[9px] text-[var(--text-soft)]">
            {entity.name}
          </span>
        </button>
      );
    };

    return (
      // py-2 (not the usual p-3): Row 1 is fixed at 145px, and the
      // 96px strip + its scrollbar padding needs the reclaimed 8px to
      // render at full height like the upload strip does in add mode.
      <div className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Used In
          </h3>
          <span className="text-[11px] text-[var(--text-muted)]">
            {usageTotal} {usageTotal === 1 ? "link" : "links"}
          </span>
        </div>

        {usageLoading ? (
          <div className="mt-2 flex min-h-0 flex-1 items-center justify-center text-center">
            <p className="text-xs text-[var(--text-muted)]">Loading…</p>
          </div>
        ) : usageTotal === 0 ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-3 text-center">
            <p className="text-xs font-medium text-[var(--text)]">
              Not used anywhere yet
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Products, brands and categories that use this media will appear here.
            </p>
          </div>
        ) : (
          <div
            className={`mt-2 flex shrink-0 gap-3 overflow-x-auto overflow-y-hidden pb-2 ${SCROLLBAR_CLASSES}`}
          >
            {entries.map(({ type, entity }) => renderUsageCard(type, entity))}
          </div>
        )}
      </div>
    );
  };

  /**
   * Edit mode optimization panel — the SAME controls as add mode
   * (convert, format, compress, locked max quality, before/after with
   * real sizes), minus the scope chips: there is only one image. It
   * works on the saved image fetched into a File, through the same
   * processing pipeline; on save, a smaller processed file replaces
   * the stored file behind the same record.
   */
  const renderEditOptimizationPanel = () => {
    const item = currentItem;
    const panelOpt: ImageOptimization = item?.opt ?? DEFAULT_OPT;
    const eff = item ? effectiveOf(item) : null;
    const originalSize = item?.file?.size;
    const savedPct =
      eff?.size !== undefined && originalSize
        ? Math.round((1 - eff.size / originalSize) * 100)
        : null;
    const fileReady = Boolean(item?.file);
    const replacementPending = Boolean(eff);

    return (
      <div className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--primary)] bg-[var(--primary)]/5">
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 ${SCROLLBAR_CLASSES} ${
            fileReady ? "" : "pointer-events-none"
          }`}
        >
          <h3 className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
            <Zap size={14} className="fill-current" />
            Image Optimization
            <span className="rounded-full bg-[var(--primary)] px-1.5 py-px text-[9px] font-bold text-white">
              NEW
            </span>
          </h3>

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
              onToggle={() => applyEditOpt({ convert: !panelOpt.convert })}
              label="Convert to WebP"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FORMAT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!panelOpt.convert}
                onClick={() => applyEditOpt({ format: option.value })}
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
              onToggle={() => applyEditOpt({ compress: !panelOpt.compress })}
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

          {/* Before / after for the edited image */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
            {!fileReady ? (
              <p className="font-medium text-[var(--text-muted)]">
                {editFileFailed
                  ? "The image file could not be loaded, so optimization is unavailable."
                  : "Loading image…"}
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="max-w-[40%] truncate font-medium text-[var(--text)]">
                    {item?.title}
                  </span>
                  {item?.procFailed ? (
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-soft)]">
                      Original — processing failed
                    </span>
                  ) : eff ? (
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)] line-through">
                        {formatBytes(originalSize)}
                      </span>
                      <span>→</span>
                      <span className="font-bold text-green-600">
                        {eff.size !== undefined
                          ? `~${formatBytes(eff.size)} ${MIME_LABEL[eff.type] || ""}`
                          : `Converting to ${MIME_LABEL[eff.type] || "optimized"}…`}
                      </span>
                      {savedPct !== null && savedPct > 0 && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                          −{savedPct}%
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-soft)]">
                        {formatBytes(originalSize)}
                      </span>
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-soft)]">
                        {item && keptOriginal(item)
                          ? "Already optimal — original kept"
                          : "Original"}
                      </span>
                    </span>
                  )}
                </div>
                {replacementPending && (
                  <p className="mt-2 border-t border-dashed border-[var(--border)] pt-2 text-[11px] text-[var(--text-muted)]">
                    This image will be replaced with the optimized version on save.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Run button — same as add mode: process the saved image
              immediately and show the result; Save still commits the
              replacement. */}
          {renderOptRunButton(
            panelOpt,
            !fileReady ||
              (!panelOpt.convert && !panelOpt.compress) ||
              !(item && targetMimeFor(item)),
            () => {
              if (item) runOptimizationNow([item]);
            },
          )}
        </div>
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
          <Button variant="ghost" size="md" className="border-none close-x" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        {mode === "edit" ? (
          /* ------------- Edit mode — the SAME panel shell as add mode -------------
             The same four blocks in the same 2×2 grid: media preview
             instead of the drop zone, "Used In" instead of the upload
             strip, a WORKING optimizer (it replaces the saved file on
             save), and the media details. No queue, no ticks, no
             Select All here. */
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 lg:overflow-hidden">
            {errorMessage && (
              <div className="flex shrink-0 items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Row 1 — media preview | Used In (50/50). The fixed
                desktop height is the SAME as add mode's Row 1 (145px —
                the height the drop-zone/uploaded-images row renders at
                when the upload panel opens), so both modes share one
                geometry and Row 2 starts at the same Y in each. An
                earlier 300px height made this row twice as tall as
                add mode's and squeezed Row 2 at short viewports. */}
            <div className="grid shrink-0 gap-3 md:h-[145px] md:grid-cols-2">
              {renderEditPreviewPanel()}
              {renderUsedInPanel()}
            </div>

            {/* Row 2 — optimization | details (50/50) */}
            <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
              {currentItem?.mediaCategory === "image"
                ? renderEditOptimizationPanel()
                : renderOptimizationPanel("Image optimization applies to images only")}
              {renderDetailsColumn("min-h-0")}
            </div>
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
            <div className="grid shrink-0 gap-3 md:grid-cols-2">
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
