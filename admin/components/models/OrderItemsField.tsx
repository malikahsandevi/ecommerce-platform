"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Select, { SelectOption } from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { StepperButtons, steppedValue } from "@/components/ui/NumberStepper";
import { apiClient } from "@/services/api";
import { formatMoney } from "@/services/currency";
import { useLanguage } from "@/services/i18n";

/**
 * The Create Order form's Items editor: one row per order line
 * (product picker + quantity), with Add / Remove for as many lines
 * as the order needs — the same product may appear on several lines
 * (the server aggregates quantities per product before its stock
 * check). Each line shows its own total (price × quantity, priced
 * from the product list exactly like the payload builder prices it)
 * and the block ends with the items subtotal, both updating live as
 * lines change. The Coupon field reads the same lines from formData,
 * so an applied coupon always validates against the lines as they
 * stand.
 *
 * A line's quantity can never pass its product's stock: typing,
 * pasting and the steppers all stop at the stock the OTHER lines of
 * the same product leave over, the remaining stock shows under the
 * quantity, and a product with nothing left is clamped to 0 and
 * marked Out of stock (such an order cannot be placed — the server
 * refuses it, and the line now says why before staff get there).
 * Changing a line's product re-clamps its quantity to the new
 * product's stock. Money figures render inside their own columns
 * (tabular figures, truncated with the full amount on hover), so no
 * total — however long — can push the row apart.
 *
 * While EDITING an existing order the lines render read-only: an
 * order's items are fixed at creation (the update endpoint accepts
 * lifecycle/payment/shipping fields only), so the editor shows what
 * was ordered without pretending it can change — historical
 * quantities are shown as placed, never re-clamped.
 */
export interface OrderLineDraft {
  product: string;
  quantity: number;
}

interface OrderItemsFieldProps {
  value: OrderLineDraft[];
  options: SelectOption[];
  disabled?: boolean;
  onChange: (lines: OrderLineDraft[]) => void;
}

interface ProductInfo {
  _id: string;
  price?: number;
  stock?: number;
}

