"use client";

import React, { useState, useEffect, useRef, ComponentPropsWithoutRef } from "react";
import { Search } from "lucide-react";
import { useLanguage } from "@/services/i18n";

// Generic Interface inside Child Component
export interface SearchableEntityRecord {
  id: string | number;
  [key: string]: any;
}

export type SearchBarVariant = "primary" | "secondary" | "outline" | "ghost";
export type SearchBarSize = "sm" | "md" | "lg";

const variantStyles: Record<SearchBarVariant, string> = {
  primary: "bg-[var(--primary)] text-[var(--primary-text,#ffffff)] placeholder:text-[var(--primary-text,#ffffff)]/70 border border-transparent",
  secondary: "bg-[var(--surface-muted)] text-[var(--text)] placeholder:text-[var(--text-muted)] border border-[var(--border)]",
  outline: "bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-muted)] border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)]",
  ghost: "bg-transparent text-[var(--text-muted)] placeholder:text-[var(--text-muted)] border border-transparent hover:bg-[var(--surface-muted)]",
};

const sizeStyles: Record<SearchBarSize, { container: string; input: string; icon: string; kbd: string }> = {
  sm: {
    container: "rounded-lg text-xs",
    input: "pl-7 pr-1 py-1 text-xs",
    icon: "w-3 h-3 left-2.5",
    kbd: "right-2 px-1 py-0.2 text-[8px]",
  },
  md: {
    container: "rounded-lg text-sm",
    input: "pl-8 pr-1 py-1.5 text-sm",
    icon: "w-3.5 h-3.5 left-3",
    kbd: "right-2.5 px-1.5 py-0.5 text-[9px]",
  },
  lg: {
    container: "rounded-xl text-base",
    input: "pl-9 pr-1 py-2 text-base",
    icon: "w-4 h-4 left-3",
    kbd: "right-3 px-2 py-0.5 text-[10px]",
  },
};

export interface SearchBarProps<TSearchData extends SearchableEntityRecord>
  extends Omit<ComponentPropsWithoutRef<"input">, "onChange" | "size"> {
  searchSourceData: TSearchData[];
  searchableFieldsKeys: (keyof TSearchData)[];
  onSearchResultsUpdate: (filteredSearchData: TSearchData[]) => void;
  searchPlaceholder?: string;
  searchVariant?: SearchBarVariant;
  searchSize?: SearchBarSize;
  isFullWidthSearch?: boolean;
  showShortcut?: boolean;
  debounceDelay?: number;
  /**
   * One-shot external query (notification click-through hand-off):
   * when `handoffNonce` changes to a new value, `handoffTerm` becomes
   * the box's query — visibly, exactly as if the user typed it.
   */
  handoffTerm?: string;
  handoffNonce?: number;
}

export const SearchBar = <TSearchData extends SearchableEntityRecord>({
  searchSourceData,
  searchableFieldsKeys,
  onSearchResultsUpdate,
  searchPlaceholder = "Search...",
  searchVariant = "secondary",
  searchSize = "md",
  isFullWidthSearch = false,
  showShortcut = true,
  debounceDelay = 300,
  handoffTerm,
  handoffNonce,
  disabled = false,
  className = "",
  ...props
}: SearchBarProps<TSearchData>) => {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Apply a click-through hand-off once per nonce. The ref guards
  // re-renders: the term stays in the box (the user can edit or clear
  // it like typed text) but is never forcefully re-applied.
  const appliedHandoffRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (handoffNonce === undefined) return;
    if (appliedHandoffRef.current === handoffNonce) return;
    appliedHandoffRef.current = handoffNonce;
    setSearchQuery(handoffTerm ?? "");
  }, [handoffNonce, handoffTerm]);

  useEffect(() => {
    if (!showShortcut) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showShortcut]);

  const searchKeysHash = JSON.stringify(searchableFieldsKeys);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (!searchQuery.trim()) {
        onSearchResultsUpdate(searchSourceData);
        return;
      }

      // Case-insensitive PARTIAL matching across ALL searchable fields
      // combined. The old matcher tested the WHOLE query against each
      // single field, so a multi-word query spanning two fields could
      // never match: searching a customer by the displayed full name
      // "ahsan ali" failed because no single field holds it (firstName
      // is "ahsan", lastName is "ali"). Now the query is split into
      // words and EVERY word must appear somewhere in the record's
      // combined searchable text. Field values are flattened deeply,
      // so populated references (an order's user, a product's
      // category/brand, a review's product/user) contribute their
      // names/emails too.
      const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

      const collect = (val: unknown, out: string[], depth: number) => {
        if (val === null || val === undefined || depth > 3) return;
        if (
          typeof val === "string" ||
          typeof val === "number" ||
          typeof val === "boolean"
        ) {
          out.push(String(val));
          return;
        }
        if (Array.isArray(val)) {
          val.forEach((v) => collect(v, out, depth + 1));
          return;
        }
        if (typeof val === "object") {
          Object.values(val as Record<string, unknown>).forEach((v) =>
            collect(v, out, depth + 1),
          );
        }
      };

      const filtered = searchSourceData.filter((item) => {
        const parts: string[] = [];
        searchableFieldsKeys.forEach((key) => collect(item[key], parts, 0));
        const haystack = parts.join(" ").toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });

      onSearchResultsUpdate(filtered);
    }, debounceDelay);

    return () => clearTimeout(handler);
  }, [searchQuery, searchKeysHash, searchSourceData, debounceDelay]);

  const activeSize = sizeStyles[searchSize] || sizeStyles.md;

  return (
    <div
      className={`relative inline-block sm:flex-1 ${
        isFullWidthSearch ? "w-full" : "w-full min-w-40 max-w-80"
      } ${className}`}
    >
      <Search
        className={`absolute text-[var(--text-muted)] top-1/2 -translate-y-1/2 opacity-70 pointer-events-none transition-colors ${activeSize.icon}`}
      />
      <input
        ref={searchInputRef}
        type="text"
        disabled={disabled}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t(searchPlaceholder)}
        autoComplete="off"
        className={`w-full font-medium transition-all outline-none ${
          activeSize.container
        } ${activeSize.input} ${
          variantStyles[searchVariant] || variantStyles.secondary
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        {...props}
      />
      {showShortcut && !searchQuery && (
        <kbd
          className={`absolute top-1/2 -translate-y-1/2 font-semibold text-[var(--text-muted)] bg-[var(--surface-muted)] border border-[var(--border)] rounded pointer-events-none ${activeSize.kbd}`}
        >
          Ctrl+/
        </kbd>
      )}
    </div>
  );
};

export default SearchBar;