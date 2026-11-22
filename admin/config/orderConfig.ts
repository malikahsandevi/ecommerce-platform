import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";
import { formatMoney } from "@/services/currency";

export interface OrderUser {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface OrderLineItem {
  product?: string;
  name?: string;
  sku?: string;
  price?: number;
  quantity?: number;
  image?: string;
}

export interface OrderAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface Order {
  code?: string;
  _id?: string;
  orderNumber?: string;
  user?: OrderUser | string;
  items?: OrderLineItem[];
  subtotal?: number;
  tax?: number;
  shippingCost?: number;
  discount?: number;
  total?: number;
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  shippingCarrier?: string;
  trackingNumber?: string;
  createdAt?: string;
}

const customerName = (order: Order): string => {
  if (!order.user || typeof order.user === "string") return "—";
  const name = [order.user.firstName, order.user.lastName].filter(Boolean).join(" ");
  return name || order.user.email || "—";
};

const customerEmail = (order: Order): string =>
  order.user && typeof order.user !== "string" ? order.user.email || "" : "";

const userId = (order: Order): string =>
  typeof order.user === "string" ? order.user : order.user?._id || "";

const addressText = (address?: OrderAddress): string =>
  [address?.street, address?.city, address?.state, address?.zipCode, address?.country]
    .filter(Boolean)
    .join(", ") || "—";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
];

const PAYMENT_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
];

const PAYMENT_METHOD_OPTIONS = [
  { label: "Cash on Delivery", value: "cod" },
  { label: "Credit / Debit Card", value: "card" },
  { label: "Bank Transfer", value: "bank_transfer" },
  { label: "JazzCash / EasyPaisa", value: "wallet" },
];