export default function OrderItemsField({
  value,
  options,
  disabled = false,
  onChange,
}: OrderItemsFieldProps) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<ProductInfo[]>([]);

  // Product prices price each line — the same source the payload
  // builder and the Coupon field use for the subtotal. The same
  // payload carries each product's stock, which caps the quantities.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/products")
      .then(({ data }) => {
        if (!cancelled && Array.isArray(data)) setProducts(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const lines: OrderLineDraft[] =
    Array.isArray(value) && value.length
      ? value.map((line) => {
          const qty = Number(line?.quantity);
          return {
            product: line?.product ? String(line.product) : "",
            quantity: Number.isFinite(qty) && qty >= 0 ? qty : 1,
          };
        })
      : [{ product: "", quantity: 1 }];

  const priceOf = (productId: string) =>
    products.find((p) => p._id === productId)?.price ?? 0;

  // The product's stock, or undefined while the product list (and
  // with it the stock) has not loaded or names no such product.
  const stockOf = (productId: string): number | undefined => {
    if (!productId) return undefined;
    const found = products.find((p) => p._id === productId);
    if (!found || found.stock === undefined || found.stock === null) return undefined;
    return Math.max(0, Number(found.stock) || 0);
  };

  // How much of the product the OTHER lines already claim.
  const claimedElsewhere = (index: number, productId: string) =>
    lines.reduce(
      (sum, line, i) =>
        i !== index && line.product === productId
          ? sum + Math.max(0, Number(line.quantity) || 0)
          : sum,
      0,
    );

  // The most one line may hold: its product's stock minus what the
  // other lines of the same product already claim. Undefined while
  // the stock is unknown (no cap yet — the server still guards).
  const capFor = (index: number, line: OrderLineDraft): number | undefined => {
    const stock = stockOf(line.product);
    if (stock === undefined) return undefined;
    return Math.max(0, stock - claimedElsewhere(index, line.product));
  };

  // The quantity a line effectively carries. Read-only lines keep
  // their placed quantity; editable lines clamp into [1, cap] — and
  // to exactly 0 when nothing is left for the line.
  const effectiveQuantity = (
    index: number,
    line: OrderLineDraft,
    rawOverride?: number,
  ): number => {
    const raw = rawOverride !== undefined ? rawOverride : Number(line.quantity);
    const base = Number.isFinite(raw) ? raw : 1;
    if (disabled) return Math.max(1, base);
    const cap = capFor(index, line);
    if (cap === undefined) return Math.max(1, base);
    if (cap === 0) return 0;
    return Math.min(cap, Math.max(1, base));
  };

  // Re-clamp pass: a product change, a duplicate line growing, or
  // the product list arriving can leave a stored quantity above its
  // cap — write the clamped lines back so the payload, the Coupon
  // field and the shipping quote all read the same numbers the
  // editor shows. Runs only when a quantity actually changes, so
  // it settles in one pass.
  useEffect(() => {
    if (disabled || !products.length) return;
    let changed = false;
    const corrected = lines.map((line, index) => {
      const qty = effectiveQuantity(index, line);
      if (qty !== line.quantity) changed = true;
      return qty === line.quantity ? line : { ...line, quantity: qty };
    });
    if (changed) onChange(corrected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, products, value]);

  const lineTotal = (line: OrderLineDraft, index: number) =>
    priceOf(line.product) * effectiveQuantity(index, line);
  const subtotal = lines.reduce((sum, line, index) => sum + lineTotal(line, index), 0);

  const updateLine = (index: number, patch: Partial<OrderLineDraft>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
  };

  const addLine = () => {
    onChange([...lines, { product: "", quantity: 1 }]);
  };

  return (
    <div>
      {/* Column labels — the same Product / Quantity wording the
          single-item form carried, kept over the line rows. */}
      <div className="hidden sm:flex items-center gap-2 mb-1 pr-11 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        <span className="flex-1 min-w-0">{t("Product")}</span>
        <span className="w-24 shrink-0">{t("Quantity")}</span>
        <span className="w-20 shrink-0 text-right">{t("Total")}</span>
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => {
          const cap = disabled ? undefined : capFor(index, line);
          const outOfStock = cap === 0;
          const quantity = effectiveQuantity(index, line);
          const totalText = formatMoney(lineTotal(line, index), 2);
          return (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={line.product}
                  options={options.map((option) => ({ ...option, label: t(option.label) }))}
                  onChange={(val) => {
                    const next = { ...line, product: val };
                    updateLine(index, {
                      product: val,
                      quantity: effectiveQuantity(index, next),
                    });
                  }}
                  placeholder={t("Select a product")}
                  fullWidth
                  variant="outline"
                  size="md"
                  disabled={disabled}
                  emptyText={t("No options available yet.")}
                />
              </div>
              <div className="w-24 shrink-0">
                <div className="relative">
                  <input
                    type="number"
                    min={outOfStock ? 0 : 1}
                    max={cap}
                    step={1}
                    disabled={disabled || outOfStock}
                    aria-label={t("Quantity")}
                    value={quantity}
                    onChange={(e) =>
                      updateLine(index, {
                        quantity: effectiveQuantity(
                          index,
                          line,
                          e.target.value === "" ? 1 : Number(e.target.value),
                        ),
                      })
                    }
                    className="w-full px-3 py-2 pr-7 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] transition-colors disabled:opacity-60"
                  />
                  <StepperButtons
                    disabled={disabled || outOfStock}
                    onStep={(dir) =>
                      updateLine(index, {
                        quantity: steppedValue(quantity, dir, 1, outOfStock ? 0 : 1, cap),
                      })
                    }
                  />
                </div>
                {!disabled && line.product && cap !== undefined &&
                  (outOfStock ? (
                    <p className="mt-1 text-[10px] font-semibold text-red-500">
                      {t("Out of stock")}
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                      {t("{count} in stock").replace("{count}", String(cap))}
                    </p>
                  ))}
              </div>
              <div className="w-20 shrink-0 pt-2.5 text-right">
                <span
                  title={totalText}
                  className="block truncate text-xs font-bold tabular-nums text-[var(--text)]"
                >
                  {totalText}
                </span>
              </div>
              {!disabled && (
                <Button
                  variant="danger"
                  size="sm"
                  type="button"
                  icon={Trash2}
                  disabled={lines.length <= 1}
                  onClick={() => removeLine(index)}
                  aria-label={t("Remove item")}
                  title={t("Remove item")}
                  className="h-[34px] w-[34px] shrink-0"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {!disabled ? (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            icon={Plus}
            onClick={addLine}
            className="shrink-0"
          >
            {t("Add Item")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex min-w-0 items-baseline text-xs text-[var(--text)]">
          <span className="mr-2 shrink-0 text-[var(--text-muted)]">{t("Subtotal")}</span>
          <span
            title={formatMoney(subtotal, 2)}
            className="min-w-0 truncate font-bold tabular-nums"
          >
            {formatMoney(subtotal, 2)}
          </span>
        </div>
      </div>
    </div>
  );
}
