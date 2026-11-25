import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";
import { formatMoney } from "@/services/currency";

export interface ProductImage {
  url: string;
  publicId?: string;
  mediaId?: string;
  alt?: string;
  isMain?: boolean;
  // Legacy names from before the gallery — still read for old records.
  altText?: string;
  isPrimary?: boolean;
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export interface Product {
  code?: string;
  _id?: string;
  name: string;
  sku: string;
  slug?: string;
  description?: string;
  price: number;
  comparePrice?: number;
  costPrice?: number;
  stock: number;
  lowStockThreshold?: number;
  category:
    | string
    | {
        _id?: string;
        name?: string;
        /** The category's own parent id (populated docs carry the raw ref). */
        parent?: string | { _id?: string } | null;
      };
  brand?: string | { _id?: string; name?: string };
  /** Mirror of the main gallery image's URL (kept by the API). */
  image?: string;
  images?: ProductImage[];
  status: string;
  weight?: number;
  dimensions?: { length?: number; width?: number; height?: number } | string;
  tags?: string[];
  attributes?: ProductAttribute[];
  averageRating?: number;
  reviewCount?: number;
  createdAt?: string;
}

type Reference = string | { _id?: string; name?: string } | undefined;

const referenceId = (reference: Reference): string =>
  typeof reference === "string" ? reference : reference?._id || "";

const referenceName = (reference: Reference): string =>
  typeof reference === "string" ? reference : reference?.name || "";

const primaryImage = (product: Product): string =>
  product.images?.find((img) => img.isMain ?? img.isPrimary)?.url ||
  product.images?.[0]?.url ||
  product.image ||
  "";

/**
 * The product's gallery in the form's canonical shape: legacy field
 * names folded into alt/isMain, exactly one main, main first. A product
 * that only carries the single `image` mirror becomes a 1-image gallery.
 */
const galleryOf = (product?: Product | null): ProductImage[] => {
  const entries: ProductImage[] = (product?.images || [])
    .filter((img) => img && img.url)
    .map((img) => ({
      url: img.url,
      publicId: img.publicId,
      mediaId: img.mediaId,
      alt: img.alt ?? img.altText ?? "",
      isMain: Boolean(img.isMain ?? img.isPrimary),
    }));

  if (entries.length === 0) {
    return product?.image ? [{ url: product.image, alt: "", isMain: true }] : [];
  }

  if (!entries.some((entry) => entry.isMain)) entries[0].isMain = true;
  const mainIndex = entries.findIndex((entry) => entry.isMain);
  if (mainIndex > 0) {
    const [main] = entries.splice(mainIndex, 1);
    entries.unshift(main);
  }
  return entries;
};

const dimensionsText = (product: Product): string => {
  if (!product.dimensions) return "";
  if (typeof product.dimensions === "string") return product.dimensions;
  const { length, width, height } = product.dimensions;
  if (length === undefined && width === undefined && height === undefined) return "";
  return `${length ?? ""} x ${width ?? ""} x ${height ?? ""}`.trim();
};

export const productConfig = {
  routeTitle: "Products",

  // Static header-strip label (the old first tab's wording). Display
  // only — status filtering lives in the FilterBar dropdown.
  allLabel: "All Products",

  // Action Buttons
  buttons: [
    {
      id: "export",
      label: "Export Products",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Add Product",
      icon: Plus,
      variant: "primary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "refresh",
      label: "Refresh Data",
      icon: RefreshCcwDot,
      variant: "primary" as const,
      show: true,
      disabled: false,
    },
  ],

  // Search Parameters (top-level fields of the API records)
  // category/brand are populated objects — the list search flattens
  // them, so their names are searchable too.
  searchFields: ["name", "sku", "status", "code", "category", "brand"],

  // Table Column Labels
  columnHeaders: {
    _id: "ID",
    name: "Name",
    sku: "SKU",
    category: "Category",
    price: "Price",
    stock: "Stock",
    status: "Status",
  },

  // Columns the table header offers a sort arrow for (Part 4): the
  // value is read from the RAW row (never the formatted cell text),
  // and sorting runs over the whole list before pagination.
  sortableColumns: {
    name: { field: "name", type: "string" },
    price: { field: "price", type: "number" },
    stock: { field: "stock", type: "number" },
    status: { field: "status", type: "string" },
  },

  // Map Data for CreateTable Component
  mapTableData: (product: Product) => ({
    id: product._id,
    _id: product._id,
    code: product.code,
    name: product.name,
    image: primaryImage(product),
    sku: product.sku,
    category: referenceName(product.category),
    price: formatMoney(product.price ?? 0, 2),
    stock: product.stock,
    status: product.status,
  }),

  // Map Data for DetailPanel Component
  mapDetailData: (product: Product) => ({
    id: product._id,
    code: product.code,
    title: product.name,
    status: product.status,
    image: primaryImage(product),
    gallery: galleryOf(product).map((img) => img.url),
    salePrice: product.price ?? 0,
    price:
      product.comparePrice && product.comparePrice > (product.price ?? 0)
        ? product.comparePrice
        : undefined,
    discount:
      product.comparePrice && product.comparePrice > (product.price ?? 0)
        ? Math.round((1 - (product.price ?? 0) / product.comparePrice) * 100)
        : undefined,
    rating: product.averageRating || undefined,
    reviewsCount: product.reviewCount || 0,
    shortDescription: `SKU: ${product.sku}`,
    attributes: {
      SKU: product.sku,
      Category: referenceName(product.category) || "—",
      Brand: referenceName(product.brand) || "—",
      "Cost Price": product.costPrice ? formatMoney(product.costPrice, 2) : "—",
      Stock: product.stock,
      "Low Stock Alert": product.lowStockThreshold ?? "—",
      Weight: product.weight ? `${product.weight} kg` : "—",
      Dimensions: dimensionsText(product) || "—",
      Added: product.createdAt ? new Date(product.createdAt).toLocaleDateString() : "—",
    },
    description: product.description || "",
    tags: product.tags || [],
    specifications: (product.attributes || []).map((attr) => ({
      key: attr.name,
      value: attr.value,
    })),
  }),

  // Map Data for FormModal (Add/Edit Mode). The form carries TWO
  // category fields (Ahsan's design): `category` is the MAIN
  // category, `subCategory` the dependent subcategory whose id is
  // what actually gets stored. Edit pre-fill splits the product's
  // stored category accordingly: a subcategory's product fills Main
  // with its parent and Sub with itself; a product filed directly
  // under a main (grandfathered) fills Main with that category and
  // leaves Sub empty.
  mapFormData: (product?: Product) => {
    if (!product) {
      return {
        name: "",
        sku: "",
        category: "",
        subCategory: "",
        brand: "",
        status: "published",
        price: 0,
        comparePrice: "",
        costPrice: "",
        stock: 0,
        lowStockThreshold: 10,
        weight: "",
        dimensions: "",
        images: [],
        description: "",
        tags: [],
        specifications: [],
      };
    }

    const storedCategoryId = referenceId(product.category);
    const storedParentId =
      product.category && typeof product.category === "object"
        ? referenceId(product.category.parent as Reference)
        : "";
    return {
      name: product.name || "",
      sku: product.sku || "",
      category: storedParentId || storedCategoryId,
      subCategory: storedParentId ? storedCategoryId : "",
      brand: referenceId(product.brand),
      status: product.status || "draft",
      price: product.price ?? 0,
      comparePrice: product.comparePrice ?? "",
      costPrice: product.costPrice ?? "",
      stock: product.stock ?? 0,
      lowStockThreshold: product.lowStockThreshold ?? 10,
      weight: product.weight ?? "",
      dimensions: dimensionsText(product),
      images: galleryOf(product),
      description: product.description || "",
      tags: product.tags || [],
      specifications: (product.attributes || []).map((attr) => ({
        key: attr.name,
        value: attr.value,
      })),
    };
  },

  // Table Filters (matched against the raw API records). Status is a
  // plain field match; Stock and Price are bucket filters — the same
  // thresholds the notification feed uses (out = 0, low = 1–5) and
  // price bands fitted to the catalog's actual spread ($9.99–$549.99).
  filters: [
    {
      id: "status",
      placeholder: "All Statuses",
      options: [
        { label: "All Statuses", value: "all" },
        { label: "Published", value: "published" },
        { label: "Active", value: "active" },
        { label: "Draft", value: "draft" },
        { label: "Pending Review", value: "pending_review" },
        { label: "Archived", value: "archived" },
      ],
    },
    {
      id: "stockLevel",
      placeholder: "All Stock",
      options: [
        { label: "All Stock", value: "all" },
        { label: "In Stock", value: "in_stock" },
        { label: "Low Stock (1–5)", value: "low_stock" },
        { label: "Out of Stock", value: "out_of_stock" },
      ],
      matchValue: (product: Product) => {
        const stock = Number(product.stock ?? 0);
        if (stock <= 0) return "out_of_stock";
        if (stock <= 5) return "low_stock";
        return "in_stock";
      },
    },
    {
      id: "priceRange",
      placeholder: "All Prices",
      options: [
        { label: "All Prices", value: "all" },
        { label: "Under $25", value: "under_25" },
        { label: "$25 – $50", value: "25_50" },
        { label: "$50 – $100", value: "50_100" },
        { label: "$100 – $250", value: "100_250" },
        { label: "Over $250", value: "over_250" },
      ],
      matchValue: (product: Product) => {
        const price = Number(product.price ?? 0);
        if (price < 25) return "under_25";
        if (price < 50) return "25_50";
        if (price < 100) return "50_100";
        if (price < 250) return "100_250";
        return "over_250";
      },
    },
  ],

  // FormModal Dropdown Options
  statusOptions: [
    { label: "Published", value: "published" },
    { label: "Active", value: "active" },
    { label: "Pending Review", value: "pending_review" },
    { label: "Draft", value: "draft" },
    { label: "Inactive", value: "inactive" },
    { label: "Rejected", value: "rejected" },
    { label: "Archived", value: "archived" },
  ] as SelectOption[],

  // Dynamic FormModal Schema Definition
  formFields: [
    // Section 1: Basic Information
    {
      name: "name",
      label: "Product Name",
      type: "text",
      required: true,
      colSpan: 2,
      placeholder: "e.g. Wireless Noise-Canceling Headphones",
      section: "Basic Information",
    },
    {
      name: "sku",
      label: "SKU / Code",
      type: "text",
      required: true,
      colSpan: 1,
      placeholder: "e.g. HD-PRO-100",
      section: "Basic Information",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "Published", value: "published" },
        { label: "Active", value: "active" },
        { label: "Pending Review", value: "pending_review" },
        { label: "Draft", value: "draft" },
        { label: "Inactive", value: "inactive" },
        { label: "Rejected", value: "rejected" },
        { label: "Archived", value: "archived" },
      ],
      section: "Basic Information",
    },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      colSpan: 1,
      section: "Basic Information",
    },
    {
      // Dependent picker (Ahsan's design): with no main chosen it
      // lists every subcategory; with a main chosen, only that
      // main's subs. The chosen sub's id is the stored category.
      name: "subCategory",
      label: "Sub Category",
      type: "select",
      required: true,
      colSpan: 1,
      section: "Basic Information",
    },
    {
      name: "brand",
      label: "Brand",
      type: "select",
      colSpan: 1,
      section: "Basic Information",
    },

    // Section 2: Pricing & Inventory
    {
      name: "price",
      label: "Sale Price ($)",
      type: "number",
      required: true,
      min: 0,
      step: 0.01,
      colSpan: 1,
      // The shell appends the live discount readout (computed from
      // the form's current sale/compare values) as the helper suffix.
      helperText: "The price the customer pays.",
      section: "Pricing & Inventory",
    },
    {
      name: "comparePrice",
      label: "Compare-at Price ($)",
      type: "number",
      min: 0,
      step: 0.01,
      colSpan: 1,
      helperText: "Original price shown struck through; must be higher than the sale price.",
      section: "Pricing & Inventory",
    },
    {
      name: "costPrice",
      label: "Cost Price ($)",
      type: "number",
      min: 0,
      step: 0.01,
      colSpan: 1,
      helperText: "Your own buying or making cost; never shown to customers.",
      section: "Pricing & Inventory",
    },
    {
      name: "stock",
      label: "Stock Quantity",
      type: "number",
      required: true,
      min: 0,
      colSpan: 1,
      section: "Pricing & Inventory",
    },
    {
      name: "lowStockThreshold",
      label: "Low Stock Alert",
      type: "number",
      min: 0,
      colSpan: 1,
      section: "Pricing & Inventory",
    },
    {
      name: "weight",
      label: "Weight (kg)",
      type: "number",
      step: 0.01,
      min: 0,
      colSpan: 1,
      section: "Pricing & Inventory",
    },
    {
      name: "dimensions",
      label: "Dimensions (L x W x H cm)",
      type: "text",
      colSpan: 2,
      placeholder: "e.g. 20 x 15 x 8",
      section: "Pricing & Inventory",
    },

    // Section 3: Tags & Specifications
    {
      name: "tags",
      label: "Product Tags",
      type: "tags",
      colSpan: 2,
      placeholder: "Type and press Enter...",
      section: "Tags & Specifications",
    },
    {
      name: "specifications",
      label: "Product Attributes",
      type: "key-value",
      colSpan: 2,
      section: "Tags & Specifications",
    },

    // Section 4: Media & Description
    {
      name: "images",
      label: "Product Images",
      type: "media-gallery",
      colSpan: 4,
      helperText:
        "Up to 7 images — upload new files or select from the media library, and mark one as the main image.",
      section: "Media & Description",
    },
    {
      name: "description",
      label: "Full Description",
      type: "textarea",
      required: true,
      rows: 4,
      colSpan: 4,
      section: "Media & Description",
    },
  ] as FormField[],
};
