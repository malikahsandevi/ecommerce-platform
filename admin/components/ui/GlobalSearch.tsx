"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Package,
  FolderTree,
  Award,
  Image as ImageIcon,
  CircleAlert,
} from "lucide-react";
import { apiClient } from "@/services/api";
import { useLanguage } from "@/services/i18n";

export interface GlobalSearchResult {
  type: "product" | "category" | "brand" | "media";
  id: string;
  name: string;
  code?: string | null;
  sku?: string | null;
  image?: string;
}

type ScopeName = "all" | "products" | "categories" | "brands" | "media";

const SCOPE_WORDS: Record<string, ScopeName> = {
  product: "products",
  products: "products",
  category: "categories",
  categories: "categories",
  brand: "brands",
  brands: "brands",
  media: "media",
};

const TYPE_META: Record<
  GlobalSearchResult["type"],
  { label: string; Icon: React.ElementType; tagClasses: string }
> = {
  product: {
    label: "Product",
    Icon: Package,
    tagClasses: "bg-orange-500/10 text-orange-600",
  },
  category: {
    label: "Category",
    Icon: FolderTree,
    tagClasses: "bg-emerald-500/10 text-emerald-600",
  },
  brand: {
    label: "Brand",
    Icon: Award,
    tagClasses: "bg-sky-500/10 text-sky-600",
  },
  media: {
    label: "Media",
    Icon: ImageIcon,
    tagClasses: "bg-violet-500/10 text-violet-600",
  },
};

const SCOPE_LABEL: Record<Exclude<ScopeName, "all">, string> = {
  products: "Products",
  categories: "Categories",
  brands: "Brands",
  media: "Media",
};

/**
 * Placeholder hints that teach the search syntax. While the box is
 * empty they cycle continuously — each line rolls up and the next
 * rolls in (see .search-hint-roll in globals.css). With the panel's
 * Animations setting off, only the first line shows, statically.
 */
const SEARCH_HINTS = [
  "Search products, categories, brands, media...",
  "Type a name or code — e.g. Wireless Headphones",
  "Search one place only: headphones//products",
  "Scopes: //products · //categories · //brands · //media",
];
const HINT_INTERVAL_MS = 2800;

/**
 * Split a raw query into search text + scope, splitting on the LAST
 * `//`. Spaces around the `//` are plain whitespace, so "home//products",
 * "home //products", "home// products" and "home // products" all parse
 * the same. A known scope word after `//` scopes the search; NOTHING
 * after `//` ("home//") is a plain all-sources search for the text
 * before it. An UNKNOWN word after `//` is an invalid tag: the text
 * before the `//` is searched across all sources, and the dropdown
 * flags the tag with a notice line at the bottom.
 */
function parseQuery(raw: string): {
  text: string;
  scope: ScopeName;
  invalidTag: string | null;
} {
  const idx = raw.lastIndexOf("//");
  if (idx >= 0) {
    const left = raw.slice(0, idx).trim();
    const right = raw.slice(idx + 2).trim();
    if (!right) return { text: left, scope: "all", invalidTag: null };
    const scope = SCOPE_WORDS[right.toLowerCase()];
    if (scope) return { text: left, scope, invalidTag: null };
    return { text: left, scope: "all", invalidTag: right };
  }
  return { text: raw.trim(), scope: "all", invalidTag: null };
}

/**
 * The TopBar global search: one wide box over all four sources
 * (products, categories, brands, media) with results in a Select-style
 * dropdown panel under the box. Supports the `text//scope` syntax.
 */
