// /app/[pages]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

import TopBar from "@/components/ui/TopBar";
import StatsGrid from "@/components/models/StatsGrid";
import MediaStats from "@/components/models/MediaStats";
import TabsBar, { HeaderActionButton } from "@/components/models/TabsBar";
import FilterBar from "@/components/models/FilterBar";
import { CreateTable } from "@/components/models/CreateTable";
import Pagination from "@/components/models/Pagination";
import { DetailPanel } from "@/components/models/DetailPanel";
import FormModal, { FormField, ItemFormData } from "@/components/models/FormModal";
import MediaHandlerModal from "@/components/models/MediaHandler";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toast";

import { getRouteConfigByPath } from "@/config";
import { extractApiError, PaginationMeta } from "@/services/api";
import { useAdminAuth } from "@/services/authContext";
import { useStoreCurrency } from "@/services/currency";
import {
  getCapabilities,
  getResourceService,
  mediaService,
} from "@/services/resourceRegistry";
import { EntityOption, EntityOptions } from "@/services/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// The panel searches, filters and paginates over one fetched batch, so pull a
// generous page in a single request rather than round-tripping on each keypress.
const MAX_ROWS = 200;
const DEFAULT_PAGE_SIZE = 10;

/** Replaces config dropdown options with the live ones loaded from the API. */
function withDynamicOptions(
  fields: FormField[],
  options: EntityOptions,
  optionsLoaded: boolean,
): FormField[] {
  return fields.map((field) => {
    switch (field.name) {
      case "parentCategory":
        return options.categoryOptions?.length
          ? {
              ...field,
              options: [
                { label: "Main Category (None)", value: "" },
                ...options.categoryOptions,
              ],
            }
          : field;
      case "category":
        if (options.categoryOptions?.length) {
          return { ...field, options: options.categoryOptions };
        }
        // Loaded and genuinely empty: offer to create the first category
        // instead of leaving a dead dropdown (product form only — the
        // "category" field name is unique to it).
        if (
          optionsLoaded &&
          Array.isArray(options.categoryOptions) &&
          options.categoryOptions.length === 0
        ) {
          return {
            ...field,
            createNew: {
              emptyMessage: "No categories yet",
              buttonLabel: "Create New Category",
              path: "/categories",
              resource: "categories",
            },
          };
        }
        return field;
      case "brand":
        if (options.brandOptions?.length) {
          return { ...field, options: options.brandOptions };
        }
        if (
          optionsLoaded &&
          Array.isArray(options.brandOptions) &&
          options.brandOptions.length === 0
        ) {
          return {
            ...field,
            createNew: {
              emptyMessage: "No brands yet",
              buttonLabel: "Create New Brand",
              path: "/brands",
              resource: "brands",
            },
          };
        }
        return field;
      case "vendor":
        return options.vendorOptions?.length ? { ...field, options: options.vendorOptions } : field;
      case "product":
        return options.productOptions?.length ? { ...field, options: options.productOptions } : field;
      case "user":
        return options.userOptions?.length ? { ...field, options: options.userOptions } : field;
      default:
        return field;
    }
  });
}

/**
 * Products must belong to a vendor (the schema requires it) but the config has
 * no vendor picker, so add one whenever the route supplies vendor options.
 */
function ensureVendorField(fields: FormField[], options: EntityOptions): FormField[] {
  if (!options.vendorOptions?.length) return fields;
  if (fields.some((field) => field.name === "vendor")) return fields;

  return [
    ...fields,
    {
      name: "vendor",
      label: "Vendor / Store",
      type: "select",
      required: true,
      colSpan: 2,
      section: "Basic Information",
      options: options.vendorOptions,
    } as FormField,
  ];
}

/** Tab labels are human readable ("Pending Review"); statuses are snake_case. */
function normaliseStatus(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "_");
}

/** URL segment → permission module (role matrix). */
const MODULE_BY_SEGMENT: Record<string, string> = {
  products: "Products",
  orders: "Orders",
  customers: "Customers",
  categories: "Categories",
  brands: "Brands",
  coupons: "Coupons",
  media: "Media",
  reviews: "Reviews",
};

