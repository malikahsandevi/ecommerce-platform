"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/api";
import { formatMoney } from "@/services/currency";
import { useLanguage } from "@/services/i18n";

interface QuoteResponse {
  subtotal: number;
  configured: boolean;
  shippingCharge: number;
  freeApplied?: boolean;
  total: number;
}

/**
 * Create Order's live shipping quote: the lines + the chosen
 * shipping method / delivery option / city go to the SAME shared
 * calculator the server prices orders with (POST
 * /orders/shipping-quote), and the answer renders as the money
 * rows under the Fulfilment section. Advisory only — createOrder
 * recomputes the charge at placement, so this preview can never
 * drift into the record. On a store with no shipping methods the
 * panel says so plainly and the order carries no shipping charge,
 * exactly as before.
 */
export default function ShippingQuoteField({
  items,
  methodId,
  deliveryOptionId,
  city,
  couponDiscount,
}: {
  items: Array<{ product?: string; quantity?: number }>;
  methodId?: string;
  deliveryOptionId?: string;
  city?: string;
  couponDiscount?: number;
}) {
  const { t } = useLanguage();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const requestRef = useRef(0);

  const linesKey = JSON.stringify(
    (items || []).map((line) => [line.product || "", Number(line.quantity) || 0]),
  );

  useEffect(() => {
    const lines = JSON.parse(linesKey) as Array<[string, number]>;
    const hasLines = lines.some(([product]) => product);
    if (!hasLines) {
      setQuote(null);
      return;
    }
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.post("/orders/shipping-quote", {
          items: lines
            .filter(([product]) => product)
            .map(([product, quantity]) => ({ product, quantity })),
          shippingMethodId: methodId || undefined,
          deliveryOptionId: deliveryOptionId || undefined,
          city: city || undefined,
        });
        if (requestRef.current === requestId) setQuote(data as QuoteResponse);
      } catch {
        // Advisory only — a failed quote never blocks the form; the
        // last good numbers stay on screen.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [linesKey, methodId, deliveryOptionId, city]);

  if (!quote) return null;

  const discount = couponDiscount && couponDiscount > 0 ? couponDiscount : 0;
  const total = Math.max(0, quote.subtotal - discount + (quote.configured ? quote.shippingCharge : 0));

  // Money rows stay inside the panel however long a figure gets:
  // the label keeps its width, the value right-aligns in tabular
  // figures and truncates with the full amount on hover.
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
      <span
        title={value}
        className={`min-w-0 truncate text-right tabular-nums ${
          strong ? "text-sm font-bold text-[var(--text)]" : "text-xs font-semibold text-[var(--text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2">
      {row(t("Subtotal"), formatMoney(quote.subtotal, 2))}
      {discount > 0 && row(t("Discount"), `− ${formatMoney(discount, 2)}`)}
      {quote.configured
        ? row(
            t("Shipping Charge"),
            quote.shippingCharge === 0
              ? t("Free")
              : formatMoney(quote.shippingCharge, 2),
          )
        : row(t("Shipping Charge"), formatMoney(0, 2))}
      <div className="mt-1 border-t border-[var(--border)] pt-1">
        {row(t("Total"), formatMoney(total, 2), true)}
      </div>
      {!quote.configured && (
        <p className="pb-1 text-[10px] text-[var(--text-muted)]">
          {t("No shipping methods are configured — this order carries no shipping charge.")}
        </p>
      )}
    </div>
  );
}
