// /app/page.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertCircle, CircleDollarSign, RefreshCcw, ShieldAlert, ShoppingBag, Users } from "lucide-react";
import DashboardStatCard from "@/components/layout/DashboardStatCard";
import RevenueAnalytics, {
  DailyPoint,
  RevenuePoint,
} from "@/components/layout/RevenueAnalytics";
import MonthlyTargetCard, {
  MonthlyTargetData,
} from "@/components/layout/MonthlyTargetCard";
import TopCategories, { CategoryItem } from "@/components/layout/TopCategories";
import NewCustomersCard, { NewCustomer } from "@/components/layout/NewCustomersCard";
import InventoryOverviewCard, {
  InventoryData,
} from "@/components/layout/InventoryOverviewCard";
import OrdersByStatusCard, {
  OrderStatusCount,
} from "@/components/layout/OrdersByStatusCard";
import RecentOrdersCard, { DashboardOrder } from "@/components/layout/RecentOrdersCard";
import ActivityCard, { ActivityLogItem } from "@/components/layout/ActivityCard";
import TopBar from "@/components/ui/TopBar";
import { getDashboardAllData } from "@/services/dashboardService";
import { apiClient } from "@/services/api";
import { useAdminAuth } from "@/services/authContext";

// Orange shades, darkest first — the reference design's donut palette.
const CATEGORY_COLORS = ["#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"];

interface ProductSearchRecord {
  id: string;
  name: string;
  category: string;
  sku: string;
  [key: string]: string;
}

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
}

interface Comparison {
  current: number;
  previous: number;
  pct: number | null;
}

