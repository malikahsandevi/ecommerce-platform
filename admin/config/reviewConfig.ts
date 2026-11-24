import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";

export interface ProductReview {
  code?: string;
  _id?: string;
  id?: number;
  product?: string | {
    _id?: string;
    name?: string;
    image?: string;
    images?: { url?: string; isMain?: boolean; isPrimary?: boolean }[];
  };
  user?: string | { _id?: string; firstName?: string; lastName?: string; username?: string; email?: string; avatar?: string };
  productId?: string;
  productName?: string;
  customerName?: string;
  customerEmail?: string;
  rating: number; // 1 to 5
  title: string;
  content?: string;
  comment?: string;
  status: "approved" | "pending" | "rejected" | string;
  createdAt?: string;
}

type ReviewReference = ProductReview["product"] | ProductReview["user"];

const referenceId = (reference: ReviewReference): string =>
  typeof reference === "string" ? reference : reference?._id || "";

const referenceLabel = (reference: ReviewReference): string => {
  if (!reference || typeof reference === "string") return "";
  if ("name" in reference && reference.name) return reference.name;
  return ["firstName" in reference ? reference.firstName : "", "lastName" in reference ? reference.lastName : ""]
    .filter(Boolean)
    .join(" ") || ("username" in reference ? reference.username : "") || ("email" in reference ? reference.email : "") || "";
};

// The reviewed product's main image (gallery main → first gallery
// entry → the `image` mirror), for the list's Product cell thumbnail.
// Empty when the product genuinely has no image — the cell then keeps
// its initial-letter tile.
const productImage = (review: ProductReview): string => {
  const product = review.product;
  if (!product || typeof product === "string") return "";
  return (
    product.images?.find((img) => img.isMain ?? img.isPrimary)?.url ||
    product.images?.[0]?.url ||
    product.image ||
    ""
  );
};

// The reviewer's uploaded profile photo, when the account has one —
// the stored placeholder value ("default-avatar.png") is not a photo.
const userAvatar = (review: ProductReview): string | undefined =>
  review.user &&
  typeof review.user !== "string" &&
  review.user.avatar &&
  review.user.avatar !== "default-avatar.png"
    ? review.user.avatar
    : undefined;

