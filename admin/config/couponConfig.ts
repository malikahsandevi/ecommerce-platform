import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";
import { formatMoney, getCurrencySymbol } from "@/services/currency";

export interface Coupon {
  _id?: string;
  id: number;
  /** Generated 6-char public ID — distinct from `code`, the redeem code. */
  publicId?: string;
  code: string;
  type: "percentage" | "fixed_amount" | "free_shipping" | string;
  value: number | string;
  discountType?: "percentage" | "fixed" | string;
  discountValue?: number | string;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  validFrom?: string;
  validUntil?: string;
  isActive?: boolean;
  status: "active" | "expired" | "disabled" | string;
  description?: string;
  createdAt?: string;
}

const getDiscountType = (coupon: Coupon) =>
  coupon.discountType || (coupon.type === "fixed_amount" ? "fixed" : coupon.type);

const getDiscountValue = (coupon: Coupon): number => {
  const value = coupon.discountValue ?? coupon.value ?? 0;
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getCouponStatus = (coupon: Coupon) => {
  if (coupon.status) return coupon.status;
  if (coupon.isActive === false) return "disabled";
  return coupon.validUntil && new Date(coupon.validUntil) < new Date() ? "expired" : "active";
};

export const couponConfig = {
  routeTitle: "Coupons",

  // Static header-strip label (the old first tab's wording). Display
  // only — status filtering lives in the FilterBar dropdown.
  allLabel: "All Coupons",

  // Action Buttons
  buttons: [
    {
      id: "export",
      label: "Export Coupons",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Add Coupon",
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
  searchFields: ["code", "publicId", "discountType", "description"],

  // Table Column Labels
  columnHeaders: {
    _id: "ID",
    code: "Code",
    type: "Type",
    value: "Value",
    usage: "Usage",
    status: "Status",
  },

  // Map Data for CreateTable Component
  mapTableData: (coupon: Coupon) => ({
    id: coupon._id || String(coupon.id),
    _id: coupon._id,
    publicId: coupon.publicId,
    code: coupon.code,
    type: getDiscountType(coupon) === "percentage" ? "Percentage (%)" : `Fixed Amount (${getCurrencySymbol()})`,
    value: getDiscountType(coupon) === "percentage"
      ? `${getDiscountValue(coupon)}%`
      : formatMoney(getDiscountValue(coupon), 2),
    usage: `${coupon.usedCount} / ${coupon.usageLimit || "∞"}`,
    status: getCouponStatus(coupon),
  }),

  // Map Data for DetailPanel Component
  mapDetailData: (coupon: Coupon) => ({
    id: coupon._id || String(coupon.id),
    publicId: coupon.publicId,
    title: `Code: ${coupon.code}`,
    status: getCouponStatus(coupon),
    shortDescription: coupon.description || `Discount: ${getDiscountType(coupon) === "percentage" ? `${getDiscountValue(coupon)}%` : formatMoney(getDiscountValue(coupon), 2)}`,
    attributes: {
      "Coupon Code": coupon.code,
      "Discount Type": getDiscountType(coupon)?.toUpperCase() || "N/A",
      "Discount Value": getDiscountType(coupon) === "percentage" ? `${getDiscountValue(coupon)}%` : formatMoney(getDiscountValue(coupon), 2),
      "Min Purchase": coupon.minPurchaseAmount ? formatMoney(coupon.minPurchaseAmount, 2) : "None",
      "Max Discount": coupon.maxDiscountAmount ? formatMoney(coupon.maxDiscountAmount, 2) : "N/A",
      "Usage Limit": coupon.usageLimit ? `${coupon.usedCount} / ${coupon.usageLimit}` : `${coupon.usedCount} (No Limit)`,
      "Start Date": (coupon.validFrom || coupon.startDate) ? new Date(coupon.validFrom || coupon.startDate).toLocaleDateString() : "N/A",
      "End Date": (coupon.validUntil || coupon.endDate) ? new Date(coupon.validUntil || coupon.endDate).toLocaleDateString() : "N/A",
    },
    description: coupon.description || "",
  }),

  // Map Data for FormModal (Add/Edit Mode)
  mapFormData: (coupon?: Coupon) => {
    if (!coupon) {
      return {
        code: "",
        discountType: "percentage",
        discountValue: 10,
        minPurchaseAmount: 0,
        maxDiscountAmount: 0,
        usageLimit: 100,
        validFrom: new Date().toISOString().split("T")[0],
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        isActive: true,
        description: "",
      };
    }

    return {
      _id: coupon._id,
      id: coupon.id,
      code: coupon.code || "",
      discountType: coupon.discountType || (coupon.type === "fixed_amount" ? "fixed" : coupon.type) || "percentage",
      discountValue: coupon.discountValue ?? coupon.value ?? 0,
      minPurchaseAmount: coupon.minPurchaseAmount || 0,
      maxDiscountAmount: coupon.maxDiscountAmount || 0,
      usageLimit: coupon.usageLimit || 0,
      validFrom: coupon.validFrom || coupon.startDate || "",
      validUntil: coupon.validUntil || coupon.endDate || "",
      isActive: coupon.isActive ?? coupon.status !== "disabled",
      description: coupon.description || "",
    };
  },

  // Table Filters — derived status (active/expired/disabled) + discount type.
  filters: [
    {
      id: "status",
      placeholder: "All Statuses",
      options: [
        { label: "All Statuses", value: "all" },
        { label: "Active", value: "active" },
        { label: "Expired", value: "expired" },
        { label: "Disabled", value: "disabled" },
      ],
    },
    {
      id: "discountType",
      placeholder: "Discount Type",
      options: [
        { label: "All Types", value: "all" },
        { label: "Percentage", value: "percentage" },
        { label: "Fixed Amount", value: "fixed" },
      ],
    },
  ],

  // FormModal Dropdown Options
  categoryOptions: [
    { label: "Percentage (%)", value: "percentage" },
    { label: "Fixed Amount ($)", value: "fixed" },
  ] as SelectOption[],

  brandOptions: [
    { label: "Unlimited Usage", value: "unlimited" },
    { label: "Limited Usage", value: "limited" },
  ] as SelectOption[],

  statusOptions: [
    { label: "Active", value: "active" },
    { label: "Expired", value: "expired" },
    { label: "Disabled", value: "disabled" },
  ] as SelectOption[],

  // Dynamic FormModal Schema Definition
  formFields: [
    // Section 1: Coupon Basics
    {
      name: "code",
      label: "Coupon Code",
      type: "text",
      required: true,
      colSpan: 2,
      placeholder: "e.g. SUMMER2026",
      section: "Coupon Details",
    },
    {
      name: "discountType",
      label: "Discount Type",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "Percentage (%)", value: "percentage" },
        { label: "Fixed Amount ($)", value: "fixed" },
      ],
      section: "Coupon Details",
    },
    {
      name: "discountValue",
      label: "Discount Value (% or $)",
      type: "number",
      required: true,
      min: 0,
      colSpan: 1,
      section: "Coupon Details",
    },
    {
      name: "isActive",
      label: "Coupon Active",
      type: "switch",
      colSpan: 2,
      section: "Coupon Details",
    },

    // Section 2: Limits & Conditions
    {
      name: "minPurchaseAmount",
      label: "Minimum Spend ($)",
      type: "number",
      min: 0,
      colSpan: 1,
      section: "Discount Rules & Limits",
    },
    {
      name: "maxDiscountAmount",
      label: "Max Discount Ceiling ($)",
      type: "number",
      min: 0,
      colSpan: 1,
      section: "Discount Rules & Limits",
    },
    {
      name: "usageLimit",
      label: "Total Usage Limit",
      type: "number",
      min: 0,
      colSpan: 1,
      helperText: "Leave at 0 for unlimited use.",
      section: "Discount Rules & Limits",
    },

    // Section 3: Dates & Description
    {
      name: "validFrom",
      label: "Valid From (Start Date)",
      type: "date",
      required: true,
      colSpan: 2,
      section: "Validity Schedule",
    },
    {
      name: "validUntil",
      label: "Valid Until (End Date)",
      type: "date",
      required: true,
      colSpan: 2,
      section: "Validity Schedule",
    },
    {
      name: "description",
      label: "Campaign Description",
      type: "textarea",
      rows: 2,
      colSpan: 4,
      placeholder: "e.g. 15% discount for summer promotional sale...",
      section: "Validity Schedule",
    },
  ] as FormField[],
};