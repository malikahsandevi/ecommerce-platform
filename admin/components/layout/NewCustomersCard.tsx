import React from "react";
import Link from "next/link";
import { Ellipsis, UserRound } from "lucide-react";

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

  return (
    <div className="p-5 w-full h-full bg-(--background) rounded-2xl shadow-sm border border-(--border) flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-bold text-(--text)">New Customers</h3>
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
        <ul className="flex flex-col divide-y divide-(--border)">
          {customers.map((customer) => (
            <li key={customer.id} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-0">
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

      <Link
        href="/customers"
        className="mt-4 text-xs font-semibold text-(--primary) hover:text-(--primary-dark) transition-colors"
      >
        View all customers →
      </Link>
    </div>
  );
};

export default NewCustomersCard;
