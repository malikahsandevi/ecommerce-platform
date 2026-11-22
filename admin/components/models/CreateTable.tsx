// components/ui/CreateTable.tsx
import React, { useLayoutEffect, useRef, useState } from "react";
import { Inbox, Pencil, Trash2 } from "lucide-react";
import { AvatarViewerTrigger } from "@/components/ui/AvatarViewer";
import { useLanguage } from "@/services/i18n";

export interface CreateTableProps<T extends Record<string, any>> {
  data: T[];
  selectedItem?: T | null;
  onSelectItem?: (item: T) => void;
  onEditItem?: (item: T) => void;
  onDeleteItem?: (item: T) => void;
  columnHeaders?: { [key in keyof T]?: string };
  /**
   * Per-column alignment overrides from the resource config. The
   * default rule (see defaultColumnAlign) already covers the standard
   * keys; a config only lists the columns that break it.
   */
  columnAlign?: Record<string, "left" | "center">;
  /**
   * Per-column character cap for the RENDERED cell text (long
   * free-text columns — e.g. a review's body): the cell shows at most
   * this many characters plus "…"; the full value stays in the data
   * and on the cell's title tooltip.
   */
  columnMaxChars?: Record<string, number>;
  /**
   * User-avatar rows only (the Customers table): the name-cell image
   * becomes an avatar-viewer trigger (eye overlay on hover, FLIP-morph
   * popup on click) with an initial-letter fallback if it fails.
   */
  enableAvatarViewer?: boolean;
}

/**
 * Column alignment rule (Ahsan's): the identifier/text columns — ID,
 * SKU, order number, and every name column — start from the LEFT;
 * every other column is CENTRED, its header sitting centred over its
 * centred content. Resource configs can override a column through
 * their `columnAlign` map when a key breaks the rule.
 */
function defaultColumnAlign(key: string): "left" | "center" {
  const k = key.toLowerCase();
  if (
    k === "_id" ||
    k === "id" ||
    k === "sku" ||
    k === "ordernumber" ||
    k === "name" ||
    k === "title" ||
    k.endsWith("name")
  ) {
    return "left";
  }
  return "center";
}

/**
 * Offscreen ruler in the header's own type style (11px, semibold,
 * uppercase, tracking-wide) used to measure the one-line width each
 * header label needs — columns never get narrower than that.
 */
let headerRuler: HTMLSpanElement | null = null;
function getHeaderRuler(): HTMLSpanElement {
  if (!headerRuler) {
    headerRuler = document.createElement("span");
    headerRuler.style.cssText =
      "position:absolute;visibility:hidden;white-space:nowrap;font-size:11px;font-weight:600;letter-spacing:0.025em;text-transform:uppercase;";
    document.body.appendChild(headerRuler);
  }
  return headerRuler;
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

/**
 * Name-cell thumbnail with a React-managed error fallback. The old
 * onError handler wrote `parentElement.innerText = "N/A"`, which
 * ripped the <img> out of the DOM behind React's back — the next
 * re-render that unmounted the row then died with "Failed to execute
 * 'removeChild' on 'Node'" and took the whole page down. Any broken
 * image URL poisoned its row; filtering (which unmounts rows
 * constantly) made the crash easy to hit.
 */
function CellThumb({ src, alt }: { src: string; alt: string }) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="text-[10px] text-[var(--text-muted)] font-bold">
        {t("N/A")}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function StatusPill({ status }: { status: unknown }) {
  const { t } = useLanguage();
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
      {t(label)}
    </span>
  );
}


