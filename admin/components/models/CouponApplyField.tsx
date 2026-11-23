"use client";

import React, { useEffect, useRef, useState } from "react";
import { TicketPercent, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { apiClient, extractApiError } from "@/services/api";
import { formatMoney } from "@/services/currency";
import { useLanguage } from "@/services/i18n";

/**
 * The Create Order form's Coupon field. The admin types a redeem code
 * and presses Apply: the code is validated against the CURRENT item
 * subtotal by POST /api/coupons/validate — the same resolver the
 * server runs again inside createOrder, so the discount previewed
 * here is the discount the saved order carries, and a code that fails
 * any rule (unknown, inactive, expired, usage limit, minimum order)
 * shows the server's reason and applies nothing.
 *
 * Applied state lives in formData (couponCode + couponApplied +
 * couponDiscount) so the order payload builder can pick the code up;
 * changing the product, the quantity or the code itself re-validates
 * or clears the application — a stale discount never survives.
 */
interface CouponApplyFieldProps {
  value: string;
  applied: boolean;
  discount?: number;
  productId: string;
  quantity: number;
  onFieldChange: (fieldName: string, value: unknown) => void;
}

interface ProductPrice {
  _id: string;
  price?: number;
}

export default function CouponApplyField({
  value,
  applied,
  discount,
  productId,
  quantity,
  onFieldChange,
}: CouponApplyFieldProps) {
  const { t } = useLanguage();
  const [products, setProducts] = useState<ProductPrice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const validatedSignature = useRef("");

  // Product prices price the order's single line item — the same
  // source the payload builder uses for the subtotal.
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

  const product = products.find((p) => p._id === productId);
  const subtotal = (product?.price ?? 0) * Math.max(1, Number(quantity) || 1);
  const appliedDiscount = applied ? Number(discount) || 0 : 0;

  const clearApplied = () => {
    onFieldChange("couponApplied", false);
    onFieldChange("couponDiscount", undefined);
    setAppliedCode("");
    validatedSignature.current = "";
  };

  const validate = async (code: string, amount: number, silent: boolean) => {
    if (!silent) setBusy(true);
    try {
      const { data } = await apiClient.post("/coupons/validate", {
        code,
        subtotal: amount,
      });
      onFieldChange("couponCode", data.code);
      onFieldChange("couponApplied", true);
      onFieldChange("couponDiscount", data.discount);
      setAppliedCode(data.code);
      validatedSignature.current = `${data.code}|${amount}`;
      setError("");
      return true;
    } catch (err) {
      clearApplied();
      setError(extractApiError(err));
      return false;
    } finally {
      if (!silent) setBusy(false);
    }
  };

  // Items changed under an applied coupon → re-validate against the
  // new subtotal (the discount follows, or the application drops with
  // the server's reason — e.g. the minimum order is no longer met).
  useEffect(() => {
    if (!applied || !appliedCode) return;
    const signature = `${appliedCode}|${subtotal}`;
    if (validatedSignature.current === signature) return;
    validatedSignature.current = signature;
    void validate(appliedCode, subtotal, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, applied, appliedCode]);

  const handleApply = async () => {
    const code = (value || "").trim().toUpperCase();
    if (!code) {
      setError(t("Please enter a coupon code."));
      return;
    }
    if (!productId) {
      setError(t("Select a product first so the discount can be calculated."));
      return;
    }
    setError("");
    await validate(code, subtotal, false);
  };

  const handleRemove = () => {
    onFieldChange("couponCode", "");
    clearApplied();
    setError("");
  };

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <TicketPercent className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={value || ""}
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              onFieldChange("couponCode", next);
              // Editing the code after applying voids the application —
              // the new code must earn its own Apply.
              if (applied && next.trim() !== appliedCode) clearApplied();
              if (error) setError("");
            }}
            placeholder={t("Enter a coupon code")}
            className="w-full pl-8 pr-3 py-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl outline-none text-xs text-[var(--text)] uppercase focus:border-[var(--primary)] transition-colors"
          />
        </div>
        {applied ? (
          <Button type="button" variant="outline" size="md" onClick={handleRemove}>
            <X className="w-3.5 h-3.5" />
            {t("Remove")}
          </Button>
        ) : (
          <Button type="button" variant="primary" size="md" disabled={busy} onClick={handleApply}>
            {busy ? t("Checking...") : t("Apply")}
          </Button>
        )}
      </div>

      {error && (
        <span className="text-[10px] text-red-500 mt-1 block">{error}</span>
      )}

      {applied && !error && (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text)]">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[var(--text-muted)]">{t("Subtotal")}</span>
            <span>{formatMoney(subtotal, 2)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[var(--text-muted)]">
              {t("Discount")} ({appliedCode})
            </span>
            <span>−{formatMoney(appliedDiscount, 2)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5 border-t border-[var(--border)] mt-1 pt-1.5 font-bold">
            <span>{t("Total")}</span>
            <span>{formatMoney(subtotal - appliedDiscount, 2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
