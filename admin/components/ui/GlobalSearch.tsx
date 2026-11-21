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
} from "lucide-react";
import { apiClient } from "@/services/api";

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
 * Split a raw query into search text + scope. A trailing `//word`
 * scopes the search when the word names a source ("home//products");
 * anything else after `//` leaves the whole input as a plain query.
 */
function parseQuery(raw: string): { text: string; scope: ScopeName } {
  const match = raw.match(/^(.*?)\/\/(.+)$/);
  if (match) {
    const scope = SCOPE_WORDS[match[2].trim().toLowerCase()];
    if (scope) return { text: match[1].trim(), scope };
  }
  return { text: raw.trim(), scope: "all" };
}

/**
 * The TopBar global search: one wide box over all four sources
 * (products, categories, brands, media) with results in a Select-style
 * dropdown panel under the box. Supports the `text//scope` syntax.
 */
export const GlobalSearch: React.FC = () => {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestSeq = useRef(0);

  const { text, scope } = parseQuery(query);

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

  const showPanel = open && text.length > 0;

  return (
    <div
      ref={containerRef}
      // A definite width: the TopBar's right side sizes to content, so a
      // flex/w-full box collapses to the input's intrinsic width (~220px).
      // 480px is ~1.5x the old SearchBar's 320px cap, viewport-capped so
      // the bar never overflows smaller screens.
      className="relative w-[480px] max-w-[58vw]"
    >
      <Search className="absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] opacity-70" />
      <input
        ref={inputRef}
        type="text"
        value={query}
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
        placeholder="Search products, categories, brands, media..."
        autoComplete="off"
        aria-label="Global search"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] py-1.5 pl-8 pr-1 text-sm font-medium text-[var(--text)] outline-none transition-all placeholder:text-[var(--text-muted)]"
      />
      {!query && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-muted)]">
          Ctrl+/
        </kbd>
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg animate-in fade-in zoom-in-95 duration-100 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-button]:hidden [&::-webkit-scrollbar-track]:bg-[var(--surface-muted)] [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full">
          {scope !== "all" && (
            <p className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {SCOPE_LABEL[scope]} only
            </p>
          )}
          {loading ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
              No results found
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
                      ? "bg-[var(--primary-light,var(--surface-muted))]"
                      : "hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]">
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
                    {meta.label}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
