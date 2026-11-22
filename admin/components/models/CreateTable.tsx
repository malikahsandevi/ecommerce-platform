// components/ui/CreateTable.tsx
import React, { useLayoutEffect, useRef, useState } from "react";
import { Inbox, Pencil, Trash2 } from "lucide-react";
import { AvatarViewerTrigger } from "@/components/ui/AvatarViewer";

export interface CreateTableProps<T extends Record<string, any>> {
  data: T[];
  selectedItem?: T | null;
  onSelectItem?: (item: T) => void;
  onEditItem?: (item: T) => void;
  onDeleteItem?: (item: T) => void;
  columnHeaders?: { [key in keyof T]?: string };
  /**
   * User-avatar rows only (the Customers table): the name-cell image
   * becomes an avatar-viewer trigger (eye overlay on hover, FLIP-morph
   * popup on click) with an initial-letter fallback if it fails.
   */
  enableAvatarViewer?: boolean;
}

// Helper function to truncate long MongoDB or UUID IDs
const formatId = (idValue: any): string => {
  const str = String(idValue || "");
  if (str.length > 10) {
    return `${str.slice(0, 6)}...${str.slice(-4)}`;
  }
  return str;
};

/** Colour family per status family — unknown statuses fall back to neutral. */
function statusPillClasses(status: string): string {
  const value = status.toLowerCase();
  if (
    ["active", "published", "approved", "delivered", "paid", "completed"].includes(value)
  ) {
    return "bg-emerald-500/10 text-emerald-600 border-emerald-500/25";
  }
  if (
    ["pending", "processing", "pending_review", "shipped"].includes(value)
  ) {
    return "bg-amber-500/10 text-amber-600 border-amber-500/25";
  }
  if (
    ["cancelled", "rejected", "failed", "refunded", "expired", "blocked"].includes(value)
  ) {
    return "bg-red-500/10 text-red-500 border-red-500/25";
  }
  return "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]";
}