export const reviewConfig = {
  routeTitle: "Reviews",

  // Static header-strip label (the old first tab's wording). Display
  // only — status filtering lives in the FilterBar dropdown.
  allLabel: "All Reviews",

  // Action Buttons
  buttons: [
    {
      id: "export",
      label: "Export Reviews",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Add Review",
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
  // product/user are populated references — the list search flattens
  // them, so product and customer names are searchable too (the
  // productName/customerName fallbacks cover unpopulated rows).
  searchFields: ["title", "content", "code", "product", "user", "productName", "customerName"],

  // Table Column Labels
  columnHeaders: {
    _id: "ID",
    productName: "Product",
    customerName: "Customer",
    rating: "Rating",
    content: "Review",
    status: "Status",
  },

  // The list only SHOWS a preview of the review body (Ahsan: "review
  // ki lenght ko truncate ky sth kam karo, yha sirf show krna hai"):
  // the Review cell renders at most 60 characters + "…". The full
  // feedback stays in the data, on the cell's title tooltip, and in
  // the details panel / edit form.
  columnMaxChars: {
    content: 60,
  },

  // Map Data for CreateTable Component
  mapTableData: (review: ProductReview) => ({
    id: review._id || String(review.id),
    _id: review._id || String(review.id),
    code: review.code,
    productName: referenceLabel(review.product) || review.productName || "",
    productImage: productImage(review),
    customerName: referenceLabel(review.user) || review.customerName || "",
    userImage: userAvatar(review),
    rating: `${review.rating} ★`,
    content: review.content || review.comment || "",
    status: review.status,
  }),

  // Map Data for DetailPanel Component
  mapDetailData: (review: ProductReview) => ({
    id: review._id || String(review.id),
    code: review.code,
    title: review.title || `${review.rating} Star Review`,
    // The reviewer as the panel's round avatar: their photo when the
    // account has one uploaded, the reviewer's initials otherwise —
    // the header always carries the disc.
    imageVariant: "avatar" as const,
    avatarName:
      referenceLabel(review.user) || review.customerName || "Unknown customer",
    ...(userAvatar(review) ? { image: userAvatar(review) } : {}),
    status: review.status,
    shortDescription: `By ${referenceLabel(review.user) || review.customerName || "Unknown customer"}`,
    attributes: {
      Product: referenceLabel(review.product) || review.productName || "Unknown product",
      Rating: `${review.rating} / 5 Stars`,
      "Submitted Date": review.createdAt ? new Date(review.createdAt).toLocaleDateString() : "N/A",
    },
    description: review.content || review.comment || "",
  }),

  // Map Data for FormModal (Add/Edit Mode)
  mapFormData: (review?: ProductReview) => {
    if (!review) {
      return {
        product: "",
        user: "",
        rating: 5,
        status: "pending",
        title: "",
        content: "",
      };
    }

    return {
      _id: review._id,
      id: review.id,
      product: referenceId(review.product),
      user: referenceId(review.user),
      rating: review.rating || 5,
      status: review.status || "pending",
      title: review.title || "",
      content: review.content || review.comment || "",
    };
  },

  // Table Filters — moderation status + star rating.
  filters: [
    {
      id: "status",
      placeholder: "All Statuses",
      options: [
        { label: "All Statuses", value: "all" },
        { label: "Approved", value: "approved" },
        { label: "Pending Approval", value: "pending" },
        { label: "Rejected", value: "rejected" },
      ],
    },
    {
      id: "rating",
      placeholder: "Filter Rating",
      options: [
        { label: "All Ratings", value: "all" },
        { label: "5 Stars", value: "5" },
        { label: "4 Stars", value: "4" },
        { label: "3 Stars", value: "3" },
        { label: "2 Stars", value: "2" },
        { label: "1 Star", value: "1" },
      ],
    },
  ],

  statusOptions: [
    { label: "Approved", value: "approved" },
    { label: "Pending Approval", value: "pending" },
    { label: "Rejected", value: "rejected" },
  ] as SelectOption[],

  // Dynamic FormModal Schema Definition
  formFields: [
    // Section 1: Customer & Product
    {
      name: "product",
      label: "Product",
      type: "select",
      required: true,
      colSpan: 2,
      placeholder: "Select a product",
      section: "Review Overview",
      // A review's product/customer pairing never changes after creation:
      // shown read-only on edit, a normal select on create.
      disableOnEdit: true,
    },
    {
      name: "user",
      label: "Customer",
      type: "select",
      required: true,
      colSpan: 2,
      placeholder: "Select a customer",
      section: "Review Overview",
      disableOnEdit: true,
    },
    {
      name: "rating",
      label: "Star Rating",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "5 Stars (Excellent)", value: "5" },
        { label: "4 Stars (Very Good)", value: "4" },
        { label: "3 Stars (Average)", value: "3" },
        { label: "2 Stars (Poor)", value: "2" },
        { label: "1 Star (Terrible)", value: "1" },
      ],
      section: "Review Overview",
    },
    {
      name: "status",
      label: "Moderation Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "Approved", value: "approved" },
        { label: "Pending Approval", value: "pending" },
        { label: "Rejected", value: "rejected" },
      ],
      section: "Review Overview",
    },
    {
      name: "title",
      label: "Review Headline / Title",
      type: "text",
      required: true,
      colSpan: 4,
      placeholder: "e.g. Outstanding battery life and great build quality!",
      section: "Review Feedback",
    },
    {
      name: "content",
      label: "Customer Feedback & Comments",
      type: "textarea",
      required: true,
      rows: 4,
      colSpan: 4,
      placeholder: "Write the full customer review...",
      section: "Review Feedback",
    },
  ] as FormField[],
};