export const GlobalSearch: React.FC = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestSeq = useRef(0);
  const [hintIndex, setHintIndex] = useState(0);
  const [animationsOff, setAnimationsOff] = useState(false);

  // Track the panel's Animations setting (services/appearance.ts
  // mirrors it onto <html data-animations="off">).
  useEffect(() => {
    const read = () =>
      setAnimationsOff(
        document.documentElement.getAttribute("data-animations") === "off",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-animations"],
    });
    return () => observer.disconnect();
  }, []);

  // Cycle the placeholder hints while the box is empty.
  useEffect(() => {
    if (query || animationsOff) return;
    const id = setInterval(
      () => setHintIndex((i) => (i + 1) % SEARCH_HINTS.length),
      HINT_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [query, animationsOff]);

  const showHintOverlay = !query && !animationsOff;

  const { text, scope, invalidTag } = parseQuery(query);

  // Ctrl+/ focuses the box, like the old SearchBar.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Outside click closes the panel.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced fetch (~300ms). A sequence number keeps a slow earlier
  // response from overwriting a newer query's results.
  useEffect(() => {
    if (!text) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++requestSeq.current;
    const handler = setTimeout(async () => {
      try {
        const res = await apiClient.get("/search", {
          params: { q: text, scope },
        });
        if (requestSeq.current !== seq) return;
        setResults(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (requestSeq.current !== seq) return;
        setResults([]);
      } finally {
        if (requestSeq.current === seq) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [text, scope]);

  useEffect(() => {
    setActiveIndex(results.length > 0 ? 0 : -1);
  }, [results]);

  const goToResult = (result: GlobalSearchResult) => {
    try {
      if (result.type === "media") {
        sessionStorage.setItem("openMediaId", result.id);
      } else {
        sessionStorage.setItem(
          "openEntity",
          JSON.stringify({ type: result.type, id: result.id }),
        );
      }
    } catch {
      /* navigation still happens; the form just won't auto-open */
    }
    setOpen(false);
    setQuery("");
    const path =
      result.type === "product"
        ? "/products"
        : result.type === "category"
          ? "/categories"
          : result.type === "brand"
            ? "/brands"
            : "/media";
    router.push(path);
  };

  // An invalid tag keeps the panel open even with an empty query text,
  // so the "No results found" state can still carry the tag notice.
  const showPanel = open && (text.length > 0 || invalidTag !== null);

  return (
    <div
      ref={containerRef}
      // Fluid width with a 480px cap (~1.5x the old SearchBar's 320px):
      // the TopBar's controls row is a flex-1 flex row, so this box
      // takes whatever space the title and icon cluster leave — up to
      // 480px on wide screens, shrinking (never overflowing) on narrow
      // ones. A fixed 480px width used to push the whole TopBar past
      // the viewport below ~1150px and give the page a sideways scroll.
      className="relative min-w-0 flex-1 max-w-[480px]"
    >
      <Search className="absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] opacity-70" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
            e.preventDefault();
            goToResult(results[activeIndex]);
          }
        }}
        placeholder={showHintOverlay ? "" : t(SEARCH_HINTS[0])}
        autoComplete="off"
        aria-label={t("Global search")}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] py-1.5 pl-8 pr-1 text-sm font-medium text-[var(--text)] outline-none transition-all placeholder:text-[var(--text-muted)]"
      />
      {showHintOverlay && (
        // The cycling placeholder: an overlay line aligned with the
        // input's text (pl-8) that stops before the Ctrl+/ chip. It
        // never captures clicks — the input focuses normally.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-8 right-14 flex items-center overflow-hidden"
        >
          <span
            key={hintIndex}
            data-search-hint
            className="search-hint-roll block truncate text-sm font-medium text-[var(--text-muted)]"
          >
            {t(SEARCH_HINTS[hintIndex])}
          </span>
        </span>
      )}
      {!query && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-muted)]">
          Ctrl+/
        </kbd>
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.45)] animate-in fade-in zoom-in-95 duration-100 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-[var(--surface-muted)] [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full">
          {scope !== "all" && (
            <p className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t("{scope} only").replace("{scope}", t(SCOPE_LABEL[scope]))}
            </p>
          )}
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("Searching…")}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
              {t("No results found")}
            </p>
          ) : (
            results.map((result, index) => {
              const meta = TYPE_META[result.type];
              const TypeIcon = meta.Icon;
              const metaLine =
                result.type === "product" && result.sku
                  ? `SKU ${result.sku}${result.code ? ` · #${result.code}` : ""}`
                  : result.code
                    ? `#${result.code}`
                    : "";
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  type="button"
                  onClick={() => goToResult(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    index === activeIndex
                      ? "bg-(--primary)/15"
                      : "hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]">
                    {result.image ? (
                      <img
                        src={result.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <TypeIcon className="h-4 w-4 text-[var(--text-muted)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-[var(--text)]">
                      {result.name}
                    </span>
                    {metaLine && (
                      <span className="block truncate text-[10px] text-[var(--text-muted)]">
                        {metaLine}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${meta.tagClasses}`}
                  >
                    {t(meta.label)}
                  </span>
                </button>
              );
            })
          )}
          {invalidTag !== null && !loading && (
            // Not a result — a one-row notice (same height/padding as a
            // result row) naming the invalid tag; the results above are
            // the all-sources matches for the text before the `//`.
            <div className="flex items-center gap-2.5 bg-[var(--surface-muted)] px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                <CircleAlert className="h-4 w-4 text-amber-500" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
                {t('"{tag}" invalid tag — results from "{text}"')
                  .replace("{tag}", invalidTag)
                  .replace("{text}", text)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
