"use client";

import React, { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { apiClient } from "@/services/api";
import {
  customerProfileService,
  type CustomerProfile,
} from "@/services/resourceRegistry";
import {
  EMPTY_CUSTOMER_PROFILE,
  ProfileCardsPopup,
  type ProfilePopupKind,
} from "@/components/models/ProfileCardsPopup";

export const FAVORITE_CATEGORY_LIMIT = 3;

interface CategoryOption {
  id: string;
  name: string;
}

interface CustomerShoppingProfileProps {
  /** The customer being edited; undefined while creating a new one. */
  customerId?: string;
  /** Selected favorite-category ids (the form field's value). */
  value: string[];
  onChange: (ids: string[]) => void;
}

/** A stored-list entry: title + count; opens the shared card popup. */
const PopupEntry: React.FC<{
  title: string;
  count: number;
  onClick: () => void;
}> = ({ title, count, onClick }) => (
  <div>
    <span className="mb-1 block text-[11px] font-semibold text-[var(--text-soft)]">
      {title}
    </span>
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-2 text-left transition-colors hover:border-[var(--primary)]"
    >
      <span className="text-xs font-medium text-[var(--text)]">
        {count} {count === 1 ? "product" : "products"}
      </span>
      <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
    </button>
  </div>
);

/**
 * The customer form's "Shopping Profile" section. Favorite Categories
 * is the editable piece — a picker capped at 3 (the backend rejects a
 * 4th with a clear error too). Favorites / Liked / Cart are the
 * customer's own app-side data: each entry opens the shared card
 * popup (view-only) showing the actual stored products — nothing is
 * invented for new customers.
 */
export const CustomerShoppingProfile: React.FC<CustomerShoppingProfileProps> = ({
  customerId,
  value,
  onChange,
}) => {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [popup, setPopup] = useState<ProfilePopupKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/categories", { params: { limit: 200 } })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setCategories(
          rows.map((row: { _id?: string; id?: string; name?: string }) => ({
            id: String(row._id || row.id || ""),
            name: row.name || "Unnamed category",
          })).filter((row: CategoryOption) => row.id),
        );
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!customerId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    customerProfileService
      .getProfile(customerId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const atCap = value.length >= FAVORITE_CATEGORY_LIMIT;
  const toggleCategory = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((existing) => existing !== id));
    } else if (!atCap) {
      onChange([...value, id]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="block text-[11px] font-semibold text-[var(--text-soft)]">
            Favorite Categories
          </span>
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            {value.length}/{FAVORITE_CATEGORY_LIMIT}
          </span>
        </div>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => {
              const selected = value.includes(category.id);
              const disabled = !selected && atCap;
              return (
                <button
                  key={category.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleCategory(category.id)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : disabled
                        ? "cursor-not-allowed border-[var(--border)] text-[var(--text-muted)] opacity-50"
                        : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  }`}
                >
                  {selected && <Check size={11} strokeWidth={3.5} />}
                  {category.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            No categories available yet.
          </p>
        )}
        {atCap && (
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            Maximum {FAVORITE_CATEGORY_LIMIT} favorite categories — remove one to pick another.
          </p>
        )}
      </div>

      <PopupEntry
        title="Favorites"
        count={profile?.favorites.length ?? 0}
        onClick={() => setPopup("favorites")}
      />
      <PopupEntry
        title="Liked"
        count={profile?.liked.length ?? 0}
        onClick={() => setPopup("liked")}
      />
      <PopupEntry
        title="Cart"
        count={profile?.cart.length ?? 0}
        onClick={() => setPopup("cart")}
      />

      {popup && (
        <ProfileCardsPopup
          kind={popup}
          profile={profile ?? EMPTY_CUSTOMER_PROFILE}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
};

export default CustomerShoppingProfile;
