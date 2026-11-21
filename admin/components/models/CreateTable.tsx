// components/ui/CreateTable.tsx
import React, { useState } from "react";
import { Inbox, Pencil, Trash2 } from "lucide-react";

export interface CreateTableProps<T extends Record<string, any>> {
  data: T[];
  selectedItem?: T | null;
  onSelectItem?: (item: T) => void;
  onEditItem?: (item: T) => void;
  onDeleteItem?: (item: T) => void;
  columnHeaders?: { [key in keyof T]?: string };
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

  return (
    <div className="overflow-auto flex-1 w-full h-full [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-[var(--surface)] [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden relative">
      <table className="w-full min-w-170 text-left border-collapse">
        <thead className="bg-[var(--surface)] border-b border-[var(--border)] text-[var(--text-muted)] font-semibold sticky top-0 z-10 text-[11px] uppercase tracking-wide">
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
                            {/* Small Square Image Box */}
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
                      <div
                        className={`flex items-center gap-1 transition-opacity ${
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {onEditItem && (
                          <button
                            type="button"
                            title="Edit"
                            aria-label="Edit record"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditItem(item);
                            }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary-soft)] transition-colors"
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
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
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
  );
}
