"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  customerProfileService,
  type CustomerProfile,
} from "@/services/resourceRegistry";
import { formatMoney, useStoreCurrency } from "@/services/currency";
import {
  ProfileCardsPopup,
  type ProfilePopupKind,
} from "@/components/models/ProfileCardsPopup";

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mb-1 block border-t border-[var(--border)] pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
    {children}
  </span>
);

const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-[var(--text-muted)]">{children}</p>
);

/** One clickable profile block: label + count, opens its card popup. */
const EntryRow: React.FC<{
  label: string;
  count: number;
  onClick: () => void;
}> = ({ label, count, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-left transition-colors hover:border-[var(--primary)]"
  >
    <span className="text-[11px] font-medium text-[var(--text)]">{label}</span>
    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-[var(--text)]">
      {count}
      <ChevronRight size={13} className="text-[var(--text-muted)]" />
    </span>
  </button>
);

/**
 * The customer details panel's shopping-profile sections, fed by
 * GET /users/:id/profile: order-derived stats and history (computed
 * by the backend from the customer's Orders on every request) plus
 * the stored favorites / liked / cart / favorite categories. Every
 * block is an entry that opens a popup showing the actual items as
 * cards — figures alone never stand in for the data. Every block
 * renders an honest empty state when there is no data.
 */
export const CustomerProfileSections: React.FC<{ customerId: string }> = ({
  customerId,
}) => {
  useStoreCurrency();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [popup, setPopup] = useState<ProfilePopupKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setFailed(false);
    setPopup(null);
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

  const statTiles: { label: string; value: string; kind?: ProfilePopupKind }[] = [
    {
      label: "Total Spend",
      value: formatMoney(profile.stats.totalSpend, 2),
      kind: "spend",
    },
    {
      label: "Total Orders",
      value: String(profile.stats.totalOrders),
      kind: "orders",
    },
    { label: "Average Order", value: formatMoney(profile.stats.averageOrderValue, 2) },
    {
      label: "Last Order",
      value: profile.stats.lastOrderDate
        ? new Date(profile.stats.lastOrderDate).toLocaleDateString()
        : "—",
    },
  ];

  const entries: { label: string; count: number; kind: ProfilePopupKind }[] = [
    { label: "Purchased", count: profile.purchasedProducts.length, kind: "purchased" },
    { label: "Used Coupons", count: profile.usedCoupons.length, kind: "coupons" },
    {
      label: "Favorite Categories",
      count: profile.favoriteCategories.length,
      kind: "categories",
    },
    { label: "Favorites", count: profile.favorites.length, kind: "favorites" },
    { label: "Liked", count: profile.liked.length, kind: "liked" },
    { label: "Cart", count: profile.cart.length, kind: "cart" },
  ];

  return (
    <div className="space-y-3 pt-1">
      <div>
        <SectionTitle>Shopping Profile</SectionTitle>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {statTiles.map((tile) =>
            tile.kind ? (
              <button
                key={tile.label}
                type="button"
                onClick={() => setPopup(tile.kind!)}
                className="cursor-pointer rounded border border-[var(--border)] bg-[var(--background)] p-1.5 text-left transition-colors hover:border-[var(--primary)]"
              >
                <span className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  {tile.label}
                  <ChevronRight size={11} />
                </span>
                <span className="font-bold text-[var(--text)]">{tile.value}</span>
              </button>
            ) : (
              <div
                key={tile.label}
                className="rounded border border-[var(--border)] bg-[var(--background)] p-1.5"
              >
                <span className="block text-[10px] text-[var(--text-muted)]">
                  {tile.label}
                </span>
                <span className="font-bold text-[var(--text)]">{tile.value}</span>
              </div>
            ),
          )}
        </div>
      </div>

      {entries.map((entry) => (
        <div key={entry.kind}>
          <SectionTitle>{entry.label}</SectionTitle>
          <EntryRow
            label={entry.label}
            count={entry.count}
            onClick={() => setPopup(entry.kind)}
          />
        </div>
      ))}

      {popup && (
        <ProfileCardsPopup
          kind={popup}
          profile={profile}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
};

export default CustomerProfileSections;
