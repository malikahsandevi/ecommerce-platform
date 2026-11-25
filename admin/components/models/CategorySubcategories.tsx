"use client";

import React from "react";
import { StatusPill } from "@/components/models/CreateTable";
import { useLanguage } from "@/services/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** A category row's parent id — the same rule the [pages] shell
 *  uses (the list API populates the ref, so it is normally an
 *  object; a bare id string is handled too). "" means the row is a
 *  MAIN category. */
export function categoryParentId(row: Row): string {
  const parent = row.parent as
    | { _id?: unknown; id?: unknown }
    | string
    | null
    | undefined;
  if (!parent) return "";
  if (typeof parent === "object") return String(parent._id || parent.id || "");
  return String(parent);
}

export interface SubcategoryRow {
  id: string;
  name: string;
  image: string;
  productsCount: number;
  status: string;
}

/** Plain display row for one subcategory — the shape the detail
 *  panel section and the edit popup's read-only block both render. */
export function toSubcategoryRow(row: Row): SubcategoryRow {
  return {
    id: String(row._id || row.id || ""),
    name: row.name || "",
    image: row.image || "",
    productsCount: row.productsCount ?? 0,
    status: row.status || (row.isActive === false ? "inactive" : "active"),
  };
}

/** The DIRECT subcategories of one category within the loaded rows
 *  (records whose parent is exactly this record — the uniform rule
 *  for mains and subcategories alike). */
export function directSubcategories(parentId: string, items: Row[]): SubcategoryRow[] {
  return items
    .filter((row) => categoryParentId(row) === parentId)
    .map(toSubcategoryRow);
}

const ROW_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] p-1.5";

/** Read-only subcategory rows: thumbnail, name, products count and
 *  status. With `onOpen` each row is a button (the detail panel
 *  hands the click through to that subcategory's own detail);
 *  without it the rows are plain display (the edit popup). */
export function CategorySubcategoryList({
  rows,
  onOpen,
}: {
  rows: SubcategoryRow[];
  onOpen?: (id: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const content = (
          <>
            {row.image ? (
              <img
                src={row.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-9 w-9 shrink-0 rounded-lg object-cover border border-[var(--border)]"
              />
            ) : (
              <span className="h-9 w-9 shrink-0 rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center text-xs font-bold">
                {(row.name.trim().charAt(0) || "C").toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-xs font-semibold text-[var(--text)]"
                title={row.name}
              >
                {row.name}
              </span>
              <span className="block text-[10px] text-[var(--text-muted)]">
                {row.productsCount} {t("Products")}
              </span>
            </span>
            <StatusPill status={row.status} />
          </>
        );

        return onOpen ? (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpen(row.id)}
            className={`${ROW_CLASS} cursor-pointer text-left transition-colors hover:border-[var(--primary)]`}
          >
            {content}
          </button>
        ) : (
          <div key={row.id} className={ROW_CLASS}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** Detail-panel section (Ahsan's order): a category's detail shows
 *  its own subcategories — a main category lists its subs, and a
 *  subcategory with children of its own lists those the same way.
 *  No children → one plain line. Clicking a row opens that
 *  subcategory's detail in the same panel. */
export function CategorySubcategoriesSection({
  parentId,
  items,
  onOpen,
}: {
  parentId: string;
  items: Row[];
  onOpen: (id: string) => void;
}) {
  const { t } = useLanguage();
  const rows = directSubcategories(parentId, items);

  return (
    <div className="pt-2 border-t border-[var(--border)]">
      <span className="text-[10px] font-bold text-[var(--text-muted)] block mb-1 uppercase tracking-wider">
        {t("Sub Categories")}
      </span>
      {rows.length > 0 ? (
        <CategorySubcategoryList rows={rows} onOpen={onOpen} />
      ) : (
        <p className="text-[11px] text-[var(--text-muted)]">{t("No subcategories")}</p>
      )}
    </div>
  );
}
