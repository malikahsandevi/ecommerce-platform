// /app/page.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertCircle, DollarSign, Package, RefreshCcw, ShoppingBag, Users } from "lucide-react";
import StatsOverview from "@/components/layout/StatsOverview";
import TopCategories, { CategoryItem } from "@/components/layout/TopCategories";
import RecentOrdersCard, { DashboardOrder } from "@/components/layout/RecentOrdersCard";
import ActivityCard, { ActivityLogItem } from "@/components/layout/ActivityCard";
import TopBar from "@/components/ui/TopBar";
import type { StatCardProps } from "@/components/ui/StatsCard";
import { getDashboardAllData } from "@/services/dashboardService";
import { apiClient } from "@/services/api";
import { useAdminAuth } from "@/services/authContext";

const CATEGORY_COLORS = ["#f97416", "#0ea5e9", "#22c55e", "#a855f7", "#eab308", "#ec4899"];

interface ProductSearchRecord {
  id: string;
  name: string;
  category: string;
  sku: string;
  [key: string]: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function customerNameOf(order: AnyRecord): string {
  const user = order.user;
  if (!user || typeof user === "string") return "—";
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "—"
  );
}

export default function Page() {
  const { user, isAuthenticated } = useAdminAuth();
  const [statsCards, setStatsCards] = useState<StatCardProps[] | undefined>(undefined);
  const [recentOrders, setRecentOrders] = useState<DashboardOrder[] | undefined>(undefined);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[] | undefined>(undefined);
  const [categories, setCategories] = useState<CategoryItem[] | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchRecords, setSearchRecords] = useState<ProductSearchRecord[]>([]);
  const [searchMatches, setSearchMatches] = useState<ProductSearchRecord[] | null>(null);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    setSlowLoad(false);
    setStatsCards(undefined);
    setRecentOrders(undefined);
    setActivityLogs(undefined);
    setCategories(undefined);

    // The dashboard payload drives the stat cards, orders and activity —
    // render those as soon as IT lands instead of holding them hostage to
    // the (independent) products request, which used to delay the whole
    // page behind whichever call was slower on a cold start.
    const slowTimer = setTimeout(() => setSlowLoad(true), 6000);

    const productsPromise = apiClient
      .get("/products")
      .then((res) => (Array.isArray(res.data) ? res.data : []))
      .catch(() => [] as AnyRecord[]);

    const data = await getDashboardAllData();
    clearTimeout(slowTimer);
    setSlowLoad(false);

    if (!data) {
      setLoadError(true);
      return;
    }

    const stats = data.stats || {};
    setStatsCards([
      {
        title: "Total Revenue",
        value: `$${Number(stats.totalRevenue || 0).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })}`,
        change: "",
        isPositive: true,
        period: "All time",
        icon: DollarSign,
        theme: "orange",
      },
      {
        title: "Total Orders",
        value: Number(stats.totalOrders || 0).toLocaleString(),
        change: "",
        isPositive: true,
        period: "All time",
        icon: ShoppingBag,
        theme: "blue",
      },
      {
        title: "Total Customers",
        value: Number(stats.totalCustomers || 0).toLocaleString(),
        change: "",
        isPositive: true,
        period: "Registered accounts",
        icon: Users,
        theme: "green",
      },
      {
        title: "Total Products",
        value: Number(stats.totalProducts || 0).toLocaleString(),
        change: "",
        isPositive: true,
        period: "In the catalog",
        icon: Package,
        theme: "purple",
      },
    ]);

    setRecentOrders(
      (data.recentOrders || []).map((order: AnyRecord) => {
        const items = order.items || [];
        const firstName = items[0]?.name || "—";
        return {
          id: order._id,
          orderId: order.orderNumber || "—",
          customer: customerNameOf(order),
          productName:
            items.length > 1 ? `${firstName} +${items.length - 1} more` : firstName,
          qty: items.reduce(
            (sum: number, item: AnyRecord) => sum + (item.quantity || 0),
            0
          ),
          total: Number(order.total || 0),
          status: order.status || "pending",
        };
      })
    );

    setActivityLogs(
      (data.activityLogs || []).map((log: AnyRecord) => ({
        id: log._id,
        type: log.type || "",
        description: log.description || "",
        createdAt: log.createdAt,
      }))
    );

    // Category share is computed from the real product catalog: the
    // dashboard endpoint returns the categories, the products endpoint
    // says how many products sit in each one.
    const products: AnyRecord[] = await productsPromise;

    const counts = new Map<string, number>();
    for (const product of products) {
      const categoryId =
        typeof product.category === "object"
          ? product.category?._id
          : product.category;
      if (categoryId) counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    }

    setCategories(
      (data.topCategories || [])
        .map((category: AnyRecord, index: number) => {
          const count = counts.get(category._id) || 0;
          return {
            name: category.name,
            value: count,
            formattedValue: `${count} product${count === 1 ? "" : "s"}`,
            color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
          };
        })
        .filter((category: CategoryItem) => category.value > 0)
        .sort((a: CategoryItem, b: CategoryItem) => b.value - a.value)
    );

    setSearchRecords(
      products.map((product) => ({
        id: String(product._id),
        name: product.name || "",
        category:
          typeof product.category === "object"
            ? product.category?.name || ""
            : "",
        sku: product.sku || "",
      }))
    );
  }, []);

  // Only fetch once signed in (the dashboard API requires the token), and
  // re-run when the session appears — the shell renders this page behind
  // the login popup, so a mount-only fetch would fire unauthenticated and
  // never recover after login.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await fetchData();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchData, reloadToken, isAuthenticated]);

  return (
    <div className="flex-1 min-w-0 p-3 bg-[var(--background)] text-[var(--text)] transition-colors duration-200 flex flex-col gap-3">
      <TopBar
        title="Dashboard"
        subtitle="Manage inventory and store items"
        user={{
          name: user?.name || "Admin",
          role: user?.role || "Admin",
          email: user?.email,
          avatar: user?.avatar || "",
        }}
        searchPlaceholder="Search products or SKU..."
        searchData={searchRecords}
        searchFields={["name", "category", "sku"]}
        onSearchResults={(results) =>
          setSearchMatches(
            results.length === searchRecords.length ? null : results
          )
        }
      />

      {searchMatches !== null && (
        <div className="rounded-2xl border border-(--border) bg-(--background) px-4 py-3 shadow-sm">
          {searchMatches.length === 0 ? (
            <p className="text-xs text-(--text-muted)">
              No products match your search.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-(--text)">
                {searchMatches.length} product{searchMatches.length === 1 ? "" : "s"} found:
              </span>
              {searchMatches.slice(0, 6).map((product) => (
                <Link
                  key={product.id}
                  href="/products"
                  className="text-[11px] font-medium px-2 py-1 rounded-full bg-(--primary-soft) text-(--primary-dark) hover:bg-(--primary-light) transition-colors"
                >
                  {product.name}
                  {product.sku ? ` • ${product.sku}` : ""}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {loadError ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <p className="text-sm font-bold text-(--text)">
            Couldn&apos;t load the dashboard
          </p>
          <p className="text-xs text-(--text-muted) max-w-90">
            The server may have been waking up. Your data is safe — try loading
            it again.
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-(--primary) px-4 py-2 text-xs font-semibold text-white hover:bg-(--primary-dark) transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {slowLoad && statsCards === undefined && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-(--text-muted)">
              The server is waking up — the first load after a quiet period can
              take a little longer. Your numbers will appear in a moment.
            </div>
          )}
          <StatsOverview statsData={statsCards} />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <section className="xl:col-span-2">
              <RecentOrdersCard orders={recentOrders} />
            </section>
            <section>
              <TopCategories categoriesData={categories} loading={categories === undefined} />
            </section>
          </div>

          <section>
            <ActivityCard logs={activityLogs} />
          </section>
        </>
      )}
    </div>
  );
}