export const orderConfig = {
  routeTitle: "Orders",

  // Tabs mirror the Order.status enum in the API.
  tabs: [
    "All Orders",
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled",
    "Refunded",
  ],

  // Action Buttons Controls
  buttons: [
    {
      id: "export",
      label: "Export Orders",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Create Order",
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

  // Search Fields (top-level scalar fields of the API records)
  searchFields: ["orderNumber", "status", "paymentStatus", "trackingNumber", "code"],

  // Table Headers
  // Alignment overrides: the Customer column holds the customer's
  // name, so it follows the name-column rule (left) even though its
  // key does not end in "name".
  columnAlign: {
    customer: "left",
  },

  columnHeaders: {
    orderNumber: "Order #",
    customer: "Customer",
    totalAmount: "Total",
    paymentStatus: "Payment",
    carrier: "Carrier",
    status: "Status",
  },

  // Map Data for CreateTable Component
  mapTableData: (order: Order) => ({
    id: order._id,
    _id: order._id,
    code: order.code,
    orderNumber: order.orderNumber || "—",
    customer: customerName(order),
    totalAmount: formatMoney(order.total ?? 0, 2),
    paymentStatus: (order.paymentStatus || "pending").toUpperCase(),
    carrier: order.shippingCarrier || "—",
    status: order.status || "pending",
  }),

  // Map Data for DetailPanel Component
  mapDetailData: (order: Order) => ({
    id: order._id,
    code: order.code,
    title: `Order ${order.orderNumber || ""}`.trim(),
    status: order.status,
    shortDescription: `Customer: ${customerName(order)}${customerEmail(order) ? ` (${customerEmail(order)})` : ""}`,
    attributes: {
      Items: (order.items || [])
        .map((item) => `${item.name || "Product"} × ${item.quantity || 1}`)
        .join(", ") || "—",
      Subtotal: formatMoney(order.subtotal ?? 0, 2),
      Tax: formatMoney(order.tax ?? 0, 2),
      "Shipping Cost": formatMoney(order.shippingCost ?? 0, 2),
      Discount: formatMoney(order.discount ?? 0, 2),
      Total: formatMoney(order.total ?? 0, 2),
      "Payment Method": (order.paymentMethod || "—").toUpperCase(),
      "Payment Status": (order.paymentStatus || "—").toUpperCase(),
      Carrier: order.shippingCarrier || "—",
      "Tracking Number": order.trackingNumber || "—",
      "Shipping Address": addressText(order.shippingAddress),
      "Order Date": order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—",
    },
  }),

  // Map Data for FormModal (Add/Edit Mode)
  mapFormData: (order?: Order) => {
    if (!order) {
      return {
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        user: "",
        product: "",
        quantity: 1,
        status: "pending",
        paymentMethod: "cod",
        paymentStatus: "pending",
        shippingCarrier: "",
        trackingNumber: "",
        shippingStreet: "",
        shippingCity: "",
        shippingState: "",
        shippingZip: "",
        shippingCountry: "Pakistan",
      };
    }

    const firstItem = order.items?.[0];
    return {
      _id: order._id,
      orderNumber: order.orderNumber || "",
      user: userId(order),
      product: typeof firstItem?.product === "string" ? firstItem.product : "",
      quantity: firstItem?.quantity || 1,
      status: order.status || "pending",
      paymentMethod: order.paymentMethod || "cod",
      paymentStatus: order.paymentStatus || "pending",
      shippingCarrier: order.shippingCarrier || "",
      trackingNumber: order.trackingNumber || "",
      shippingStreet: order.shippingAddress?.street || "",
      shippingCity: order.shippingAddress?.city || "",
      shippingState: order.shippingAddress?.state || "",
      shippingZip: order.shippingAddress?.zipCode || "",
      shippingCountry: order.shippingAddress?.country || "Pakistan",
    };
  },

  // Table Filters
  filters: [
    {
      id: "paymentStatus",
      placeholder: "Payment Status",
      options: [
        { label: "All Payments", value: "all" },
        { label: "Pending", value: "pending" },
        { label: "Paid", value: "paid" },
        { label: "Failed", value: "failed" },
        { label: "Refunded", value: "refunded" },
      ],
    },
  ],

  statusOptions: STATUS_OPTIONS as SelectOption[],

  // Dynamic FormModal Schema Definition
  formFields: [
    // Section 1: Order
    {
      name: "orderNumber",
      label: "Order Number",
      type: "text",
      required: true,
      colSpan: 1,
      placeholder: "e.g. ORD-1001",
      section: "Order",
    },
    {
      name: "status",
      label: "Order Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: STATUS_OPTIONS,
      section: "Order",
    },
    {
      name: "user",
      label: "Customer",
      type: "select",
      required: true,
      colSpan: 2,
      placeholder: "Select a customer",
      section: "Order",
    },

    // Section 2: Item (single line item for manual orders)
    {
      name: "product",
      label: "Product",
      type: "select",
      colSpan: 2,
      placeholder: "Select a product",
      helperText: "Used when creating a new order. The price is taken from the product.",
      section: "Item",
    },
    {
      name: "quantity",
      label: "Quantity",
      type: "number",
      min: 1,
      colSpan: 1,
      section: "Item",
    },

    // Section 3: Payment
    {
      name: "paymentMethod",
      label: "Payment Method",
      type: "select",
      required: true,
      colSpan: 1,
      options: PAYMENT_METHOD_OPTIONS,
      section: "Payment",
    },
    {
      name: "paymentStatus",
      label: "Payment Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: PAYMENT_STATUS_OPTIONS,
      section: "Payment",
    },

    // Section 4: Fulfilment
    {
      name: "shippingCarrier",
      label: "Courier / Carrier",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. TCS",
      section: "Fulfilment",
    },
    {
      name: "trackingNumber",
      label: "Tracking Number",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. TRK-98765432",
      section: "Fulfilment",
    },

    // Section 5: Shipping Address
    {
      name: "shippingStreet",
      label: "Street Address",
      type: "text",
      colSpan: 2,
      placeholder: "e.g. House 45, Street 10",
      section: "Shipping Address",
    },
    {
      name: "shippingCity",
      label: "City",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. Rahim Yar Khan",
      section: "Shipping Address",
    },
    {
      name: "shippingState",
      label: "State / Province",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. Punjab",
      section: "Shipping Address",
    },
    {
      name: "shippingZip",
      label: "Postal / Zip Code",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. 64200",
      section: "Shipping Address",
    },
    {
      name: "shippingCountry",
      label: "Country",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. Pakistan",
      section: "Shipping Address",
    },
  ] as FormField[],
};
