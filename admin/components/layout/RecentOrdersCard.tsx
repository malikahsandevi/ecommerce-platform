"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { StatusPill } from "@/components/models/CreateTable";

export interface DashboardOrder {
  id: string;
  orderId: string;
  customer: string;
  productName: string;
  qty: number;
  total: number;
  status: string;
}

interface RecentOrdersProps {
  orders?: DashboardOrder[];
}

export const RecentOrdersCard: React.FC<RecentOrdersProps> = ({ orders }) => {
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
        <h3 className="text-base font-bold text-(--text)">Recent Orders</h3>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-xs font-semibold text-(--primary) hover:text-(--primary-dark) transition-colors"
        >
          View all
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <span className="w-11 h-11 rounded-2xl bg-(--primary-soft) text-(--primary) flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </span>
          <p className="text-xs font-semibold text-(--text)">No orders yet</p>
          <p className="text-[11px] text-(--text-muted) max-w-55">
            When customers place orders, the latest ones will show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-(--text-muted) border-b border-(--border)">
                <th className="py-2 pr-3 font-semibold">Order</th>
                <th className="py-2 pr-3 font-semibold">Customer</th>
                <th className="py-2 pr-3 font-semibold">Product</th>
                <th className="py-2 pr-3 font-semibold">Qty</th>
                <th className="py-2 pr-3 font-semibold">Total</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border)">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-(--primary-soft)/60 transition-colors">
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-(--text-muted) whitespace-nowrap">
                    {order.orderId}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-(--text) whitespace-nowrap">
                    {order.customer}
                  </td>
                  <td className="py-2.5 pr-3 text-(--text-soft) max-w-45 truncate">
                    {order.productName}
                  </td>
                  <td className="py-2.5 pr-3 text-(--text-soft)">{order.qty}</td>
                  <td className="py-2.5 pr-3 font-semibold text-(--text) whitespace-nowrap">
                    ${order.total.toFixed(2)}
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
