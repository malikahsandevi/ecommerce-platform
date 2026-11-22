import React from "react";
import Link from "next/link";
import { Ellipsis, UserRound } from "lucide-react";
import { useLanguage } from "@/services/i18n";

export interface NewCustomer {
  id: string;
  name: string;
  email: string;
  joined: string;
}

interface NewCustomersCardProps {
  /** Undefined while the dashboard request is still in flight. */
  customers?: NewCustomer[];
}

/** Same thin styled scrollbar as the media panel's scroll areas. */
const SCROLLBAR_CLASSES =
  "[&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-[4px] [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent]";

/** One customer row is exactly 56px tall (h-14, border included), so
 *  the list shows exactly 3 rows: 3 × 56 = 168px. */
const ROW_H = 56;

const initialsOf = (name: string, email: string) => {
  const source = name && name !== "—" ? name : email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || "C") + (parts[1]?.[0] || "")).toUpperCase();
};

/**
 * Occupies the reference design's "Active User" slot — but filled with
 * the store's newest real registrations (the panel has no visitor or
 * country data, so none is shown).
 */
export const NewCustomersCard: React.FC<NewCustomersCardProps> = ({ customers }) => {
  if (customers === undefined) {
    return (
      <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) animate-pulse">
        <div className="h-5 bg-(--primary-soft) rounded w-32 mb-5"></div>
        {[1, 2, 3, 4].map((row) => (
          <div key={row} className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-(--primary-soft) shrink-0"></div>
            <div className="flex-1">
              <div className="h-3 bg-(--primary-soft) rounded w-24 mb-1.5"></div>
              <div className="h-2.5 bg-(--primary-soft) rounded w-32"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { t } = useLanguage();
  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-bold text-(--text)">{t("New Customers")}</h3>
        <Ellipsis className="w-5 h-5 text-(--text-muted)" />
      </div>
      <p className="text-[11px] text-(--text-muted) mb-4">
        Latest registered accounts
      </p>

      {customers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-6 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <UserRound className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">No customers yet</p>
          <p className="text-[11px] text-(--text-muted) max-w-50">
            New sign-ups will appear here as soon as customers register.
          </p>
        </div>
      ) : (
        <ul
          // pr-2: rows clear the scrollbar by 8px — the joined-date at
          // the row's right edge used to end flush against the bar and
          // its last glyph disappeared under the thumb.
          className={`flex flex-col divide-y divide-(--border) overflow-y-auto pr-2 ${SCROLLBAR_CLASSES}`}
          style={{ maxHeight: ROW_H * 3 }}
        >
          {customers.map((customer) => (
            <li key={customer.id} className="flex h-14 shrink-0 items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-(--primary-soft) text-(--primary-dark) flex items-center justify-center text-[11px] font-bold shrink-0">
                {initialsOf(customer.name, customer.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-(--text) truncate">
                  {customer.name}
                </p>
                <p className="text-[11px] text-(--text-muted) truncate">
                  {customer.email}
                </p>
              </div>
              <span className="text-[11px] font-medium text-(--text-muted) shrink-0">
                {customer.joined}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* mt-auto: when the grid stretches this card past its natural
          height, the link stays pinned to the card's bottom instead
          of leaving a dead band under it (pt-4 keeps the minimum gap
          to the list). */}
      <Link
        href="/customers"
        className="mt-auto pt-4 text-xs font-semibold text-(--primary) hover:text-(--primary-dark) transition-colors"
      >
        View all customers →
      </Link>
    </div>
  );
};

export default NewCustomersCard;