interface Comparisons {
  revenue?: Comparison;
  orders?: Comparison;
  customers?: Comparison;
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

const fmtWholeMoney = (value: number) =>
  `$${Math.round(Number(value || 0)).toLocaleString()}`;

const fmtJoinedDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function Page() {
  const { user, isAuthenticated, hasPermission } = useAdminAuth();
  const [stats, setStats] = useState<DashboardStats | undefined>(undefined);
  const [comparisons, setComparisons] = useState<Comparisons | undefined>(undefined);
  const [recentOrders, setRecentOrders] = useState<DashboardOrder[] | undefined>(undefined);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[] | undefined>(undefined);
  const [categories, setCategories] = useState<CategoryItem[] | undefined>(undefined);
  const [monthlySeries, setMonthlySeries] = useState<RevenuePoint[] | undefined>(undefined);
  const [dailySeries, setDailySeries] = useState<DailyPoint[] | undefined>(undefined);
  const [monthlyTarget, setMonthlyTarget] = useState<MonthlyTargetData | undefined>(undefined);
  const [ordersByStatus, setOrdersByStatus] = useState<OrderStatusCount[] | undefined>(undefined);
  const [inventory, setInventory] = useState<InventoryData | undefined>(undefined);
  const [newestCustomers, setNewestCustomers] = useState<NewCustomer[] | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [searchRecords, setSearchRecords] = useState<ProductSearchRecord[]>([]);
  const [searchMatches, setSearchMatches] = useState<ProductSearchRecord[] | null>(null);

  const fetchData = useCallback(async () => {
    setLoadError(false);
    setSlowLoad(false);
    setStats(undefined);
    setComparisons(undefined);
    setRecentOrders(undefined);
    setActivityLogs(undefined);
    setCategories(undefined);
    setMonthlySeries(undefined);
    setDailySeries(undefined);
    setMonthlyTarget(undefined);
    setOrdersByStatus(undefined);
    setInventory(undefined);
    setNewestCustomers(undefined);

    // The dashboard payload drives every card — render as soon as IT
    // lands instead of holding the page hostage to the (independent)
    // products request, which used to delay everything behind whichever
    // call was slower on a cold start.
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

    const rawStats = data.stats || {};
    setStats({
      totalRevenue: Number(rawStats.totalRevenue || 0),
      totalOrders: Number(rawStats.totalOrders || 0),
      totalCustomers: Number(rawStats.totalCustomers || 0),
      totalProducts: Number(rawStats.totalProducts || 0),
    });
    setComparisons(data.comparisons || {});

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

    // Revenue series — aggregated server-side from the real Order
    // collection (cancelled orders excluded), monthly and daily.
    setMonthlySeries(
      Array.isArray(data.revenueSeries)
        ? data.revenueSeries.map((point: AnyRecord) => ({
            month: String(point.month || ""),
            revenue: Number(point.revenue || 0),
            orders: Number(point.orders || 0),
          }))
        : []
    );
    setDailySeries(
      Array.isArray(data.dailySeries)
        ? data.dailySeries.map((point: AnyRecord) => ({
            day: String(point.day || ""),
            revenue: Number(point.revenue || 0),
            orders: Number(point.orders || 0),
          }))
        : []
    );

    const target = data.monthlyTarget || {};
    setMonthlyTarget({
      target: Number(target.target || 0),
      revenueThisMonth: Number(target.revenueThisMonth || 0),
      percentage:
        target.percentage === null || target.percentage === undefined
          ? null
          : Number(target.percentage),
      vsLastMonthPct:
        target.vsLastMonthPct === null || target.vsLastMonthPct === undefined
          ? null
          : Number(target.vsLastMonthPct),
    });

    setOrdersByStatus(
      Array.isArray(data.ordersByStatus)
        ? data.ordersByStatus.map((row: AnyRecord) => ({
            status: String(row.status || ""),
            count: Number(row.count || 0),
          }))
        : []
    );

    const inv = data.inventory || {};
    setInventory({
      total: Number(inv.total || 0),
      published: Number(inv.published || 0),
      inStock: Number(inv.inStock || 0),
      lowStock: Number(inv.lowStock || 0),
      outOfStock: Number(inv.outOfStock || 0),
    });

    setNewestCustomers(
      (data.newestCustomers || []).map((customer: AnyRecord) => ({
        id: String(customer._id),
        name:
          [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
          customer.email ||
          "—",
        email: customer.email || "",
        joined: customer.createdAt ? fmtJoinedDate(customer.createdAt) : "",
      }))
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

  const statsLoading = stats === undefined;

  // Role gate: every shipped default grants Dashboard view, but a matrix
  // edit can remove it — then show a clean notice instead of empty cards
  // (the dashboard API answers 403 in that case anyway).
  const canViewDashboard =
    typeof hasPermission !== "function" || hasPermission("Dashboard", "view");
  if (isAuthenticated && !canViewDashboard) {
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
        />
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <h2 className="text-base font-bold">
            You don&apos;t have permission to view the Dashboard
          </h2>
          <p className="max-w-sm text-xs text-[var(--text-muted)]">
            Your role ({user?.role || "Staff"}) can&apos;t access this section. Ask a
            Super Admin to change it in Settings → Users &amp; Roles.
          </p>
        </div>
      </div>
    );
  }

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
          {slowLoad && statsLoading && (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-(--text-muted)">
              The server is waking up — the first load after a quiet period can
              take a little longer. Your numbers will appear in a moment.
            </div>
          )}

          {/* Reference grid: main column + tall Top Categories rail */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 items-stretch">
            <div className="xl:col-span-3 flex flex-col gap-3 min-w-0">
              {/* Stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DashboardStatCard
                  title="Total Revenue"
                  value={statsLoading ? "" : fmtWholeMoney(stats.totalRevenue)}
                  icon={CircleDollarSign}
                  wowPct={comparisons?.revenue?.pct}
                  highlighted
                  loading={statsLoading}
                />
                <DashboardStatCard
                  title="Total Orders"
                  value={statsLoading ? "" : stats.totalOrders.toLocaleString()}
                  icon={ShoppingBag}
                  wowPct={comparisons?.orders?.pct}
                  loading={statsLoading}
                />
                <DashboardStatCard
                  title="Total Customers"
                  value={statsLoading ? "" : stats.totalCustomers.toLocaleString()}
                  icon={Users}
                  wowPct={comparisons?.customers?.pct}
                  loading={statsLoading}
                />
              </div>

              {/* Revenue chart + Monthly target */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 flex-1">
                <section className="lg:col-span-3 min-w-0">
                  <RevenueAnalytics
                    dailyData={dailySeries}
                    monthlyData={monthlySeries}
                  />
                </section>
                <section className="lg:col-span-2 min-w-0">
                  <MonthlyTargetCard data={monthlyTarget} />
                </section>
              </div>
            </div>

            {/* Right rail — spans the stats + chart rows */}
            <section className="min-w-0">
              <TopCategories
                categoriesData={categories}
                loading={categories === undefined}
              />
            </section>
          </div>

          {/* Bottom row — mirrors the reference's three-card strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
            <section className="xl:col-span-3 min-w-0">
              <NewCustomersCard customers={newestCustomers} />
            </section>
            <section className="md:col-span-2 xl:col-span-5 min-w-0">
              <InventoryOverviewCard data={inventory} />
            </section>
            <section className="xl:col-span-4 min-w-0">
              <OrdersByStatusCard data={ordersByStatus} />
            </section>
          </div>

          {/* Existing real cards, kept below the new grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <section className="xl:col-span-2 min-w-0">
              <RecentOrdersCard orders={recentOrders} />
            </section>
            <section className="min-w-0">
              <ActivityCard logs={activityLogs} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