export function StatusPill({ status }: { status: unknown }) {
  const label = String(status ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (!label) return <span className="text-[var(--text-muted)]">-</span>;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusPillClasses(
        String(status)
      )}`}
    >
      {label}
    </span>
  );
}

export function CreateTable<T extends Record<string, any>>({
  data,
  selectedItem: externalSelectedItem,
  onSelectItem,
  onEditItem,
  onDeleteItem,
  columnHeaders,
  enableAvatarViewer,
}: CreateTableProps<T>) {
  const showActions = Boolean(onEditItem || onDeleteItem);
  const [internalSelectedItem, setInternalSelectedItem] = useState<T | null>(null);

  const currentSelectedItem =
    externalSelectedItem !== undefined ? externalSelectedItem : internalSelectedItem;

  const hasData = Array.isArray(data) && data.length > 0;

  // Filter out separate image/url columns if present in headers
  const columns = (
    columnHeaders
      ? (Object.keys(columnHeaders) as Array<keyof T>)
      : hasData
      ? (Object.keys(data[0]) as Array<keyof T>)
      : []
  ).filter((colKey) => {
    const keyStr = String(colKey).toLowerCase();
    return keyStr !== "image" && keyStr !== "images" && keyStr !== "url";
  });

  const handleRowClick = (item: T) => {
    setInternalSelectedItem(item);
    if (onSelectItem) {
      onSelectItem(item);
    }
  };

  // --- Scrollbar spans the BODY only -------------------------------------
  // The header row lives OUTSIDE the scroll container and the pagination
  // footer lives outside the table entirely, so the vertical scrollbar's
  // track + thumb cover exactly the rows region — never the header, never
  // the footer. The header is a twin table whose column widths are synced
  // from the body table's laid-out columns (and whose right padding takes
  // the body's scrollbar width), so header and body columns stay aligned
  // whether or not a scrollbar is present; horizontal scrolling is
  // mirrored onto the header.
  const headerWrapRef = useRef<HTMLDivElement>(null);
  const bodyWrapRef = useRef<HTMLDivElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  const bodyTableRef = useRef<HTMLTableElement>(null);

  const syncTableChrome = () => {
    const headerWrap = headerWrapRef.current;
    const bodyWrap = bodyWrapRef.current;
    const headerTable = headerTableRef.current;
    const bodyTable = bodyTableRef.current;
    if (!headerWrap || !bodyWrap || !headerTable || !bodyTable) return;

    // Reserve exactly the body's vertical-scrollbar width on the header's
    // right edge so the last header cell ends where the body cells end.
    const sbw = bodyWrap.offsetWidth - bodyWrap.clientWidth;
    headerWrap.style.paddingRight = `${sbw}px`;

    const expectedCells = columns.length + (showActions ? 1 : 0);
    const firstRow = bodyTable.tBodies[0]?.rows[0];
    if (firstRow && expectedCells > 0 && firstRow.cells.length === expectedCells) {
      const widths = Array.from(firstRow.cells).map(
        (cell) => cell.getBoundingClientRect().width,
      );
      let colgroup = headerTable.querySelector("colgroup");
      if (!colgroup) {
        colgroup = document.createElement("colgroup");
        headerTable.prepend(colgroup);
      }
      while (colgroup.children.length < widths.length) {
        colgroup.appendChild(document.createElement("col"));
      }
      while (colgroup.children.length > widths.length) {
        colgroup.lastElementChild?.remove();
      }
      widths.forEach((w, i) => {
        (colgroup!.children[i] as HTMLElement).style.width = `${w}px`;
      });
      headerTable.style.tableLayout = "fixed";
      headerTable.style.width = `${bodyTable.getBoundingClientRect().width}px`;
    }
    headerWrap.scrollLeft = bodyWrap.scrollLeft;
  };

  useLayoutEffect(() => {
    syncTableChrome();
    const bodyWrap = bodyWrapRef.current;
    if (!bodyWrap) return;
    const observer = new ResizeObserver(() => syncTableChrome());
    observer.observe(bodyWrap);
    return () => observer.disconnect();
  });

  return (
    <div className="flex flex-col flex-1 w-full h-full relative overflow-hidden">
      <div ref={headerWrapRef} className="overflow-hidden shrink-0">
        <table
          ref={headerTableRef}
          className="w-full min-w-170 text-left border-collapse"
        >
          <thead className="bg-[var(--surface)] border-b border-[var(--border)] text-[var(--text-muted)] font-semibold text-[11px] uppercase tracking-wide">
            <tr>
              {columns.map((colKey, index) => (
                <th key={String(colKey) + index} className="px-3 py-3">
                  <div className="flex items-center gap-1 select-none">
                    {columnHeaders?.[colKey] ?? String(colKey)}
                  </div>
                </th>
              ))}
              {showActions && <th className="px-3 py-3 w-20">Actions</th>}
            </tr>
          </thead>
        </table>
      </div>

      <div
        ref={bodyWrapRef}
        onScroll={() => {
          if (headerWrapRef.current && bodyWrapRef.current) {
            headerWrapRef.current.scrollLeft = bodyWrapRef.current.scrollLeft;
          }
        }}
        className="overflow-auto flex-1 w-full min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-[var(--surface)] [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full"
      >
        <table
          ref={bodyTableRef}
          className="w-full min-w-170 text-left border-collapse"
        >
          <tbody className="divide-y divide-[var(--border)] text-xs text-[var(--text)]">
          {hasData ? (
            data.map((item, index) => {
              const isSelected = currentSelectedItem === item;

              return (
                <tr
                  key={index}
                  onClick={() => handleRowClick(item)}
                  className={`group cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--primary-soft)] shadow-[inset_3px_0_0_var(--primary)]"
                      : "bg-[var(--background)] hover:bg-[var(--primary-soft)]/60"
                  }`}
                >
                  {columns.map((colKey, idx) => {
                    const rawValue = item[colKey];
                    const colKeyStr = String(colKey).toLowerCase();

                    // 1. ID Column — the short public code when the row
                    // carries one, otherwise the truncated raw id.
                    if (colKeyStr === "_id" || colKeyStr === "id") {
                      const displayId = item.code
                        ? String(item.code)
                        : formatId(rawValue);
                      return (
                        <td
                          key={String(colKey) + idx}
                          className="px-3 py-2.5 align-middle font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap"
                          title={displayId}
                        >
                          {displayId}
                        </td>
                      );
                    }

                    // 2. Status Column (Pill)
                    if (colKeyStr === "status") {
                      return (
                        <td key={String(colKey) + idx} className="px-3 py-2.5 align-middle">
                          <StatusPill status={rawValue} />
                        </td>
                      );
                    }

                    // 3. Name Column (Combine Image + Name)
                    if (
                      colKeyStr === "name" ||
                      colKeyStr === "productname" ||
                      colKeyStr === "title"
                    ) {
                      const imgUrl = item.image || item.url || item.productImage;
                      const isUrl =
                        typeof imgUrl === "string" &&
                        (imgUrl.startsWith("http") ||
                          imgUrl.startsWith("/") ||
                          imgUrl.startsWith("data:image"));

                      return (
                        <td key={String(colKey) + idx} className="px-3 py-2.5 align-middle">
                          <div className="flex items-center gap-2.5">
                            {enableAvatarViewer && isUrl ? (
                              <AvatarViewerTrigger
                                src={imgUrl as string}
                                alt={String(rawValue || "User")}
                                sizeClass="w-8 h-8"
                                roundedClass="rounded-lg"
                                className="border border-[var(--border)]"
                                fallbackLabel={(String(rawValue || "N").trim().charAt(0) || "N").toUpperCase()}
                              />
                            ) : (
                            /* Small Square Image Box */
                            <div className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center overflow-hidden shrink-0">
                              {isUrl ? (
                                <img
                                  src={imgUrl}
                                  alt={String(rawValue || "Product")}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = "none";
                                    if (target.parentElement) {
                                      target.parentElement.innerText = "N/A";
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)] font-bold">
                                  {(String(rawValue || "N").trim().charAt(0) || "N").toUpperCase()}
                                </span>
                              )}
                            </div>
                            )}

                            {/* Name Text */}
                            <span className="font-medium text-[var(--text)] line-clamp-2">
                              {rawValue !== undefined && rawValue !== null
                                ? String(rawValue)
                                : "-"}
                            </span>
                          </div>
                        </td>
                      );
                    }

                    // 4. Standard Cells
                    return (
                      <td key={String(colKey) + idx} className="px-3 py-2.5 align-middle">
                        {rawValue !== undefined && rawValue !== null && rawValue !== ""
                          ? String(rawValue)
                          : "-"}
                      </td>
                    );
                  })}

                  {showActions && (
                    <td className="px-3 py-2.5 align-middle">
                      {/* Row actions are ALWAYS visible: muted gray on
                          rest, full colour on the hovered (or selected)
                          row — edit in the primary tone, delete in full
                          red — with a smooth colour transition both
                          ways. */}
                      <div className="flex items-center gap-1">
                        {onEditItem && (
                          <button
                            type="button"
                            title="Edit"
                            aria-label="Edit record"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditItem(item);
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-200 hover:bg-[var(--primary-soft)] ${
                              isSelected
                                ? "text-[var(--primary)]"
                                : "text-[var(--text-muted)] group-hover:text-[var(--primary)]"
                            }`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteItem && (
                          <button
                            type="button"
                            title="Delete"
                            aria-label="Delete record"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteItem(item);
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-200 hover:bg-red-500/10 ${
                              isSelected
                                ? "text-red-500"
                                : "text-[var(--text-muted)] group-hover:text-red-500"
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={(columns.length || 1) + (showActions ? 1 : 0)}
                className="p-10 text-center bg-[var(--background)]"
              >
                <div className="flex flex-col items-center gap-1.5 text-[var(--text-muted)]">
                  <Inbox className="w-7 h-7 opacity-50" />
                  <span className="text-xs font-semibold text-[var(--text)]">
                    No records found
                  </span>
                  <span className="text-[11px]">
                    Nothing here yet — new records will appear in this list.
                  </span>
                </div>
              </td>
            </tr>
          )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
