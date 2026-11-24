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
 * While EDITING an existing order the lines render read-only: an
 * order's items are fixed at creation (the update endpoint accepts
 * lifecycle/payment/shipping fields only), so the editor shows what
 * was ordered without pretending it can change.
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

interface ProductPrice {
  _id: string;
  price?: number;
}

export default function OrderItemsField({
  value,
  options,
  disabled = false,
  onChange,
}: OrderItemsFieldProps) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<ProductPrice[]>([]);

  // Product prices price each line — the same source the payload
  // builder and the Coupon field use for the subtotal.
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
      ? value.map((line) => ({
          product: line?.product ? String(line.product) : "",
          quantity: Math.max(1, Number(line?.quantity) || 1),
        }))
      : [{ product: "", quantity: 1 }];

  const priceOf = (productId: string) =>
    products.find((p) => p._id === productId)?.price ?? 0;
  const lineTotal = (line: OrderLineDraft) =>
    priceOf(line.product) * Math.max(1, Number(line.quantity) || 1);
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

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
        {lines.map((line, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <Select
                value={line.product}
                options={options.map((option) => ({ ...option, label: t(option.label) }))}
                onChange={(val) => updateLine(index, { product: val })}
                placeholder={t("Select a product")}
                fullWidth
                variant="outline"
                size="md"
                disabled={disabled}
                emptyText={t("No options available yet.")}
              />
            </div>
            <div className="relative w-24 shrink-0">
              <input
                type="number"
                min={1}
                step={1}
                disabled={disabled}
                aria-label={t("Quantity")}
                value={line.quantity === undefined ? "" : line.quantity}
                onChange={(e) =>
                  updateLine(index, {
                    quantity: e.target.value === "" ? 1 : Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 pr-7 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] focus:border-[var(--primary)] transition-colors"
              />
              <StepperButtons
                disabled={disabled}
                onStep={(dir) =>
                  updateLine(index, {
                    quantity: steppedValue(line.quantity, dir, 1, 1, undefined),
                  })
                }
              />
            </div>
            <div className="w-20 shrink-0 pt-2.5 text-right text-xs font-bold text-[var(--text)]">
              {formatMoney(lineTotal(line), 2)}
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
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {!disabled ? (
          <Button variant="secondary" size="sm" type="button" icon={Plus} onClick={addLine}>
            {t("Add Item")}
          </Button>
        ) : (
          <span />
        )}
        <div className="text-xs text-[var(--text)]">
          <span className="text-[var(--text-muted)] mr-2">{t("Subtotal")}</span>
          <span className="font-bold">{formatMoney(subtotal, 2)}</span>
        </div>
      </div>
    </div>
  );
}
