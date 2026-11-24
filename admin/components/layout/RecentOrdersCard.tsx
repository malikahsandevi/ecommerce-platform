"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { StatusPill } from "@/components/models/CreateTable";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { formatMoney, useStoreCurrency } from "@/services/currency";
import { useLanguage } from "@/services/i18n";

export interface DashboardOrder {
  id: string;
  orderId: string;
  customer: string;
  avatar?: string;
  productName: string;
  qty: number;
  total: number;
  status: string;
}

/**
 * The buyer's disc beside the name (the shared PersonAvatar at this
 * card's 28px size): the uploaded photo when the account has one that
 * loads, otherwise an initials disc of the exact same size — a row
 * never shows empty space beside the customer name.
 */

/** Same thin styled scrollbar as the media panel's scroll areas. */
const SCROLLBAR_CLASSES =
  "[&::-webkit-scrollbar]:w-[6px] [&::-webkit-scrollbar]:h-[6px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--primary)] [&::-webkit-scrollbar-thumb]:rounded-[4px] [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent]";

interface RecentOrdersProps {
  orders?: DashboardOrder[];
}

export const RecentOrdersCard: React.FC<RecentOrdersProps> = ({ orders }) => {
  const { t } = useLanguage();
  // Totals follow the store currency setting.
  useStoreCurrency();
  if (!orders) {
    return (
      <div className="bg-(--background) p-5 rounded-2xl shadow-sm border border-(--border) h-full w-full animate-pulse">
        <div className="h-5 bg-(--primary-soft) rounded w-32 mb-4"></div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-10 bg-(--primary-soft) rounded-lg w-full"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-(--background) p-5 rounded-2xl shadow-sm border border-(--border) h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-(--text)">{t("Recent Orders")}</h3>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-xs font-semibold text-(--primary) hover:text-(--primary-dark) transition-colors"
        >
          {t("See All")}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">{t("No orders yet")}</p>
          <p className="text-[11px] text-(--text-muted) max-w-55">
            {t("When customers place orders, the latest ones will show up here.")}
          </p>
        </div>
      ) : (
        // Ahsan's cap, mirroring Recent Activity (418d583): the
        // table area takes the SAME max-heights at every breakpoint,
        // so this panel never outgrows its row neighbour — with many
        // orders the rows scroll inside the panel instead. The
        // column header sticks to the top of the scroll area while
        // the rows move under it (its bg matches the card so rows
        // pass cleanly beneath; the th bottom border replaces the
        // tr's, which does not travel with sticky cells). max-height,
        // not height: with few orders the area takes its natural
        // height and no scrollbar appears. pr-2 keeps the Status
        // pills clear of the bar, the same clearance the other
        // dashboard lists use.
        <div
          className={`overflow-x-auto overflow-y-auto pr-2 max-h-[218px] md:max-h-[168px] lg:max-h-[316px] xl:max-h-[218px] ${SCROLLBAR_CLASSES}`}
        >
          <table className="w-full text-left text-xs">
            <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-(--background) [&_th]:border-b [&_th]:border-(--border)">
              <tr className="text-[11px] uppercase tracking-wide text-(--text-muted)">
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">{t("Order")}</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">{t("Customer")}</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">{t("Product")}</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">{t("Qty")}</th>
                <th className="py-2 pr-3 font-semibold whitespace-nowrap">{t("Total")}</th>
                <th className="py-2 font-semibold whitespace-nowrap">{t("Status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border)">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-(--primary-soft)/60 transition-colors">
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-(--text-muted) whitespace-nowrap">
                    {order.orderId}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-(--text) whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <PersonAvatar
                        src={order.avatar}
                        name={order.customer}
                        sizeClass="w-7 h-7"
                        textClass="text-[9px]"
                      />
                      {order.customer}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-(--text-soft) max-w-45 truncate">
                    {order.productName}
                  </td>
                  <td className="py-2.5 pr-3 text-(--text-soft)">{order.qty}</td>
                  <td className="py-2.5 pr-3 font-semibold text-(--text) whitespace-nowrap">
                    {formatMoney(order.total, 2)}
                  </td>
                  <td className="py-2.5">
                    <StatusPill status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RecentOrdersCard;
