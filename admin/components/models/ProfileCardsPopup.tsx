"use client";

import React, { useEffect, useRef } from "react";
import { TicketPercent, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type {
  CustomerProfile,
  ProfileOrder,
  ProfileProduct,
} from "@/services/resourceRegistry";
import { formatMoney, useStoreCurrency } from "@/services/currency";
import { useLanguage } from "@/services/i18n";

type TranslateFn = (key: string) => string;

export type ProfilePopupKind =
  | "spend"
  | "orders"
  | "purchased"
  | "coupons"
  | "categories"
  | "favorites"
  | "liked"
  | "cart";

/** Blank profile for the create-customer form (no record, no data). */
export const EMPTY_CUSTOMER_PROFILE: CustomerProfile = {
  favorites: [],
  liked: [],
  cart: [],
  favoriteCategories: [],
  stats: { totalSpend: 0, totalOrders: 0, averageOrderValue: 0, lastOrderDate: null },
  purchased: [],
  orders: [],
  purchasedProducts: [],
  usedCoupons: [],
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : "—";

const Thumb: React.FC<{ src?: string; name: string; size?: string }> = ({
  src,
  name,
  size = "h-11 w-11",
}) =>
  src ? (
    <img
      src={src}
      alt=""
      className={`${size} shrink-0 rounded-lg border border-[var(--border)] object-cover`}
    />
  ) : (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]`}
    >
      {(name.trim().charAt(0) || "P").toUpperCase()}
    </span>
  );

const CardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-2.5">
    {children}
  </div>
);

const ProductCard: React.FC<{ product: ProfileProduct; showQuantity?: boolean }> = ({
  product,
  showQuantity = false,
}) => {
  const { t } = useLanguage();
  return (
  <CardShell>
    <div className="flex items-center gap-2.5">
      <Thumb src={product.image} name={product.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[var(--text)]">{product.name}</p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {product.price !== null ? formatMoney(product.price, 2) : t("Price not set")}
          {showQuantity && product.quantity !== undefined && (
            <span className="font-semibold text-[var(--text-soft)]">
              {" "}
              · × {product.quantity}
            </span>
          )}
        </p>
      </div>
      {showQuantity && product.price !== null && product.quantity !== undefined && (
        <span className="shrink-0 text-xs font-bold text-[var(--text)]">
          {formatMoney(product.price * product.quantity, 2)}
        </span>
      )}
    </div>
  </CardShell>
  );
};

const OrderCard: React.FC<{ order: ProfileOrder }> = ({ order }) => (
  <CardShell>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-bold text-[var(--text)]">{order.orderNumber}</span>
      <span className="text-xs font-bold text-[var(--text)]">
        {formatMoney(order.total, 2)}
      </span>
    </div>
    <div className="mt-1 flex items-center justify-between gap-2">
      <span className="text-[11px] text-[var(--text-muted)]">{formatDate(order.date)}</span>
      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold capitalize text-[var(--text-soft)]">
        {order.status}
      </span>
    </div>
    <div className="mt-2 space-y-1.5 border-t border-dashed border-[var(--border)] pt-2">
      {order.items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Thumb src={item.image} name={item.name} size="h-6 w-6" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-soft)]">
            {item.name} × {item.quantity}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-[var(--text)]">
            {formatMoney(item.price * item.quantity, 2)}
          </span>
        </div>
      ))}
    </div>
  </CardShell>
);

interface KindView {
  title: string;
  summary: string;
  emptyText: string;
  isEmpty: boolean;
  body: React.ReactNode;
}

const plural = (t: TranslateFn, count: number, one: string, many: string) =>
  t(count === 1 ? "{count} " + one : "{count} " + many).replace("{count}", String(count));

const kindView = (kind: ProfilePopupKind, profile: CustomerProfile, t: TranslateFn): KindView => {
  const productGrid = (items: ProfileProduct[], showQuantity = false) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((product) => (
        <ProductCard key={product.id} product={product} showQuantity={showQuantity} />
      ))}
    </div>
  );
  const orderList = (
    <div className="space-y-2">
      {profile.orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );

  switch (kind) {
    case "spend":
      return {
        title: t("Total Spend"),
        summary: t("{amount} across {orders}")
          .replace("{amount}", formatMoney(profile.stats.totalSpend, 2))
          .replace("{orders}", plural(t, profile.stats.totalOrders, "order", "orders")),
        emptyText: t("No orders yet"),
        isEmpty: profile.orders.length === 0,
        body: orderList,
      };
    case "orders":
      return {
        title: t("Orders"),
        summary: t("{orders} · {amount} total")
          .replace("{orders}", plural(t, profile.stats.totalOrders, "order", "orders"))
          .replace("{amount}", formatMoney(profile.stats.totalSpend, 2)),
        emptyText: t("No orders yet"),
        isEmpty: profile.orders.length === 0,
        body: orderList,
      };
    case "purchased":
      return {
        title: t("Purchased Products"),
        summary: plural(t, profile.purchasedProducts.length, "item bought", "items bought"),
        emptyText: t("No purchased products yet"),
        isEmpty: profile.purchasedProducts.length === 0,
        body: (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {profile.purchasedProducts.map((item, idx) => (
              <CardShell key={`${item.orderNumber}-${idx}`}>
                <div className="flex items-center gap-2.5">
                  <Thumb src={item.image} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--text)]">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {item.orderNumber} · {formatDate(item.date)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-[var(--text)]">
                      {formatMoney(item.price * item.quantity, 2)}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">× {item.quantity}</p>
                  </div>
                </div>
              </CardShell>
            ))}
          </div>
        ),
      };
    case "coupons":
      return {
        title: t("Used Coupons"),
        summary: plural(t, profile.usedCoupons.length, "coupon used", "coupons used"),
        emptyText: t("No coupons used yet"),
        isEmpty: profile.usedCoupons.length === 0,
        body: (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {profile.usedCoupons.map((coupon) => (
              <CardShell key={coupon.code}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
                    <TicketPercent size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold tracking-wide text-[var(--text)]">
                      {coupon.code}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {coupon.discountType === "percentage" && coupon.discountValue !== null
                        ? t("{value}% off").replace("{value}", String(coupon.discountValue))
                        : coupon.discountType === "fixed" && coupon.discountValue !== null
                          ? t("{amount} off").replace("{amount}", formatMoney(coupon.discountValue, 2))
                          : t("Discount coupon")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-[var(--text)]">
                      × {coupon.timesUsed}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {t("Last {date}").replace("{date}", formatDate(coupon.lastUsed))}
                    </p>
                  </div>
                </div>
              </CardShell>
            ))}
          </div>
        ),
      };
    case "categories":
      return {
        title: t("Favorite Categories"),
        summary: plural(t, profile.favoriteCategories.length, "category", "categories"),
        emptyText: t("No favorite categories yet"),
        isEmpty: profile.favoriteCategories.length === 0,
        body: (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {profile.favoriteCategories.map((category) => (
              <CardShell key={category.id}>
                <div className="flex items-center gap-2.5">
                  <Thumb src={category.image} name={category.name} />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text)]">
                    {category.name}
                  </p>
                </div>
              </CardShell>
            ))}
          </div>
        ),
      };
    case "favorites":
      return {
        title: t("Favorites"),
        summary: plural(t, profile.favorites.length, "product", "products"),
        emptyText: t("No favorites yet"),
        isEmpty: profile.favorites.length === 0,
        body: productGrid(profile.favorites),
      };
    case "liked":
      return {
        title: t("Liked Products"),
        summary: plural(t, profile.liked.length, "product", "products"),
        emptyText: t("No liked products yet"),
        isEmpty: profile.liked.length === 0,
        body: productGrid(profile.liked),
      };
    case "cart":
      return {
        title: t("Cart"),
        summary: t("{products} in cart").replace("{products}", plural(t, profile.cart.length, "product", "products")),
        emptyText: t("Cart is empty"),
        isEmpty: profile.cart.length === 0,
        body: productGrid(profile.cart, true),
      };
  }
};

/**
 * Card popup for one block of a customer's shopping profile — opened
 * from the details panel blocks and from the customer form's Shopping
 * Profile section. Same shell family as the media picker: backdrop
 * press (start + end on the overlay) or Esc closes it, and Esc is
 * captured before any parent popup (form) can see it, so only this
 * popup closes.
 */
export const ProfileCardsPopup: React.FC<{
  kind: ProfilePopupKind;
  profile: CustomerProfile;
  onClose: () => void;
}> = ({ kind, profile, onClose }) => {
  const { t } = useLanguage();
  useStoreCurrency();
  const backdropPressRef = useRef(false);
  const view = kindView(kind, profile, t);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      onMouseDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPressRef.current && event.target === event.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col border border-[var(--border)]">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--surface-muted)] shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-[var(--text)] text-base">{view.title}</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{view.summary}</p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label={t("Close")} className="close-x" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 min-h-40 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-full">
          {view.isEmpty ? (
            <p className="text-xs text-[var(--text-muted)] italic py-10 text-center">
              {view.emptyText}
            </p>
          ) : (
            view.body
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileCardsPopup;
