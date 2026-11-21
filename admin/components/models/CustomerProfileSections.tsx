"use client";

import React, { useEffect, useState } from "react";
import {
  customerProfileService,
  type CustomerProfile,
  type ProfileProduct,
} from "@/services/resourceRegistry";
import { formatMoney, useStoreCurrency } from "@/services/currency";

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mb-1 block border-t border-[var(--border)] pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
    {children}
  </span>
);

const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-[var(--text-muted)]">{children}</p>
);

const ProductRows: React.FC<{ items: ProfileProduct[]; emptyText: string }> = ({
  items,
  emptyText,
}) =>
  items.length > 0 ? (
    <div className="space-y-1.5">
      {items.map((product) => (
        <div
          key={product.id}
          className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5"
        >
          {product.image ? (
            <img
              src={product.image}
              alt=""
              className="h-7 w-7 shrink-0 rounded-md border border-[var(--border)] object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[10px] font-bold text-[var(--primary)]">
              {(product.name.trim().charAt(0) || "P").toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text)]">
            {product.name}
          </span>
          {product.quantity !== undefined && (
            <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">
              × {product.quantity}
            </span>
          )}
        </div>
      ))}
    </div>
  ) : (
    <EmptyLine>{emptyText}</EmptyLine>
  );

/**
 * The customer details panel's shopping-profile sections, fed by
 * GET /users/:id/profile: order-derived stats and history (computed
 * by the backend from the customer's Orders on every request) plus
 * the stored favorites / liked / cart / favorite categories. Every
 * block renders an honest empty state when there is no data.
 */
export const CustomerProfileSections: React.FC<{ customerId: string }> = ({
  customerId,
}) => {
  useStoreCurrency();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setFailed(false);
    customerProfileService
      .getProfile(customerId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (failed) {
    return (
      <div className="pt-1">
        <SectionTitle>Shopping Profile</SectionTitle>
        <EmptyLine>The shopping profile could not be loaded.</EmptyLine>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="pt-1">
        <SectionTitle>Shopping Profile</SectionTitle>
        <EmptyLine>Loading shopping profile…</EmptyLine>
      </div>
    );
  }

  const stats: [string, string][] = [
    ["Total Spend", formatMoney(profile.stats.totalSpend, 2)],
    ["Total Orders", String(profile.stats.totalOrders)],
    ["Average Order", formatMoney(profile.stats.averageOrderValue, 2)],
    [
      "Last Order",
      profile.stats.lastOrderDate
        ? new Date(profile.stats.lastOrderDate).toLocaleDateString()
        : "—",
    ],
  ];

  return (
    <div className="space-y-3 pt-1">
      <div>
        <SectionTitle>Shopping Profile</SectionTitle>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="rounded border border-[var(--border)] bg-[var(--background)] p-1.5"
            >
              <span className="block text-[10px] text-[var(--text-muted)]">{label}</span>
              <span className="font-bold text-[var(--text)]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Purchased</SectionTitle>
        {profile.purchased.length > 0 ? (
          <div className="space-y-2">
            {profile.purchased.map((order) => (
              <div
                key={order.id}
                className="rounded border border-[var(--border)] bg-[var(--background)] p-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-[var(--text)]">{order.orderNumber}</span>
                  <span className="font-bold text-[var(--text)]">
                    {formatMoney(order.total, 2)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                  <span>{new Date(order.date).toLocaleDateString()}</span>
                  <span className="capitalize">{order.status}</span>
                </div>
                <div className="mt-1.5 space-y-0.5 border-t border-dashed border-[var(--border)] pt-1.5">
                  {order.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="min-w-0 truncate text-[var(--text-soft)]">
                        {item.name} × {item.quantity}
                      </span>
                      <span className="shrink-0 font-medium text-[var(--text)]">
                        {formatMoney(item.price * item.quantity, 2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyLine>No orders yet</EmptyLine>
        )}
      </div>

      <div>
        <SectionTitle>Used Coupons</SectionTitle>
        {profile.usedCoupons.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {profile.usedCoupons.map((coupon) => (
              <span
                key={coupon.code}
                className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text)]"
              >
                {coupon.code} × {coupon.timesUsed}
              </span>
            ))}
          </div>
        ) : (
          <EmptyLine>No coupons used yet</EmptyLine>
        )}
      </div>

      <div>
        <SectionTitle>Favorite Categories</SectionTitle>
        {profile.favoriteCategories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {profile.favoriteCategories.map((category) => (
              <span
                key={category.id}
                className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]"
              >
                {category.name}
              </span>
            ))}
          </div>
        ) : (
          <EmptyLine>No favorite categories yet</EmptyLine>
        )}
      </div>

      <div>
        <SectionTitle>Favorites</SectionTitle>
        <ProductRows items={profile.favorites} emptyText="No favorites yet" />
      </div>

      <div>
        <SectionTitle>Liked</SectionTitle>
        <ProductRows items={profile.liked} emptyText="No liked products yet" />
      </div>

      <div>
        <SectionTitle>Cart</SectionTitle>
        <ProductRows items={profile.cart} emptyText="Cart is empty" />
      </div>
    </div>
  );
};

export default CustomerProfileSections;
