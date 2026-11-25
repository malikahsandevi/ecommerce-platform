import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";

export interface Category {
  code?: string;
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: string | { _id?: string; name?: string; image?: string } | null;
  isActive?: boolean;
  /** Derived from isActive by the list adapter. */
  status?: string;
  sortOrder?: number;
  /** Real usage count attached by GET /categories. */
  productsCount?: number;
  createdAt?: string;
}

const parentId = (category: Category): string => {
  if (!category.parent) return "";
  return typeof category.parent === "string"
    ? category.parent
    : category.parent._id || "";
};

// Detail-panel label for the hierarchy row: a subcategory names its
// parent (the list API populates it); a top-level category reads as a
// main category in its own right.
const parentLabel = (category: Category): string => {
  if (!category.parent) return "Main Category";
  return typeof category.parent === "string"
    ? "Main Category"
    : category.parent.name || "Main Category";
};

export const categoryConfig = {
  routeTitle: "Categories",

  // Static header-strip label (the old first tab's wording). Display
  // only — status filtering lives in the FilterBar dropdown. The
  // Categories page itself replaces this label with the hierarchy
  // tabs below (Ahsan's marks on his screenshot: tab 1 = main
  // categories, tab 2 = sub categories).
  allLabel: "All Categories",

  // Header-strip tabs for the Categories page: the existing list
  // flow (search, status/date filters, export, pagination) runs
  // scoped to the active tab — Main = parent null, Sub = parent set.
  hierarchyTabs: [
    { id: "main", label: "Main Categories" },
    { id: "sub", label: "Sub Categories" },
  ],

  // Header Action Buttons
  buttons: [
    {
      id: "export",
      label: "Export Categories",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Add Category",
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

  // Search Fields
  searchFields: ["name", "slug", "description", "code"],

  // Table Column Labels
  columnHeaders: {
    _id: "ID",
    name: "Name",
    slug: "Slug",
    sortOrder: "Sort",
    productsCount: "Products",
    status: "Status",
  },

  // Sub Categories tab columns: the Parent Category column rides
  // right after the name so every row identifies the main category
  // it belongs to (Ahsan's order). The Main tab keeps the exact
  // columns above — nothing there changes.
  subColumnHeaders: {
    _id: "ID",
    name: "Name",
    parentName: "Parent Category",
    slug: "Slug",
    sortOrder: "Sort",
    productsCount: "Products",
    status: "Status",
  },

  // Map Data for CreateTable Component
  mapTableData: (category: Category) => ({
    id: category._id,
    _id: category._id,
    code: category.code,
    name: category.name,
    image: category.image || "",
    // The parent's identity for the Sub tab's Parent Category cell
    // (name + thumbnail). Main-category rows carry empty values and
    // the Main tab's headers never render the column.
    parentName:
      category.parent && typeof category.parent === "object"
        ? category.parent.name || ""
        : "",
    parentImage:
      category.parent && typeof category.parent === "object"
        ? category.parent.image || ""
        : "",
    slug: category.slug,
    sortOrder: category.sortOrder ?? 0,
    // Real count attached by the API (products actually using this category).
    productsCount: category.productsCount ?? 0,
    status: category.status || (category.isActive === false ? "inactive" : "active"),
  }),

  // Map Data for DetailPanel Component
  mapDetailData: (category: Category) => ({
    id: category._id,
    code: category.code,
    title: category.name,
    status: category.status || (category.isActive === false ? "inactive" : "active"),
    image: category.image,
    shortDescription: category.description || `Slug: ${category.slug}`,
    attributes: {
      Slug: category.slug,
      "Parent Category": parentLabel(category),
      "Sort Order": category.sortOrder ?? 0,
      Products: category.productsCount ?? 0,
      "Created Date": category.createdAt
        ? new Date(category.createdAt).toLocaleDateString()
        : "—",
    },
    description: category.description || "",
  }),

  // Map Data for FormModal (Add/Edit Mode)
  mapFormData: (category?: Category) => {
    if (!category) {
      return {
        name: "",
        slug: "",
        parentCategory: "",
        description: "",
        image: "",
        status: "active",
        sortOrder: 0,
      };
    }

    return {
      _id: category._id,
      name: category.name || "",
      slug: category.slug || "",
      parentCategory: parentId(category),
      description: category.description || "",
      image: category.image || "",
      status: category.isActive === false ? "inactive" : "active",
      sortOrder: category.sortOrder ?? 0,
    };
  },

  // Table Filters — status (derived from isActive by the list adapter).
  filters: [
    {
      id: "status",
      placeholder: "All Statuses",
      options: [
        { label: "All Statuses", value: "all" },
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
    },
  ],

  statusOptions: [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ] as SelectOption[],

  // Dynamic FormModal Schema Definition
  formFields: [
    // Section 1: Category Details
    {
      name: "name",
      label: "Category Name",
      type: "text",
      required: true,
      colSpan: 2,
      placeholder: "e.g. Electronics",
      section: "Category Details",
    },
    {
      name: "slug",
      label: "Slug (URL identifier)",
      type: "text",
      colSpan: 2,
      placeholder: "e.g. electronics",
      helperText: "Leave blank to auto-generate from the category name.",
      section: "Category Details",
    },
    {
      name: "parentCategory",
      label: "Parent Category",
      type: "select",
      colSpan: 2,
      options: [{ label: "Main Category (None)", value: "" }],
      section: "Category Details",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
      section: "Category Details",
    },
    {
      name: "sortOrder",
      label: "Sort Order",
      type: "number",
      min: 0,
      colSpan: 1,
      section: "Category Details",
    },

    // Section 2: Visual Assets
    {
      name: "image",
      label: "Category Image URL",
      type: "image",
      colSpan: 2,
      placeholder: "https://...",
      section: "Visual Assets",
      uploadPurpose: "categories",
    },

    // Section 3: Description
    {
      name: "description",
      label: "Category Description",
      type: "textarea",
      rows: 3,
      colSpan: 4,
      placeholder: "Describe this category...",
      section: "Description",
    },
  ] as FormField[],
};
