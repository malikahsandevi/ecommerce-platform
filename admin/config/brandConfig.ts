import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";

export interface Brand {
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  isActive?: boolean;
  /** Derived from isActive by the list adapter. */
  status?: string;
  /** Real usage count attached by GET /brands. */
  productsCount?: number;
  createdAt?: string;
}

export const brandConfig = {
  routeTitle: "Brands",

  tabs: ["All Brands", "Active", "Inactive"],

  buttons: [
    {
      id: "export",
      label: "Export Brands",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Add Brand",
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

  searchFields: ["name", "slug", "website"],

  columnHeaders: {
    _id: "ID",
    name: "Brand Name",
    slug: "Slug",
    website: "Website",
    productsCount: "Products",
    status: "Status",
  },

  mapTableData: (brand: Brand) => ({
    id: brand._id,
    _id: brand._id,
    name: brand.name,
    image: brand.logo || "",
    slug: brand.slug,
    website: brand.website || "—",
    // Real count attached by the API (products actually using this brand).
    productsCount: brand.productsCount ?? 0,
    status: brand.status || (brand.isActive === false ? "inactive" : "active"),
  }),

  mapDetailData: (brand: Brand) => ({
    id: brand._id,
    title: brand.name,
    status: brand.status || (brand.isActive === false ? "inactive" : "active"),
    image: brand.logo,
    shortDescription: brand.description || `Website: ${brand.website || "—"}`,
    attributes: {
      Slug: brand.slug,
      Website: brand.website || "—",
      Products: brand.productsCount ?? 0,
      "Created Date": brand.createdAt
        ? new Date(brand.createdAt).toLocaleDateString()
        : "—",
    },
    description: brand.description || "",
  }),

  mapFormData: (brand?: Brand) => {
    if (!brand) {
      return {
        name: "",
        slug: "",
        website: "",
        logo: "",
        status: "active",
        description: "",
      };
    }

    return {
      _id: brand._id,
      name: brand.name || "",
      slug: brand.slug || "",
      website: brand.website || "",
      logo: brand.logo || "",
      status: brand.isActive === false ? "inactive" : "active",
      description: brand.description || "",
    };
  },

  filters: [],

  statusOptions: [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ] as SelectOption[],

  formFields: [
    // Section 1: Brand Details
    {
      name: "name",
      label: "Brand Name",
      type: "text",
      required: true,
      colSpan: 2,
      placeholder: "e.g. AudioTech",
      section: "Brand Details",
    },
    {
      name: "slug",
      label: "Brand Slug (URL Key)",
      type: "text",
      colSpan: 2,
      placeholder: "e.g. audiotech",
      helperText: "Leave blank to auto-generate from the brand name.",
      section: "Brand Details",
    },
    {
      name: "website",
      label: "Official Website URL",
      type: "text",
      colSpan: 2,
      placeholder: "https://...",
      section: "Brand Details",
    },
    {
      name: "status",
      label: "Brand Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
      section: "Brand Details",
    },

    // Section 2: Visual Assets
    {
      name: "logo",
      label: "Brand Logo URL",
      type: "image",
      colSpan: 2,
      placeholder: "https://...",
      section: "Visual Assets",
    },

    // Section 3: Description
    {
      name: "description",
      label: "Brand Description",
      type: "textarea",
      rows: 3,
      colSpan: 4,
      placeholder: "Describe this brand...",
      section: "Description",
    },
  ] as FormField[],
};
