import { SelectOption, FormField } from "@/components/models/FormModal";
import { Download, Plus, RefreshCcwDot } from "lucide-react";

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

/** Shape of a record from GET /users (plus the derived `status` the list adapter adds). */
export interface Customer {
  code?: string;
  _id: string;
  username?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  role?: string;
  isActive?: boolean;
  isVerified?: boolean;
  status?: string;
  addresses?: CustomerAddress[];
  createdAt?: string;
  /** Stored shopping-profile category ids (max 3, backend-enforced). */
  favoriteCategories?: string[];
}

const ROLE_OPTIONS = [
  { label: "Customer", value: "Customer" },
  { label: "Support", value: "Support" },
  { label: "Editor", value: "Editor" },
  { label: "Manager", value: "Manager" },
  { label: "Admin", value: "Admin" },
  { label: "Super Admin", value: "Super Admin" },
];

const fullName = (customer: Customer): string =>
  [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
  customer.username ||
  customer.email;

export const customerConfig = {
  routeTitle: "Customers",

  // Account state comes from User.isActive (derived to `status` on fetch).
  tabs: ["All Customers", "Active", "Inactive"],

  // Header Buttons Control
  buttons: [
    {
      id: "export",
      label: "Export Customers",
      icon: Download,
      variant: "secondary" as const,
      show: true,
      disabled: false,
    },
    {
      id: "new-item",
      label: "Add Customer",
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

  searchFields: ["firstName", "lastName", "email", "username", "phone", "code"],

  columnHeaders: {
    _id: "ID",
    name: "Customer",
    email: "Email",
    phone: "Phone",
    role: "Role",
    status: "Status",
  },

  mapTableData: (customer: Customer) => ({
    id: customer._id,
    _id: customer._id,
    code: customer.code,
    // The table's name cell renders `image` as the row thumbnail —
    // without it the cell always fell back to the initial letter even
    // when the customer had an avatar saved.
    image:
      customer.avatar && customer.avatar !== "default-avatar.png"
        ? customer.avatar
        : undefined,
    name: fullName(customer),
    email: customer.email || "",
    phone: customer.phone || "—",
    role: customer.role || "Customer",
    status: customer.status || (customer.isActive === false ? "inactive" : "active"),
  }),

  mapDetailData: (customer: Customer) => {
    const address = customer.addresses?.[0];
    const addressText = address
      ? [address.street, address.city, address.state, address.zipCode, address.country]
          .filter(Boolean)
          .join(", ")
      : "";
    return {
      id: customer._id,
    code: customer.code,
      title: fullName(customer),
      status: customer.status || (customer.isActive === false ? "inactive" : "active"),
      image:
        customer.avatar && customer.avatar !== "default-avatar.png"
          ? customer.avatar
          : undefined,
      // A customer's image is an avatar: the details panel shows it as a
      // small round thumbnail beside the name, not the big product-style
      // banner block.
      imageVariant: "avatar" as const,
      shortDescription: customer.email,
      attributes: {
        Username: customer.username || "—",
        Email: customer.email,
        Phone: customer.phone || "—",
        Role: customer.role || "Customer",
        "Email Verified": customer.isVerified ? "Yes" : "No",
        Address: addressText || "—",
        Joined: customer.createdAt
          ? new Date(customer.createdAt).toLocaleDateString()
          : "—",
      },
    };
  },

  // Form Modal Mapper for Customer fields
  mapFormData: (customer?: Customer) => {
    if (!customer) {
      return {
        firstName: "",
        lastName: "",
        username: "",
        email: "",
        phone: "",
        avatar: "",
        password: "",
        role: "Customer",
        status: "active",
        isEmailVerified: false,
        favoriteCategories: [] as string[],
      };
    }

    return {
      _id: customer._id,
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      username: customer.username || "",
      email: customer.email || "",
      phone: customer.phone || "",
      avatar:
        customer.avatar && customer.avatar !== "default-avatar.png"
          ? customer.avatar
          : "",
      password: "",
      role: customer.role || "Customer",
      status: customer.isActive === false ? "inactive" : "active",
      isEmailVerified: customer.isVerified || false,
      favoriteCategories: (customer.favoriteCategories || []).map(String),
    };
  },

  filters: [
    {
      id: "role",
      placeholder: "All Roles",
      options: [
        { label: "All Roles", value: "all" },
        ...ROLE_OPTIONS.map((role) => ({ label: role.label, value: role.value })),
      ],
    },
  ],

  statusOptions: [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ] as SelectOption[],

  // Dynamic FormModal Schema Definition
  formFields: [
    // Section 1: Personal Information
    {
      name: "firstName",
      label: "First Name",
      type: "text",
      required: true,
      colSpan: 1,
      placeholder: "e.g. Ali",
      section: "Personal Information",
    },
    {
      name: "lastName",
      label: "Last Name",
      type: "text",
      required: true,
      colSpan: 1,
      placeholder: "e.g. Raza",
      section: "Personal Information",
    },
    {
      name: "username",
      label: "Username",
      type: "text",
      required: true,
      colSpan: 1,
      placeholder: "e.g. aliraza",
      section: "Personal Information",
    },
    {
      name: "email",
      label: "Email Address",
      type: "text",
      required: true,
      colSpan: 1,
      placeholder: "e.g. ali@example.com",
      section: "Personal Information",
    },
    {
      name: "phone",
      label: "Phone Number",
      type: "text",
      colSpan: 1,
      placeholder: "e.g. +92 300 1234567",
      section: "Personal Information",
    },
    {
      name: "avatar",
      label: "Avatar Image URL",
      type: "image",
      colSpan: 2,
      placeholder: "https://...",
      section: "Personal Information",
      // Profile images are always saved exactly 1:1 — choosing one
      // (Upload or Select) goes through the cropper first.
      cropToSquare: true,
      uploadPurpose: "profiles",
    },

    // Section 2: Account & Role Settings
    {
      name: "password",
      label: "Password",
      type: "text",
      colSpan: 1,
      placeholder: "Set a password",
      helperText: "Required for new accounts (min. 6 characters). Leave blank when editing to keep the current password.",
      section: "Account & Permissions",
    },
    {
      name: "role",
      label: "User Role",
      type: "select",
      required: true,
      colSpan: 1,
      options: ROLE_OPTIONS,
      section: "Account & Permissions",
    },
    {
      name: "status",
      label: "Account Status",
      type: "select",
      required: true,
      colSpan: 1,
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
      section: "Account & Permissions",
    },
    {
      name: "isEmailVerified",
      label: "Email Verified",
      type: "switch",
      colSpan: 1,
      section: "Account & Permissions",
    },

    // Section 3: Shopping Profile — favorite categories (max 3) plus
    // the customer's stored favorites / liked / cart, read-only.
    {
      name: "favoriteCategories",
      label: "Shopping Profile",
      type: "shopping-profile",
      colSpan: 4,
      section: "Shopping Profile",
    },
  ] as FormField[],
};