const PageLayout: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isRestoring, user, hasPermission } = useAdminAuth();
  // Money cells are produced by the config mappers at memo time — the
  // active currency is a memo dependency so they re-map on change.
  const currencyCode = useStoreCurrency();

  const moduleName = MODULE_BY_SEGMENT[pathname.split("/").filter(Boolean)[0] || ""] ?? null;
  // UI gating only — the backend answers 403 for anything not allowed.
  // While permissions are unloaded hasPermission says yes (no flicker).
  const can = useCallback(
    (action: string): boolean =>
      !moduleName || typeof hasPermission !== "function"
        ? true
        : hasPermission(moduleName, action),
    [moduleName, hasPermission],
  );
  const canView = can("view");
  const canCreate = can("create");
  const canEdit = can("edit");
  const canDelete = can("delete");

  const currentConfig = useMemo(() => getRouteConfigByPath(pathname), [pathname]);
  const service = useMemo(() => getResourceService(pathname), [pathname]);
  const capabilities = useMemo(() => getCapabilities(service), [service]);

  const Route = currentConfig.routeTitle;
  const isMediaPage = pathname.includes("/media") || Route.toLowerCase() === "media";

  const tablist = useMemo(
    () => currentConfig.tabs || [`All ${Route}`],
    [currentConfig, Route],
  );

  // --- data state ---------------------------------------------------------
  const [items, setItems] = useState<Row[]>([]);
  const [displayItems, setDisplayItems] = useState<Row[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [options, setOptions] = useState<EntityOptions>({});
  // True once the dropdown-options request has settled for the current
  // route — distinguishes "still loading" from "loaded and empty".
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // --- view state ---------------------------------------------------------
  const [activeTab, setActiveTab] = useState(tablist[0] || `All ${Route}`);
  const [selectedRawRow, setSelectedRawRow] = useState<Row | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formData, setFormData] = useState<ItemFormData>({});
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // --- fetch the list -----------------------------------------------------
  useEffect(() => {
    if (!service || !isAuthenticated) return;

    let cancelled = false;
    setIsLoading(true);

    service
      .list({ page: 1, limit: MAX_ROWS })
      .then(({ items: rows, meta: pageMeta }) => {
        if (cancelled) return;
        setItems(rows);
        setDisplayItems(rows);
        setMeta(pageMeta);
      })
      .catch((error) => {
        if (cancelled) return;
        setItems([]);
        setDisplayItems([]);
        toast.error(extractApiError(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [service, isAuthenticated, reloadToken]);

  // --- fetch dropdown options --------------------------------------------
  useEffect(() => {
    // A new route starts from "not loaded" so a previous page's lists
    // can't masquerade as this page's (or claim a list is empty early).
    setOptions({});
    setOptionsLoaded(false);
    if (!service?.loadOptions || !isAuthenticated) {
      setOptionsLoaded(true);
      return;
    }

    let cancelled = false;
    service
      .loadOptions()
      .then((loaded) => {
        if (!cancelled) {
          setOptions(loaded);
          setOptionsLoaded(true);
        }
      })
      .catch(() => {
        /* options are optional — the static config values remain in place */
        if (!cancelled) setOptionsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [service, isAuthenticated]);

  // Reset the view whenever the route changes.
  useEffect(() => {
    setActiveTab(currentConfig.tabs?.[0] || `All ${currentConfig.routeTitle}`);
    setSelectedRawRow(null);
    setCurrentPage(1);
  }, [currentConfig]);

  // Any change to what is displayed returns to page 1.
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // --- derived data -------------------------------------------------------
  const tabFilteredItems = useMemo(() => {
    if (activeTab === tablist[0]) return items;
    const wanted = normaliseStatus(activeTab);
    // "active" and "published" are the same live state in the product
    // taxonomy (the schema accepts both) — a product in either must show
    // under the Published tab instead of vanishing from every tab.
    const STATUS_ALIASES: Record<string, string[]> = {
      published: ["published", "active"],
      active: ["active", "published"],
    };
    const wantedSet = STATUS_ALIASES[wanted] || [wanted];
    return items.filter((item) => wantedSet.includes(normaliseStatus(item.status)));
  }, [items, activeTab, tablist]);

  const totalPages = Math.max(1, Math.ceil(displayItems.length / itemsPerPage));

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return displayItems.slice(start, start + itemsPerPage);
  }, [displayItems, currentPage, itemsPerPage]);

  // The config union types each route's mappers with its own row shape, so
  // read them through one permissive signature.
  const tableMapper = (currentConfig as unknown as { mapTableData?: (row: Row) => Row })
    .mapTableData;
  const detailMapper = (
    currentConfig as unknown as { mapDetailData?: (row: Row) => Record<string, unknown> }
  ).mapDetailData;

  const formattedTableData = useMemo(() => {
    return tableMapper ? pagedItems.map((item) => tableMapper(item)) : pagedItems;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedItems, tableMapper, currencyCode]);

  const selectedDetailData = useMemo(() => {
    if (!selectedRawRow) return null;
    if (detailMapper) return detailMapper(selectedRawRow);
    return {
      id: selectedRawRow._id || selectedRawRow.id,
      code: selectedRawRow.code,
      title: selectedRawRow.name || "Details",
      status: selectedRawRow.status || "active",
      attributes: selectedRawRow,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRawRow, detailMapper, currencyCode]);

  const btnlist: HeaderActionButton[] = useMemo(() => {
    if (!currentConfig.buttons) return [];
    return currentConfig.buttons
      .filter((btn) => {
        if (!btn.show) return false;
        if (btn.id === "new-item") return (capabilities.canCreate || isMediaPage) && canCreate;
        return true;
      })
      .map((btn) => ({
        id: btn.id,
        label: btn.label,
        icon: btn.icon,
        variant: btn.variant,
        disabled: btn.disabled,
      }));
  }, [currentConfig, capabilities, isMediaPage, canCreate]);

  const formFields = useMemo(() => {
    // Not every route config declares form fields (media uses its own modal).
    const base = (currentConfig as { formFields?: FormField[] }).formFields || [];
    const withOptions = withDynamicOptions(base, options, optionsLoaded);
    // Only products need the vendor picker.
    return Route.toLowerCase() === "products"
      ? ensureVendorField(withOptions, options)
      : withOptions;
  }, [currentConfig, options, optionsLoaded, Route]);

  // Static fallbacks declared in the route configs, read through one shape so
  // the union of config types does not fight the props.
  const configOptions = currentConfig as unknown as {
    categoryOptions?: EntityOption[];
    brandOptions?: EntityOption[];
    statusOptions?: EntityOption[];
  };

  // --- handlers ---------------------------------------------------------

  const formMapper = (
    currentConfig as unknown as { mapFormData?: (row?: Row) => ItemFormData }
  ).mapFormData;

  const buildInitialFormValues = useCallback(
    (row?: Row): ItemFormData => {
      const mapped = formMapper ? formMapper(row) : row ? { ...row } : {};
      if (row && Route.toLowerCase() === "products") {
        // These refs are not part of the visible form but must survive the
        // round trip so an edit does not clear them.
        return {
          ...mapped,
          vendorId: row.vendorId,
          categoryId: row.categoryId,
          brandId: row.brandId,
          price: row.costPriceOverride ?? mapped.price,
        };
      }
      return mapped;
    },
    [formMapper, Route],
  );

  const handleExport = useCallback(() => {
    const columns = Object.keys(currentConfig.columnHeaders || {});
    if (columns.length === 0) return;

    const csvRows = displayItems.map((item) => {
      const mapped = tableMapper ? tableMapper(item) : item;
      return columns
        .map((column) => {
          const value = mapped[column] ?? "";
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(",");
    });

    const csv = [columns.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${Route.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentConfig, displayItems, tableMapper, Route]);

  const handleBtnClick = useCallback(
    (btnId: string) => {
      if (btnId === "new-item") {
        setFormMode("add");
        setFormData(buildInitialFormValues());
        setIsModalOpen(true);
      } else if (btnId === "refresh") {
        reload();
      } else if (btnId === "export") {
        handleExport();
      }
    },
    [buildInitialFormValues, reload, handleExport],
  );

  const handleEditItem = useCallback(() => {
    if (!selectedRawRow) return;
    setFormMode("edit");
    setFormData(buildInitialFormValues(selectedRawRow));
    setIsModalOpen(true);
  }, [selectedRawRow, buildInitialFormValues]);

  const handleSelectRow = useCallback(
    (mappedRow: Row) => {
      const raw = items.find(
        (item) => (item._id || item.id) === (mappedRow._id || mappedRow.id),
      );
      setSelectedRawRow(raw || mappedRow);
    },
    [items],
  );

  const handleRowEdit = useCallback(
    (mappedRow: Row) => {
      const raw =
        items.find(
          (item) => (item._id || item.id) === (mappedRow._id || mappedRow.id),
        ) || mappedRow;
      setSelectedRawRow(raw);
      setFormMode("edit");
      setFormData(buildInitialFormValues(raw));
      setIsModalOpen(true);
    },
    [items, buildInitialFormValues],
  );

  const handleSaveItem = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!service) return;

      setIsSaving(true);

      try {
        if (formMode === "add") {
          if (!service.create) {
            throw new Error(`Creating ${Route} is not supported by the API.`);
          }
          const created = await service.create(formData);
          const generated = (created as { temporaryPassword?: string } | null)?.temporaryPassword;
          toast.success(
            generated
              ? `${Route} created. Temporary password: ${generated}`
              : `${Route} created successfully.`,
          );
        } else {
          const id = selectedRawRow?._id || selectedRawRow?.id;
          if (!service.update || !id) {
            throw new Error(`Updating ${Route} is not supported by the API.`);
          }
          const result = await service.update(String(id), formData);
          toast.success(
            Array.isArray(result)
              ? `${Route} updated: ${result.join(", ")}.`
              : `${Route} updated successfully.`,
          );
        }

        setIsModalOpen(false);
        reload();
      } catch (error) {
        toast.error(extractApiError(error));
      } finally {
        setIsSaving(false);
      }
    },
    [service, formMode, formData, selectedRawRow, Route, reload],
  );

  const handleDeleteItem = useCallback(
    async (id: string) => {
      if (!service?.remove) {
        toast.error(`Deleting ${Route} is not supported by the API.`);
        return;
      }

      // The panel's own confirmation dialog — never the browser's
      // native confirm() (it showed the hosting domain and clashed
      // with the design).
      const confirmed = await confirmDialog({
        title: `Delete this ${Route.replace(/s$/, "").toLowerCase()}?`,
        message: "This cannot be undone.",
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!confirmed) {
        return;
      }

      try {
        await service.remove(id);
        setSelectedRawRow(null);
        toast.success(`${Route} deleted.`);
        reload();
      } catch (error) {
        toast.error(extractApiError(error));
      }
    },
    [service, Route, reload],
  );

  const handleRowDelete = useCallback(
    (mappedRow: Row) => {
      void handleDeleteItem(String(mappedRow._id || mappedRow.id));
    },
    [handleDeleteItem],
  );

  /**
   * The media modal hands back the picked file alongside its metadata. A file
   * present means "upload"; anything else would be an in-place edit, which the
   * media API does not support.
   *
   * In add mode the modal hands back the WHOLE queue as an array — every
   * picked file uploads (images already carry their processed file when
   * optimization applied). Edit mode still hands back a single record.
   */
  const handleMediaSave = useCallback(
    async (mediaData: Row | Row[]) => {
      if (Array.isArray(mediaData)) {
        setIsSaving(true);

        try {
          let uploaded = 0;
          for (const item of mediaData) {
            const file = item.file as File | undefined;
            if (!file) continue;
            await mediaService.upload({
              file,
              altText: item.altText,
              title: item.title,
              description: item.description,
              status: item.status,
            });
            uploaded++;
          }
          if (!uploaded) throw new Error("Pick a file before saving.");
          toast.success(
            uploaded === 1 ? "Media uploaded." : `${uploaded} media uploaded.`,
          );
          setIsModalOpen(false);
          reload();
        } catch (error) {
          toast.error(extractApiError(error));
        } finally {
          setIsSaving(false);
        }
        return;
      }

      setIsSaving(true);

      try {
        const file = mediaData.file as File | undefined;
        if (file) {
          await mediaService.upload({
            file,
            altText: mediaData.altText,
            title: mediaData.title,
            description: mediaData.description,
            status: mediaData.status,
          });
          toast.success("Media uploaded.");
        } else if (mediaData.id || mediaData._id) {
          // No new file picked — this is a metadata-only edit of an
          // already-uploaded item.
          await mediaService.update(String(mediaData.id || mediaData._id), {
            title: mediaData.title,
            altText: mediaData.altText,
            description: mediaData.description,
            status: mediaData.status,
          });
          toast.success("Media updated.");
        } else {
          throw new Error("Pick a file before saving.");
        }

        setIsModalOpen(false);
        reload();
      } catch (error) {
        toast.error(extractApiError(error));
      } finally {
        setIsSaving(false);
      }
    },
    [reload],
  );

  // --- "Used In" navigation (Edit Media → product / brand / category) --
  // The media panel lists everything using the item being edited;
  // clicking an entry hands its type + id over via sessionStorage and
  // lands on that resource's page, which opens its edit form.
  const handleOpenUsage = useCallback(
    (type: "product" | "brand" | "category", id: string) => {
      const path =
        type === "product"
          ? "/products"
          : type === "brand"
            ? "/brands"
            : "/categories";
      try {
        sessionStorage.setItem("openEntity", JSON.stringify({ type, id }));
      } catch {
        /* navigation still happens; the edit form just won't auto-open */
      }
      setIsModalOpen(false);
      router.push(path);
    },
    [router],
  );

  const handleOpenProduct = useCallback(
    (productId: string) => handleOpenUsage("product", productId),
    [handleOpenUsage],
  );

  useEffect(() => {
    if (items.length === 0) return;
    const pageType = pathname.startsWith("/products")
      ? "product"
      : pathname.startsWith("/brands")
        ? "brand"
        : pathname.startsWith("/categories")
          ? "category"
          : null;
    if (!pageType) return;

    let target: string | null = null;
    try {
      const raw = sessionStorage.getItem("openEntity");
      if (raw) {
        const parsed = JSON.parse(raw) as { type?: string; id?: string };
        if (parsed.type === pageType && parsed.id) target = parsed.id;
      }
      // Legacy key from when only products could be opened this way.
      if (!target && pageType === "product") {
        target = sessionStorage.getItem("openProductId");
      }
    } catch {
      /* storage unavailable */
    }
    if (!target) return;
    try {
      sessionStorage.removeItem("openEntity");
      sessionStorage.removeItem("openProductId");
    } catch {
      /* ignore */
    }
    const row = items.find((item) => String(item._id || item.id) === target);
    if (!row) return;
    setSelectedRawRow(row);
    setFormMode("edit");
    setFormData(buildInitialFormValues(row));
    setIsModalOpen(true);
  }, [pathname, items, buildInitialFormValues]);

  // --- Global-search handoff for media (TopBar search → Media edit) --
  // Clicking a media result in the TopBar search stores its id under
  // "openMediaId" and lands here; open that item's Edit Media panel.
  useEffect(() => {
    if (!isMediaPage || items.length === 0) return;
    let target: string | null = null;
    try {
      target = sessionStorage.getItem("openMediaId");
    } catch {
      /* storage unavailable */
    }
    if (!target) return;
    try {
      sessionStorage.removeItem("openMediaId");
    } catch {
      /* ignore */
    }
    const row = items.find((item) => String(item._id || item.id) === target);
    if (!row) return;
    setSelectedRawRow(row);
    setFormMode("edit");
    setIsModalOpen(true);
  }, [isMediaPage, items]);

  // --- "Create New" handoff (product form → Categories / Brands) -------
  // When the product form's Category/Brand list is empty, its dropdown
  // offers "Create New": the click stores the resource slug under
  // "openCreate" and navigates here. On landing (fresh mount or an
  // already-mounted page whose route just changed), open the same
  // create form the Add button opens, then clear the flag.
  useEffect(() => {
    const segment = pathname.split("/").filter(Boolean)[0] || "";
    let flag: string | null = null;
    try {
      flag = sessionStorage.getItem("openCreate");
    } catch {
      /* storage unavailable */
    }
    if (!flag || flag !== segment) return;
    try {
      sessionStorage.removeItem("openCreate");
    } catch {
      /* ignore */
    }
    // Mirror the Add button's visibility rule — no create rights, no form.
    if (!canCreate || isMediaPage) return;
    setFormMode("add");
    setFormData(buildInitialFormValues());
    setIsModalOpen(true);
  }, [pathname, canCreate, isMediaPage, buildInitialFormValues]);

  const isBusy = isLoading || isRestoring;
  const isTruncated = Boolean(meta && meta.total > items.length);

  // A truncated list used to be announced by the old inline banner; it
  // is an info toast now, fired once per route + total so reloads and
  // re-renders don't repeat it.
  const truncatedToastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isTruncated || !meta) return;
    const key = `${Route}:${meta.total}`;
    if (truncatedToastKeyRef.current === key) return;
    truncatedToastKeyRef.current = key;
    toast.info(
      `Showing the first ${items.length} of ${meta.total} records. Narrow the search to see the rest.`,
    );
  }, [isTruncated, meta, items.length, Route]);

  // Direct access to a module the role cannot view: a clean notice
  // instead of a broken page (the API would 403 the data anyway).
  if (isAuthenticated && moduleName && !canView) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-2 bg-[var(--background)] p-6 text-center text-[var(--text)]">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h2 className="text-base font-bold">
          You don&apos;t have permission to view {moduleName}
        </h2>
        <p className="max-w-sm text-xs text-[var(--text-muted)]">
          Your role ({user?.role || "Staff"}) can&apos;t access this section. Ask a
          Super Admin to change it in Settings → Users &amp; Roles.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 p-3 min-h-screen w-full flex-col text-[var(--text)] bg-[var(--background)] transition-colors duration-200 antialiased lg:h-screen lg:overflow-hidden">
      <header className="flex shrink-0 w-full items-center justify-between">
        <TopBar
          title={Route}
          subtitle={`Manage and organize all your ${Route.toLowerCase()}`}
          user={{
            name: user?.name || "Admin",
            role: user?.role
              ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
              : "Admin",
            email: user?.email,
            avatar: user?.avatar || "",
          }}
          messages={[]}
          notifications={[]}
          // No TopBar search on list pages: the FilterBar below owns
          // searching/filtering. Both used to write the displayed rows
          // from independent search state, so typing in one box was
          // silently overwritten by the other.
        />
      </header>

      <div className="flex flex-1 flex-col min-h-0 w-full overflow-y-auto lg:flex-row lg:overflow-hidden gap-3">
        <section className="flex flex-1 flex-col lg:min-w-158 min-h-0 bg-[var(--background)] space-y-3 lg:overflow-hidden">
          <div className="w-full shrink-0">
            {isMediaPage ? (
              <MediaStats items={items} isLoading={isBusy} />
            ) : (
              <StatsGrid pageUrl={Route.toLowerCase()} items={items} isLoading={isBusy} />
            )}
          </div>

          <div className="flex flex-1 flex-col min-h-100 lg:min-h-0 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm lg:overflow-hidden">
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-3 pt-3 pb-1 overflow-x-auto rounded-t-xl">
              <TabsBar
                tablist={tablist}
                activeTab={activeTab}
                onTabChange={(tab) => {
                  setActiveTab(tab);
                  setSelectedRawRow(null);
                }}
                btnlist={btnlist}
                onBtnClick={handleBtnClick}
              />
            </div>

            <div className="shrink-0 bg-[var(--surface)] px-3 sm:px-3 pt-3 pb-1">
              <FilterBar
                sourceData={tabFilteredItems as never}
                searchableFieldsKeys={currentConfig.searchFields}
                searchPlaceholder={`Search ${Route.toLowerCase()}...`}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                filtersData={(currentConfig.filters || []) as any}
                onDataChange={setDisplayItems}
              />
            </div>

            <div className="flex-1 min-h-0 border border-[var(--border)] rounded-xl overflow-auto bg-[var(--surface)] mx-3 relative">
              {isBusy && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--surface)]/70 backdrop-blur-[1px]">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)]" />
                </div>
              )}
              <CreateTable
                data={formattedTableData}
                selectedItem={
                  selectedRawRow && tableMapper ? tableMapper(selectedRawRow) : null
                }
                onSelectItem={handleSelectRow}
                onEditItem={canEdit ? handleRowEdit : undefined}
                onDeleteItem={canDelete ? handleRowDelete : undefined}
                columnHeaders={currentConfig.columnHeaders}
              />
            </div>

            <div className="shrink-0 rounded-b-xl bg-[var(--surface)] px-3">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                totalItems={displayItems.length}
                onPageChange={(page) => setCurrentPage(page)}
                onItemsPerPageChange={(limit) => {
                  setItemsPerPage(limit);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </section>

        <DetailPanel
          selectedItem={selectedDetailData as never}
          panelTitle={`${Route} Details`}
          onClose={() => setSelectedRawRow(null)}
          onEdit={canEdit ? handleEditItem : undefined}
          onDelete={
            canDelete
              ? (id) => {
                  void handleDeleteItem(String(id));
                }
              : undefined
          }
          editLabel={`Edit ${Route}`}
          deleteLabel={`Delete ${Route}`}
        />
      </div>

      {isMediaPage ? (
        <MediaHandlerModal
          isOpen={isModalOpen}
          mode={formMode}
          initialData={
            selectedRawRow
              ? {
                  ...selectedRawRow,
                  // The modal renders these as text — flatten the raw
                  // record's object/number fields first.
                  dimensions:
                    selectedRawRow.dimensions?.width &&
                    selectedRawRow.dimensions?.height
                      ? `${selectedRawRow.dimensions.width} x ${selectedRawRow.dimensions.height} px`
                      : "N/A",
                  size:
                    typeof selectedRawRow.size === "number"
                      ? `${(selectedRawRow.size / 1024).toFixed(1)} KB`
                      : selectedRawRow.size,
                  type: selectedRawRow.mimeType || selectedRawRow.type,
                  previewUrl: selectedRawRow.url,
                  mediaCategory: selectedRawRow.mimeType?.startsWith("video/")
                    ? "video"
                    : selectedRawRow.mimeType?.startsWith("image/")
                      ? "image"
                      : "document",
                }
              : null
          }
          onClose={() => setIsModalOpen(false)}
          onSave={handleMediaSave}
          onOpenProduct={handleOpenProduct}
          onOpenUsage={handleOpenUsage}
        />
      ) : (
        <FormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          formMode={formMode}
          itemTypeLabel={Route}
          formData={formData}
          setFormData={setFormData}
          handleSave={handleSaveItem}
          fields={formFields}
          categoryOptions={options.categoryOptions || configOptions.categoryOptions || []}
          brandOptions={options.brandOptions || configOptions.brandOptions || []}
          statusOptions={options.statusOptions || configOptions.statusOptions || []}
        />
      )}

      {isSaving && (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
          Saving...
        </div>
      )}
    </div>
  );
};

export default PageLayout;
