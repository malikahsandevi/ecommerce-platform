"use client";

import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { apiClient } from "@/services/api";
import {
  customerProfileService,
  type CustomerProfile,
  type ProfileProduct,
} from "@/services/resourceRegistry";

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

const ProductRow: React.FC<{ product: ProfileProduct }> = ({ product }) => (
  <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5">
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
    <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text)]">
      {product.name}
    </span>
    {product.quantity !== undefined && (
      <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">
        × {product.quantity}
      </span>
    )}
  </div>
);

const ReadOnlyList: React.FC<{ title: string; items: ProfileProduct[]; emptyText: string }> = ({
  title,
  items,
  emptyText,
}) => (
  <div>
    <span className="mb-1 block text-[11px] font-semibold text-[var(--text-soft)]">
      {title}
    </span>
    {items.length > 0 ? (
      <div className="space-y-1.5">
        {items.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </div>
    ) : (
      <p className="text-[11px] text-[var(--text-muted)]">{emptyText}</p>
    )}
  </div>
);

/**
 * The customer form's "Shopping Profile" section. Favorite Categories
 * is the editable piece — a picker capped at 3 (the backend rejects a
 * 4th with a clear error too). Favorites / Liked / Cart are the
 * customer's own app-side data: shown read-only, exactly as stored,
 * with honest empty states — nothing is invented for new customers.
 */
export const CustomerShoppingProfile: React.FC<CustomerShoppingProfileProps> = ({
  customerId,
  value,
  onChange,
}) => {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);

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

      <ReadOnlyList
        title="Favorites"
        items={profile?.favorites ?? []}
        emptyText="No favorites yet"
      />
      <ReadOnlyList
        title="Liked"
        items={profile?.liked ?? []}
        emptyText="No liked products yet"
      />
      <ReadOnlyList title="Cart" items={profile?.cart ?? []} emptyText="Cart is empty" />
    </div>
  );
};

export default CustomerShoppingProfile;