const ENUM_VALUE_COLUMNS = new Set([
  "role",
  "paymentstatus",
  "paymentmethod",
  "moderationstatus",
  "accountstatus",
]);
const ENUM_VALUE_LABELS = new Set([
  "Super Admin", "Admin", "Manager", "Editor", "Support", "Customer", "Staff",
  "Pending", "Paid", "Unpaid", "Failed", "Refunded", "Partially Paid",
  "Processing", "Shipped", "Delivered", "Cancelled", "Active", "Inactive",
  "Approved", "Rejected", "Spam", "Published", "Draft",
  "Cash on Delivery", "Card", "Bank Transfer",
]);
const enumTitleCase = (value: string): string =>
  value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function CreateTable<T extends Record<string, any>>({
  data,
  selectedItem: externalSelectedItem,
  onSelectItem,
  onEditItem,
  onDeleteItem,
  columnHeaders,
  columnAlign,
  columnMaxChars,
  enableAvatarViewer,
}: CreateTableProps<T>) {
  const { t } = useLanguage();
  const showActions = Boolean(onEditItem || onDeleteItem);

  const alignFor = (key: string): "left" | "center" =>
    columnAlign?.[key] ?? defaultColumnAlign(key);
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
    // The body table itself is sized to the scroller's client width
    // (see the fit step below), which keeps the first/last cell insets
    // structurally equal — no padding arithmetic anywhere.
    const sbw = bodyWrap.offsetWidth - bodyWrap.clientWidth;
    headerWrap.style.paddingRight = `${sbw}px`;

    const expectedCells = columns.length + (showActions ? 1 : 0);
    const firstRow = bodyTable.tBodies[0]?.rows[0];
    if (firstRow && expectedCells > 0 && firstRow.cells.length === expectedCells) {
      const measured = Array.from(firstRow.cells).map(
        (cell) => cell.getBoundingClientRect().width,
      );

      // One-line headers: a column may never be narrower than its
      // header label needs on a single line. The header font is
      // measured with an offscreen ruler in the header's own style
      // (11px, semibold, uppercase, tracking-wide) plus the cell's
      // horizontal padding. When the minimums overflow the container
      // the body wrapper scrolls horizontally (header follows via the
      // scrollLeft mirror) instead of crushing columns together.
      const ruler = getHeaderRuler();
      const headerCells = headerTable.tHead?.rows[0]?.cells;
      const mins = measured.map((_, i) => {
        const label = headerCells?.[i]?.textContent?.trim() ?? "";
        ruler.textContent = label;
        return Math.max(ruler.getBoundingClientRect().width + 22, 60);
      });
      const widths = measured.map((w, i) => Math.max(w, mins[i]));

      // The status pill is a fixed component that must never clip:
      // if the first row's pill is wider than the column (its cell's
      // scrollWidth tells the truth even when clipped), raise both
      // the column's width and its shrink floor to fit the pill.
      const statusIdx = columns.findIndex(
        (c) => String(c).toLowerCase() === "status",
      );
      if (statusIdx >= 0 && firstRow.cells[statusIdx]) {
        const pillNeed = firstRow.cells[statusIdx].scrollWidth;
        if (pillNeed > widths[statusIdx]) {
          widths[statusIdx] = pillNeed;
          mins[statusIdx] = Math.max(mins[statusIdx], pillNeed);
        }
      }

      // Fit the container exactly. Under-full: the leftover is shared
      // out proportionally. Over-full: columns sitting above their
      // header minimum give back space in proportion to their slack,
      // so the table still fits edge-to-edge instead of scrolling —
      // a column only keeps an overflowing width when every column
      // is already at its one-line minimum.
      const available = bodyWrap.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      let finalWidths = widths;
      if (total > 0 && total < available) {
        const extra = available - total;
        finalWidths = widths.map((w) => w + (extra * w) / total);
      } else if (total > available) {
        const overflow = total - available;
        const slack = widths.map((w, i) => Math.max(0, w - mins[i]));
        const slackTotal = slack.reduce((a, b) => a + b, 0);
        if (slackTotal >= overflow) {
          finalWidths = widths.map(
            (w, i) => w - (overflow * slack[i]) / slackTotal,
          );
        }
      }
      const finalTotal = finalWidths.reduce((a, b) => a + b, 0);

      const applyWidths = (table: HTMLTableElement) => {
        let colgroup = table.querySelector("colgroup");
        if (!colgroup) {
          colgroup = document.createElement("colgroup");
          table.prepend(colgroup);
        }
        while (colgroup.children.length < finalWidths.length) {
          colgroup.appendChild(document.createElement("col"));
        }
        while (colgroup.children.length > finalWidths.length) {
          colgroup.lastElementChild?.remove();
        }
        finalWidths.forEach((w, i) => {
          (colgroup!.children[i] as HTMLElement).style.width = `${w}px`;
        });
        table.style.tableLayout = "fixed";
        table.style.width = `${finalTotal}px`;
      };
      applyWidths(headerTable);
      applyWidths(bodyTable);
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
          className="sync-table w-full min-w-170 text-left border-collapse"
        >
          <thead className="bg-[var(--surface)] border-b border-[var(--border)] text-[var(--text-muted)] font-semibold text-[11px] uppercase tracking-wide">
            <tr>
              {columns.map((colKey, index) => {
                const align = alignFor(String(colKey));
                return (
                  <th
                    key={String(colKey) + index}
                    className={`px-2.5 py-3 whitespace-nowrap ${align === "center" ? "text-center" : "text-left"}`}
                  >
                    <div className={`flex items-center gap-1 select-none whitespace-nowrap ${align === "center" ? "justify-center" : ""}`}>
                      {t(columnHeaders?.[colKey] ?? String(colKey))}
                    </div>
                  </th>
                );
              })}
              {showActions && <th className="px-2.5 py-3 w-20 whitespace-nowrap text-center">{t("Actions")}</th>}
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
          className={`sync-table w-full min-w-170 text-left border-collapse ${hasData ? "" : "h-full"}`}
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
                    const alignClass =
                      alignFor(String(colKey)) === "center"
                        ? "text-center"
                        : "text-left";

                    // 1. ID Column — the short public code when the row
                    // carries one, otherwise the truncated raw id.
                    if (colKeyStr === "_id" || colKeyStr === "id") {
                      const displayId = item.code
                        ? String(item.code)
                        : formatId(rawValue);
                      return (
                        <td
                          key={String(colKey) + idx}
                          className={`px-2.5 py-2.5 align-middle font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap overflow-hidden ${alignClass}`}
                          title={displayId}
                        >
                          <span className="block truncate">{displayId}</span>
                        </td>
                      );
                    }

                    // 2. Status Column (Pill)
                    if (colKeyStr === "status") {
                      return (
                        <td key={String(colKey) + idx} className={`px-2.5 py-2.5 align-middle overflow-hidden ${alignClass}`}>
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
                        <td
                          key={String(colKey) + idx}
                          className={`px-2.5 py-2.5 align-middle overflow-hidden ${alignClass}`}
                          title={rawValue !== undefined && rawValue !== null ? String(rawValue) : undefined}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {enableAvatarViewer && isUrl ? (
                              <AvatarViewerTrigger
                                src={imgUrl as string}
                                alt={String(rawValue || t("User"))}
                                sizeClass="w-8 h-8"
                                roundedClass="rounded-lg"
                                className="border border-[var(--border)]"
                                fallbackLabel={(String(rawValue || "N").trim().charAt(0) || "N").toUpperCase()}
                              />
                            ) : (
                            /* Small Square Image Box */
                            <div className="w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex items-center justify-center overflow-hidden shrink-0">
                              {isUrl ? (
                                <CellThumb
                                  key={imgUrl as string}
                                  src={imgUrl as string}
                                  alt={String(rawValue || t("Product"))}
                                />
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)] font-bold">
                                  {(String(rawValue || "N").trim().charAt(0) || "N").toUpperCase()}
                                </span>
                              )}
                            </div>
                            )}

                            {/* Name Text */}
                            <span className="font-medium text-[var(--text)] line-clamp-2 min-w-0">
                              {rawValue !== undefined && rawValue !== null
                                ? String(rawValue)
                                : "-"}
                            </span>
                          </div>
                        </td>
                      );
                    }

                    // 4. Standard Cells — content is contained in its
                    // own cell: a long unbroken value (phone, email,
                    // SKU) truncates with an ellipsis instead of
                    // spilling into the next column; the full value
                    // stays on the cell's title tooltip. A URL value
                    // (a website column, or any http(s) string) shows
                    // ONLY the host — the part after the protocol — as
                    // PLAIN TEXT (Ahsan: "sirf name show krna tha, link
                    // bhi nhi bnana tha"), never the raw full URL and
                    // never a clickable link.
                    const rawDisplayText =
                      rawValue !== undefined && rawValue !== null && rawValue !== ""
                        ? String(rawValue)
                        : "-";
                    // Enum columns (role, payment status/method, …) show
                    // their label in the active language; anything else
                    // is data and stays untouched.
                    const enumLabel = ENUM_VALUE_COLUMNS.has(colKeyStr)
                      ? enumTitleCase(rawDisplayText)
                      : null;
                    const displayText =
                      enumLabel && ENUM_VALUE_LABELS.has(enumLabel)
                        ? t(enumLabel)
                        : rawDisplayText;
                    const isUrlCell =
                      typeof rawValue === "string" &&
                      (/^https?:\/\//i.test(rawValue) ||
                        (colKeyStr === "website" &&
                          rawValue.includes(".") &&
                          !rawValue.includes(" ")));
                    const urlLabel = isUrlCell
                      ? (() => {
                          try {
                            return new URL(
                              /^https?:\/\//i.test(displayText)
                                ? displayText
                                : `https://${displayText}`,
                            ).host;
                          } catch {
                            return displayText
                              .replace(/^https?:\/\//i, "")
                              .split("/")[0];
                          }
                        })()
                      : null;
                    // Character-capped preview for long free-text
                    // columns (config-driven): the rendered text is
                    // cut at the cap with an ellipsis; the cell's
                    // title (set below from the raw value) and the
                    // underlying data keep the FULL text.
                    const charCap = columnMaxChars?.[colKeyStr];
                    const previewText =
                      !isUrlCell && charCap && displayText.length > charCap
                        ? `${displayText.slice(0, charCap).trimEnd()}…`
                        : displayText;
                    return (
                      <td
                        key={String(colKey) + idx}
                        className={`px-2.5 py-2.5 align-middle overflow-hidden ${alignClass}`}
                        title={
                          typeof rawValue === "string" || typeof rawValue === "number"
                            ? String(rawValue)
                            : undefined
                        }
                      >
                        <span className="block truncate">
                          {isUrlCell ? urlLabel : previewText}
                        </span>
                      </td>
                    );
                  })}

                  {showActions && (
                    <td className="px-2.5 py-2.5 align-middle overflow-hidden text-center">
                      {/* Row actions are ALWAYS visible: muted gray on
                          rest, full colour on the hovered (or selected)
                          row — edit in the primary tone, delete in full
                          red — with a smooth colour transition both
                          ways. */}
                      <div className="flex items-center gap-1 justify-center">
                        {onEditItem && (
                          <button
                            type="button"
                            title={t("Edit")}
                            aria-label={t("Edit record")}
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
                            title={t("Delete")}
                            aria-label={t("Delete record")}
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
                className="p-10 text-center align-middle bg-[var(--background)]"
              >
                <div className="flex flex-col items-center gap-1.5 text-[var(--text-muted)]">
                  <Inbox className="w-7 h-7 opacity-50" />
                  <span className="text-xs font-semibold text-[var(--text)]">
                    {t("No records found")}
                  </span>
                  <span className="text-[11px]">
                    {t("Nothing here yet — new records will appear in this list.")}
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
