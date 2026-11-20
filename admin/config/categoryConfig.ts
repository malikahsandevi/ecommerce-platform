import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";

export interface Category {
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: string | { _id?: string; name?: string } | null;
  isActive?: boolean;
  /** Derived from isActive by the list adapter. */
  status?: string;
  sortOrder?: number;
  createdAt?: string;
}

const parentId = (category: Category): string => {
  if (!category.parent) return "";
  return typeof category.parent === "string"
    ? category.parent
    : category.parent._id || "";
};

export const categoryConfig = {
  routeTitle: "Categories",

  // Tabs filter on the derived status (from isActive).
  tabs: ["All Categories", "Active", "Inactive"],

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
  searchFields: ["name", "slug", "description"],

  // Table Column Labels
  columnHeaders: {
    _id: "ID",
    name: "Category Name",
    slug: "Slug",
    sortOrder: "Sort Order",
    status: "Status",
  },

  // Map Data for CreateTable Component
  mapTableData: (category: Category) => ({
    id: category._id,
    _id: category._id,
    name: category.name,
    image: category.image || "",
    slug: category.slug,
    sortOrder: category.sortOrder ?? 0,
    status: category.status || (category.isActive === false ? "inactive" : "active"),
  }),

  // Map Data for DetailPanel Component
  mapDetailData: (category: Category) => ({
    id: category._id,
    title: category.name,
    status: category.status || (category.isActive === false ? "inactive" : "active"),
    image: category.image,
    shortDescription: category.description || `Slug: ${category.slug}`,
    attributes: {
      Slug: category.slug,
      "Sort Order": category.sortOrder ?? 0,
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

  // Table Filters
  filters: [],

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
