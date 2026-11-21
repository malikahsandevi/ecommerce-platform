"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Copy, Eye, EyeOff, Plus, ShieldCheck, Trash2, Code2, Globe } from "lucide-react";
import Button from "@/components/ui/Button";
import MediaPickerModal from "@/components/models/MediaPickerModal";
import { apiClient, extractApiError } from "@/services/api";
import {
  CURRENCY_OPTIONS,
  applyStoreCurrency,
  currencySymbolFor,
} from "@/services/currency";
import { getTimeZoneOptions, resolveTimeZoneValue } from "@/services/timeZones";
import { settingsService } from "@/services/settingsService";
import { toast } from "@/components/ui/Toast";
import { useAdminAuth } from "@/services/authContext";
import type {
  PermissionMatrixData,
  RolePermissionsData,
} from "@/services/settingsService";
import {
  SettingsCard,
  SettingsInput,
  SettingsSaveButton,
  SettingsSectionTitle,
  SettingsSelect,
  SettingsToggle,
} from "./SettingsControls";
import type {
  SettingsDocument,
  SettingsSection,
  SettingsUser,
} from "@/services/settingsService";

type ObjectData = Record<string, unknown>;

/** True when a value is a src next/image can render (absolute URL or
 *  root-relative path) — used to guard live previews of URL fields. */
const isPreviewableImageSrc = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
};
type SectionPanelProps<T> = {
  data?: T;
  saving: boolean;
  onSave: (value: T) => void;
};

type PaymentMethod = { name: string; description: string; enabled: boolean };
type ShippingZone = {
  name: string;
  regions: string[];
  rate: number;
  isActive: boolean;
};
type Webhook = { event: string; url: string; isActive: boolean };

// Dynamic Zero-Selection Integration Types
type AuthType = "API_KEY" | "BEARER_TOKEN" | "BASIC" | "CUSTOM_HEADER" | "NONE";
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface DynamicEndpoint {
  name: string;
  path: string;
  method: HttpMethod;
  defaultHeaders?: Record<string, string>;
  responseMapping?: {
    successField?: string;
    dataField?: string;
    errorField?: string;
  };
}

interface DynamicIntegration {
  usageType: string;
  serviceSlug: string;
  title: string;
  baseUrl: string;
  authType: AuthType;
  authCredentials: {
    apiKey?: string;
    headerKey?: string;
    username?: string;
    password?: string;
  };
  globalHeaders?: Record<string, string>;
  endpoints: DynamicEndpoint[];
  webhooks?: Webhook[];
  isConnected: boolean;
}

export type NewUserValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
};

export function SettingsPanel({
  activeMenu,
  settings,
  users,
  saving,
  onSave,
  onDeleteUser,
  onUpdateUser,
  onCreateUser,
}: {
  activeMenu: string;
  settings: SettingsDocument;
  users: SettingsUser[];
  saving: boolean;
  onSave: (section: SettingsSection, value: unknown) => void;
  onDeleteUser: (id: string) => void;
  onUpdateUser: (id: string, values: { role?: string; isActive?: boolean }) => void;
  onCreateUser: (values: NewUserValues) => Promise<void>;
}) {
  switch (activeMenu) {
    case "General":
      return (
        <GeneralPanel
          data={settings.general}
          saving={saving}
          onSave={(value) => onSave("general", value)}
        />
      );
    case "Store Information":
      return (
        <StorePanel
          data={settings.storeInfo}
          saving={saving}
          onSave={(value) => onSave("storeInfo", value)}
        />
      );
    case "Payment Methods":
      return (
        <PaymentPanel
          data={settings.paymentMethods}
          saving={saving}
          onSave={(value) => onSave("paymentMethods", value)}
        />
      );
    case "Shipping":
      return (
        <ShippingPanel
          data={settings.shipping}
          saving={saving}
          onSave={(value) => onSave("shipping", value)}
        />
      );
    case "Notifications":
      return (
        <NotificationsPanel
          data={settings.notifications}
          saving={saving}
          onSave={(value) => onSave("notifications", value)}
        />
      );
    case "Users & Roles":
      return (
        <UsersPanel
          users={users}
          onDeleteUser={onDeleteUser}
          onUpdateUser={onUpdateUser}
          onCreateUser={onCreateUser}
        />
      );
    case "Security":
      return <SecurityPanel />;
    case "API / Integrations":
      return (
        <IntegrationsPanel
          data={settings.integrations}
          saving={saving}
          onSave={(value) => onSave("integrations", value)}
        />
      );
    case "Appearance":
      return (
        <AppearancePanel
          data={settings.appearance}
          saving={saving}
          onSave={(value) => onSave("appearance", value)}
        />
      );
    default:
      return null;
  }
}

/** URL field for an image that lives in the media library (store logo,
 *  favicon): type/paste a URL by hand, or pick an existing image with the
 *  Select button. A small thumbnail of the current value sits next to the
 *  input. The preview is guarded by isPreviewableImageSrc — rendering a
 *  raw partial value in next/image can throw and unmount the panel. */
function MediaUrlField({
  label,
  value,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: () => void;
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">{label}</span>
      <div className="flex items-center gap-2">
        {isPreviewableImageSrc(value) && (
          <Image
            src={value}
            alt={`${label} preview`}
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 shrink-0 rounded-lg border border-[var(--border)] object-contain"
          />
        )}
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
        />
        <Button
          variant="secondary"
          size="md"
          onClick={onSelect}
          className="h-10 shrink-0 text-xs"
        >
          Select
        </Button>
      </div>
    </div>
  );
}

function GeneralPanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const [form, setForm] = useState(() => ({
    storeName: String(data?.storeName ?? ""),
    storeTagline: String(data?.storeTagline ?? ""),
    storeEmail: String(data?.storeEmail ?? ""),
    phone: String(data?.phone ?? ""),
    timeZone: resolveTimeZoneValue(data?.timeZone),
    language: String(data?.language ?? ""),
    currency: data?.currency ? String(data.currency) : "USD",
    logo: String(data?.logo ?? ""),
    favicon: String(data?.favicon ?? ""),
    monthlyTarget: String(data?.monthlyTarget ?? ""),
  }));
  const [pickerTarget, setPickerTarget] = useState<"logo" | "favicon" | null>(null);

  return (
    <SettingsCard title="General Settings" description="Basic information about your store">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SettingsInput
          label="Store Name"
          value={form.storeName}
          onChange={(event) => setForm({ ...form, storeName: event.target.value })}
        />
        <SettingsInput
          label="Store Tagline"
          value={form.storeTagline}
          onChange={(event) => setForm({ ...form, storeTagline: event.target.value })}
        />
        <SettingsInput
          label="Store Email"
          type="email"
          value={form.storeEmail}
          onChange={(event) => setForm({ ...form, storeEmail: event.target.value })}
        />
        <SettingsInput
          label="Phone Number"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
        />
        <SettingsSelect
          label="Time Zone"
          value={form.timeZone}
          options={getTimeZoneOptions()}
          onChange={(timeZone) => setForm({ ...form, timeZone })}
          searchable
          searchPlaceholder="Search time zones..."
        />
        <SettingsSelect
          label="Language"
          value={form.language}
          options={["English", "Urdu"]}
          onChange={(language) => setForm({ ...form, language })}
        />
        <div>
          <SettingsSelect
            label="Store Currency"
            value={form.currency}
            options={CURRENCY_OPTIONS}
            onChange={(currency) => setForm({ ...form, currency })}
            searchable
            searchPlaceholder="Search currencies..."
          />
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Every price and total in the panel is shown in this currency.
            Amounts are never converted — only the symbol changes.
          </p>
        </div>
        <MediaUrlField
          label="Store Logo URL"
          value={form.logo}
          onChange={(logo) => setForm({ ...form, logo })}
          onSelect={() => setPickerTarget("logo")}
        />
        <div>
          <SettingsInput
            label={`Monthly Target (amount ${currencySymbolFor(form.currency)})`}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 5000"
            value={form.monthlyTarget}
            onChange={(event) => setForm({ ...form, monthlyTarget: event.target.value })}
          />
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Revenue goal for the current month — shown as the gauge on the
            dashboard. Leave empty for no target.
          </p>
        </div>
        <MediaUrlField
          label="Favicon URL"
          value={form.favicon}
          onChange={(favicon) => setForm({ ...form, favicon })}
          onSelect={() => setPickerTarget("favicon")}
        />
      </div>
      <SettingsSaveButton
        onSave={() => {
          onSave({
            ...form,
            monthlyTarget:
              form.monthlyTarget.trim() === ""
                ? 0
                : Number(form.monthlyTarget) || 0,
          });
          // Apply the currency right away so every money figure in the
          // panel follows the setting without waiting for a reload.
          applyStoreCurrency(form.currency);
        }}
        saving={saving}
      />
      <MediaPickerModal
        isOpen={pickerTarget !== null}
        single
        existing={[]}
        maxTotal={1}
        onClose={() => setPickerTarget(null)}
        onConfirm={(picked) => {
          const url = picked[0]?.url;
          if (url && pickerTarget) {
            setForm((current) => ({ ...current, [pickerTarget]: url }));
          }
          setPickerTarget(null);
        }}
      />
    </SettingsCard>
  );
}

function StorePanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const currentAddress = (data?.address ?? {}) as ObjectData;
  const [form, setForm] = useState(() => ({
    businessName: String(data?.businessName ?? ""),
    businessType: String(data?.businessType ?? ""),
    taxId: String(data?.taxId ?? ""),
    website: String(data?.website ?? ""),
    address: {
      addressLine1: String(currentAddress.addressLine1 ?? ""),
      addressLine2: String(currentAddress.addressLine2 ?? ""),
      city: String(currentAddress.city ?? ""),
      state: String(currentAddress.state ?? ""),
      postalCode: String(currentAddress.postalCode ?? ""),
      country: String(currentAddress.country ?? ""),
    },
  }));
  const updateAddress = (field: keyof typeof form.address, value: string) =>
    setForm({ ...form, address: { ...form.address, [field]: value } });

  return (
    <SettingsCard title="Store Information" description="Update your business details and address">
      <SettingsSectionTitle title="Business Details" />
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SettingsInput
          label="Business Name"
          value={form.businessName}
          onChange={(event) => setForm({ ...form, businessName: event.target.value })}
        />
        <SettingsSelect
          label="Business Type"
          value={form.businessType}
          options={["Retail Store", "Wholesale", "Marketplace"]}
          onChange={(businessType) => setForm({ ...form, businessType })}
        />
        <SettingsInput
          label="Tax ID / VAT Number"
          value={form.taxId}
          onChange={(event) => setForm({ ...form, taxId: event.target.value })}
        />
        <SettingsInput
          label="Website"
          value={form.website}
          onChange={(event) => setForm({ ...form, website: event.target.value })}
        />
      </div>
      <div className="mt-6 border-t border-[var(--border)] pt-6">
        <SettingsSectionTitle title="Address" />
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SettingsInput
            label="Address Line 1"
            value={form.address.addressLine1}
            onChange={(event) => updateAddress("addressLine1", event.target.value)}
          />
          <SettingsInput
            label="Address Line 2"
            value={form.address.addressLine2}
            onChange={(event) => updateAddress("addressLine2", event.target.value)}
          />
          <SettingsInput
            label="City"
            value={form.address.city}
            onChange={(event) => updateAddress("city", event.target.value)}
          />
          <SettingsInput
            label="State / Province"
            value={form.address.state}
            onChange={(event) => updateAddress("state", event.target.value)}
          />
          <SettingsInput
            label="Postal Code"
            value={form.address.postalCode}
            onChange={(event) => updateAddress("postalCode", event.target.value)}
          />
          <SettingsInput
            label="Country"
            value={form.address.country}
            onChange={(event) => updateAddress("country", event.target.value)}
          />
        </div>
      </div>
      <SettingsSaveButton onSave={() => onSave(form)} saving={saving} />
    </SettingsCard>
  );
}

function PaymentPanel({ data, saving, onSave }: SectionPanelProps<Array<Record<string, unknown>>>) {
  const [validationError, setValidationError] = useState("");
  const [methods, setMethods] = useState<PaymentMethod[]>(() =>
    (data ?? []).map((method) => ({
      name: String(method.name ?? ""),
      description: String(method.description ?? ""),
      enabled: Boolean(method.enabled),
    })),
  );
  const updateMethod = (index: number, patch: Partial<PaymentMethod>) =>
    setMethods(methods.map((method, itemIndex) => (itemIndex === index ? { ...method, ...patch } : method)));

  return (
    <SettingsCard title="Payment Methods" description="Manage saved payment methods">
      <div className="space-y-3">
        {methods.map((method, index) => (
          // The key must stay stable while the row is edited: keying by
          // the method's NAME made React throw the row away and rebuild
          // it on the first keystroke in that field, so the input lost
          // focus after a single letter. Index keys are safe here — the
          // inputs are fully controlled from this array.
          <div
            key={index}
            className="grid grid-cols-1 items-end gap-3 rounded-lg border border-[var(--border)] p-4 sm:grid-cols-[1fr_1fr_auto_auto]"
          >
            <SettingsInput
              label="Method"
              value={method.name}
              onChange={(event) => updateMethod(index, { name: event.target.value })}
            />
            <SettingsInput
              label="Description"
              value={method.description}
              onChange={(event) => updateMethod(index, { description: event.target.value })}
            />
            <SettingsToggle
              label={`Enable ${method.name || "payment method"}`}
              enabled={method.enabled}
              onChange={(enabled) => updateMethod(index, { enabled })}
            />
            <Button
              variant="danger"
              icon={Trash2}
              aria-label="Remove payment method"
              onClick={() => setMethods(methods.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
        ))}
        {methods.length === 0 && <p className="text-sm text-[var(--text-muted)]">No payment methods configured.</p>}
        <Button
          variant="outline"
          icon={Plus}
          onClick={() => setMethods([...methods, { name: "", description: "", enabled: false }])}
        >
          Add payment method
        </Button>
      </div>
      {validationError && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {validationError}
        </p>
      )}
      <SettingsSaveButton
        onSave={() => {
          const blank = methods.findIndex((method) => !method.name.trim());
          if (blank >= 0) {
            setValidationError(`Payment method ${blank + 1} needs a name before saving.`);
            return;
          }
          setValidationError("");
          onSave(methods);
        }}
        saving={saving}
      />
    </SettingsCard>
  );
}

function ShippingPanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const zonesData = Array.isArray(data?.zones) ? (data.zones as ObjectData[]) : [];
  const [zones, setZones] = useState<ShippingZone[]>(() =>
    zonesData.map((zone) => ({
      name: String(zone.name ?? ""),
      regions: Array.isArray(zone.regions) ? zone.regions.map(String) : [],
      rate: Number(zone.rate ?? 0),
      isActive: zone.isActive !== false,
    })),
  );
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(String(data?.freeShippingThreshold ?? ""));
  const [defaultShippingMethod, setDefaultShippingMethod] = useState(String(data?.defaultShippingMethod ?? ""));
  const [validationError, setValidationError] = useState("");
  const updateZone = (index: number, patch: Partial<ShippingZone>) =>
    setZones(zones.map((zone, itemIndex) => (itemIndex === index ? { ...zone, ...patch } : zone)));

  return (
    <SettingsCard title="Shipping" description="Manage stored shipping zones and rates">
      <div className="space-y-3">
        {zones.map((zone, index) => (
          // Stable key only — see PaymentPanel: a key containing the
          // zone's name remounts the row (and drops input focus) on the
          // first character typed into the name field.
          <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] p-4 md:grid-cols-4">
            <SettingsInput
              label="Zone"
              value={zone.name}
              onChange={(event) => updateZone(index, { name: event.target.value })}
            />
            <SettingsInput
              label="Regions (comma separated)"
              value={zone.regions.join(", ")}
              onChange={(event) =>
                updateZone(index, {
                  regions: event.target.value.split(",").map((r) => r.trim()).filter(Boolean),
                })
              }
            />
            <SettingsInput
              label="Rate"
              type="number"
              min="0"
              step="0.01"
              value={zone.rate}
              onChange={(event) => updateZone(index, { rate: Number(event.target.value) })}
            />
            <div className="flex items-end justify-between gap-3 pb-2">
              <SettingsToggle
                label={`Enable ${zone.name || "shipping zone"}`}
                enabled={zone.isActive}
                onChange={(isActive) => updateZone(index, { isActive })}
              />
              <Button
                variant="danger"
                icon={Trash2}
                aria-label="Remove shipping zone"
                onClick={() => setZones(zones.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-[var(--text-muted)]">No shipping zones configured.</p>}
        <Button
          variant="outline"
          icon={Plus}
          onClick={() => setZones([...zones, { name: "", regions: [], rate: 0, isActive: true }])}
        >
          Add shipping zone
        </Button>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <SettingsInput
          label="Free Shipping Threshold"
          type="number"
          min="0"
          step="0.01"
          value={freeShippingThreshold}
          onChange={(event) => setFreeShippingThreshold(event.target.value)}
        />
        <SettingsSelect
          label="Default Shipping Method"
          value={defaultShippingMethod}
          options={["Standard Shipping", "Express Shipping"]}
          onChange={setDefaultShippingMethod}
        />
      </div>
      {validationError && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {validationError}
        </p>
      )}
      <SettingsSaveButton
        onSave={() => {
          const blank = zones.findIndex((zone) => !zone.name.trim());
          if (blank >= 0) {
            setValidationError(`Shipping zone ${blank + 1} needs a name before saving.`);
            return;
          }
          setValidationError("");
          onSave({ zones, freeShippingThreshold, defaultShippingMethod });
        }}
        saving={saving}
      />
    </SettingsCard>
  );
}

const notificationFields = [
  ["newOrder", "New Order Notifications", "Get notified when a new order is placed"],
  ["lowStock", "Low Stock Alerts", "Get notified when product stock is low"],
  ["customerMessages", "Customer Messages", "Get notified when a customer sends a message"],
  ["marketingUpdates", "Marketing Updates", "Receive store updates and promotions"],
  ["systemNotifications", "System Notifications", "Get notified about system events"],
] as const;

function NotificationsPanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      notificationFields.map(([key]) => [key, Boolean(data?.[key])]),
    ) as Record<(typeof notificationFields)[number][0], boolean>,
  );

  return (
    <SettingsCard title="Notifications" description="Manage notification preferences">
      <div className="space-y-3">
        {notificationFields.map(([key, title, description]) => (
          <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] p-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
            </div>
            <SettingsToggle
              label={title}
              enabled={values[key]}
              onChange={(enabled) => setValues({ ...values, [key]: enabled })}
            />
          </div>
        ))}
      </div>
      <SettingsSaveButton onSave={() => onSave(values)} saving={saving} />
    </SettingsCard>
  );
}

const USER_ROLE_OPTIONS = ["Super Admin", "Admin", "Manager", "Editor", "Support", "Customer"];

/** Round avatar for the Users & Roles list: the saved image when the
 *  user has one, otherwise an initial-letter tile (same fallback the
 *  Customers table and details panel use). */
function UserAvatarTile({ user }: { user: SettingsUser }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "Unnamed user";
  const src =
    user.avatar && user.avatar !== "default-avatar.png" ? user.avatar : undefined;
  if (src && failedUrl !== src) {
    return (
      <img
        src={src}
        alt={displayName}
        onError={() => setFailedUrl(src)}
        className="h-8 w-8 shrink-0 rounded-full border border-[var(--border)] object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[11px] font-bold text-[var(--primary)]">
      {(displayName.trim().charAt(0) || "N").toUpperCase()}
    </span>
  );
}

function UsersPanel({
  users,
  onDeleteUser,
  onUpdateUser,
  onCreateUser,
}: {
  users: SettingsUser[];
  onDeleteUser: (id: string) => void;
  onUpdateUser: (id: string, values: { role?: string; isActive?: boolean }) => void;
  onCreateUser: (values: NewUserValues) => Promise<void>;
}) {
  const { hasPermission } = useAdminAuth();
  const canCreateUsers =
    typeof hasPermission !== "function" || hasPermission("Users", "create");
  const canEditUsers =
    typeof hasPermission !== "function" || hasPermission("Users", "edit");
  const canDeleteUsers =
    typeof hasPermission !== "function" || hasPermission("Users", "delete");

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<NewUserValues>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "Manager",
    isActive: true,
  });
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  const openAddForm = () => {
    setForm({ firstName: "", lastName: "", email: "", password: "", role: "Manager", isActive: true });
    setFormError("");
    setShowAddForm(true);
  };

  const submitAddForm = async () => {
    if (!form.firstName.trim()) {
      setFormError("A first name is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      await onCreateUser({
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
      });
      setShowAddForm(false);
    } catch (createError) {
      // The page rethrows with the API's message (e.g. duplicate email).
      setFormError(createError instanceof Error ? createError.message : "Unable to create the user.");
    } finally {
      setCreating(false);
    }
  };

  const selectClassName =
    "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--primary)]";

  return (
    <>
    <SettingsCard
      title="Users & Roles"
      description="Change a user's role or deactivate an account. Your own role and the last Super Admin are protected."
    >
      {canCreateUsers && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" icon={Plus} onClick={openAddForm}>
            Add User
          </Button>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-[var(--text)]">Add User</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              The new account can sign in to the admin panel right away (staff roles) with this email and password.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SettingsInput
                label="First Name"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
              <SettingsInput
                label="Last Name"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
              <div className="sm:col-span-2">
                <SettingsInput
                  label="Email Address"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <SettingsInput
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              <div>
                <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">Role</span>
                <select
                  aria-label="Role for the new user"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                  className={selectClassName}
                >
                  {USER_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">Status</span>
                <select
                  aria-label="Status for the new user"
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(event) => setForm({ ...form, isActive: event.target.value === "active" })}
                  className={selectClassName}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {formError && (
              <p className="mt-4 rounded-lg border border-red-300 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
                {formError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowAddForm(false)} disabled={creating}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void submitAddForm()} disabled={creating}>
                {creating ? "Creating..." : "Create User"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="group border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium text-[var(--text)]">
                  <span className="flex items-center gap-2.5">
                    <UserAvatarTile user={user} />
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "Unnamed user"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-soft)]">{user.email}</td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Role for ${user.email}`}
                    value={user.role || "Customer"}
                    disabled={!canEditUsers}
                    onChange={(event) => onUpdateUser(user._id, { role: event.target.value })}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {USER_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={!canEditUsers}
                    onClick={() => onUpdateUser(user._id, { isActive: user.isActive === false })}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                      user.isActive === false
                        ? "bg-red-500/10 text-red-500"
                        : "bg-emerald-500/10 text-emerald-600"
                    }`}
                    title={user.isActive === false ? "Reactivate this account" : "Deactivate this account"}
                  >
                    {user.isActive === false ? "Inactive" : "Active"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  {/* Same row-action rule as the shared resource
                      tables: always visible, muted at rest, full
                      colour on the hovered row. (This table's row
                      action is delete; role/status edit inline.) */}
                  {canDeleteUsers && (
                    <button
                      type="button"
                      aria-label={`Delete ${user.email}`}
                      title="Delete"
                      onClick={() => onDeleteUser(user._id)}
                      className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors duration-200 hover:bg-red-500/10 hover:text-red-500 group-hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SettingsCard>

    <RolePermissionsPanel />
    </>
  );
}

const MATRIX_ACTIONS = ["view", "create", "edit", "delete"] as const;

/** Circular tick — the same visual language as the media upload panel:
 *  filled orange with a white check, or a hollow ring. */
function MatrixTick({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
          on
            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
            : "border-[var(--text-muted)] bg-transparent text-transparent"
        }`}
      >
        <Check size={12} strokeWidth={4} />
      </span>
    </button>
  );
}

/**
 * Role Permissions matrix editor. The matrix itself lives on the server
 * (GET/PUT /api/permissions); only a Super Admin may change it — everyone
 * else sees it read-only. Super Admin's own row is locked by design: that
 * role always has full access, whatever the matrix says, so the store
 * can never lock its top admin out.
 */
function RolePermissionsPanel() {
  const [data, setData] = useState<RolePermissionsData | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrixData>({});
  const [selectedRole, setSelectedRole] = useState("Admin");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    settingsService
      .getPermissions()
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setMatrix(loaded.matrix);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(extractApiError(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canEdit = Boolean(data?.canEdit);
  const roleLocked = selectedRole === "Super Admin";
  const editable = canEdit && !roleLocked;

  const toggleCell = (module: string, action: string) => {
    if (!editable) return;
    setMatrix((current) => ({
      ...current,
      [selectedRole]: {
        ...current[selectedRole],
        [module]: {
          ...current[selectedRole]?.[module],
          [action]: !current[selectedRole]?.[module]?.[action],
        },
      },
    }));
  };

  const saveMatrix = async () => {
    setSaving(true);
    try {
      const saved = await settingsService.updatePermissions(matrix);
      setMatrix(saved);
      toast.success("Role permissions saved.");
    } catch (saveError) {
      toast.error(extractApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3">
      <SettingsCard
        title="Role Permissions"
        description="Control what each role can see and do in the admin panel. Changes apply to new sessions right away."
      >
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading permissions…</p>
        ) : loadFailed && !data ? (
          <p className="rounded-lg border border-red-300 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
            Role permissions could not be loaded.
          </p>
        ) : data ? (
          <>
            {/* Role selector */}
            <div className="mb-4 flex flex-wrap gap-2">
              {data.roles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setSelectedRole(role);
                  }}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-all ${
                    selectedRole === role
                      ? "border-[var(--primary)] bg-[var(--primary)] font-semibold text-white"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)]"
                  }`}
                >
                  {role}
                  {selectedRole === role && <Check size={11} strokeWidth={3.5} />}
                </button>
              ))}
            </div>

            {roleLocked ? (
              <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-soft)]">
                Super Admin always has full access to everything — this row
                can&apos;t be changed, so the store&apos;s top admin can never be
                locked out.
              </p>
            ) : !canEdit ? (
              <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-soft)]">
                Only a Super Admin can change role permissions. You&apos;re
                viewing them read-only.
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[var(--surface)] text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Module</th>
                    {MATRIX_ACTIONS.map((action) => (
                      <th key={action} className="px-4 py-3 text-center capitalize">
                        {action}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.modules.map((module) => (
                    <tr key={module} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">
                        {module}
                      </td>
                      {MATRIX_ACTIONS.map((action) => {
                        const supported = (
                          data.moduleActions[module] || []
                        ).includes(action);
                        const on = Boolean(matrix[selectedRole]?.[module]?.[action]);
                        return (
                          <td key={action} className="px-4 py-2.5 text-center">
                            {supported ? (
                              <MatrixTick
                                on={on}
                                disabled={!editable}
                                label={`${selectedRole} can ${action} ${module}`}
                                onToggle={() => toggleCell(module, action)}
                              />
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => void saveMatrix()}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Permissions"}
                </Button>
              </div>
            )}
          </>
        ) : null}
      </SettingsCard>
    </div>
  );
}

/**
 * Two-factor authentication (TOTP) management for the signed-in account.
 * Enrolment is a two-step handshake with the API: setup issues a secret +
 * QR (not yet active), and only a valid code from the authenticator app
 * turns it on — so 2FA can never be enabled by accident or by a hijacked
 * session alone. Disabling likewise requires a current code.
 */
function SecurityPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/auth/2fa/status")
      .then((res) => {
        if (!cancelled) setEnabled(Boolean(res.data?.enabled));
      })
      .catch((statusError) => {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(extractApiError(statusError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post("/auth/2fa/setup", {});
      setSetupData({ secret: res.data.secret, qrCode: res.data.qrCode });
      setCode("");
    } catch (setupError) {
      toast.error(extractApiError(setupError));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setBusy(true);
    try {
      await apiClient.post("/auth/2fa/enable", { code: code.trim() });
      setEnabled(true);
      setSetupData(null);
      setCode("");
      toast.success("Two-factor authentication is now on. Your next sign-in will ask for a code.");
    } catch (enableError) {
      toast.error(extractApiError(enableError));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await apiClient.post("/auth/2fa/disable", { code: code.trim() });
      setEnabled(false);
      setCode("");
      toast.success("Two-factor authentication has been turned off.");
    } catch (disableError) {
      toast.error(extractApiError(disableError));
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the secret is visible to copy manually */
    }
  };

  const codeInput = (id: string) => (
    <SettingsInput
      label="Authenticator Code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="123456"
      value={code}
      onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
      id={id}
    />
  );

  return (
    <SettingsCard title="Security" description="Authentication controls for your account">
      <div className="rounded-lg border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
            <div>
              <h3 className="text-sm font-medium text-[var(--text)]">Two-Factor Authentication (2FA)</h3>
              <p className="mt-1 max-w-xl text-xs text-[var(--text-muted)]">
                Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft
                Authenticator, Authy…) on top of your password when signing in to this panel.
              </p>
            </div>
          </div>
          {enabled !== null && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--surface)] text-[var(--text-muted)]"
              }`}
            >
              {enabled ? "Enabled" : "Off"}
            </span>
          )}
        </div>

        {enabled === null && !loadFailed && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">Checking your two-factor status…</p>
        )}

        {enabled === false && !setupData && (
          <div className="mt-4">
            <Button variant="primary" onClick={() => void startSetup()} disabled={busy}>
              {busy ? "Preparing..." : "Enable Two-Factor Authentication"}
            </Button>
          </div>
        )}

        {enabled === false && setupData && (
          <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--text-muted)]">
              <li>Open your authenticator app and scan this QR code (or enter the secret manually).</li>
              <li>Type the 6-digit code the app shows to confirm and switch 2FA on.</li>
            </ol>
            <div className="flex flex-wrap items-start gap-5">
              {/* Server-generated QR for the otpauth:// enrolment URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrCode}
                alt="Two-factor enrolment QR code"
                width={160}
                height={160}
                className="rounded-lg border border-[var(--border)] bg-white p-1"
              />
              <div className="min-w-56 flex-1">
                <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">
                  Manual Secret Key
                </span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                    {setupData.secret}
                  </code>
                  <Button variant="outline" size="sm" icon={Copy} onClick={() => void copySecret()}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="mt-4 max-w-xs">
                  {codeInput("two-factor-enable-code")}
                </div>
                <div className="mt-4 flex gap-3">
                  <Button
                    variant="primary"
                    onClick={() => void confirmEnable()}
                    disabled={busy || code.length !== 6}
                  >
                    {busy ? "Confirming..." : "Confirm & Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSetupData(null);
                      setCode("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {enabled === true && (
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <p className="text-xs text-[var(--text-muted)]">
              To turn 2FA off, enter a current code from your authenticator app.
            </p>
            <div className="mt-3 max-w-xs">{codeInput("two-factor-disable-code")}</div>
            <div className="mt-4">
              <Button variant="danger" onClick={() => void disable()} disabled={busy || code.length !== 6}>
                {busy ? "Turning off..." : "Disable Two-Factor Authentication"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

// Dynamic integrations — the form mirrors the backend Setting schema:
// `usageType` must be one of the schema enum values (an earlier version of
// this panel sent a free-form `category` the API dropped, so saving an
// integration always failed validation), and every auth type gets the
// exact credential fields the integration runner actually sends.
const USAGE_TYPE_OPTIONS = [
  "STORAGE",
  "PAYMENT",
  "SMS_NOTIFICATION",
  "EMAIL",
  "AUTH",
  "API",
] as const;

type UsageType = (typeof USAGE_TYPE_OPTIONS)[number];

const slugifyTitle = (title: string): string =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const usageTypeOf = (item: Record<string, unknown>): UsageType => {
  const raw = String(item.usageType ?? item.category ?? "").toUpperCase();
  if ((USAGE_TYPE_OPTIONS as readonly string[]).includes(raw)) return raw as UsageType;
  if (raw === "SMS") return "SMS_NOTIFICATION";
  if (raw === "ANALYTICS" || raw === "CUSTOM") return "API";
  return "API";
};

function IntegrationsPanel({ data, saving, onSave }: SectionPanelProps<Array<Record<string, unknown>>>) {
  const [integrations, setIntegrations] = useState<DynamicIntegration[]>(() =>
    (data ?? []).map((item) => ({
      usageType: usageTypeOf(item),
      serviceSlug: String(item.serviceSlug ?? ""),
      title: String(item.title ?? ""),
      baseUrl: String(item.baseUrl ?? ""),
      authType: (item.authType as AuthType) || "NONE",
      authCredentials: {
        apiKey: String((item.authCredentials as Record<string, unknown>)?.apiKey ?? ""),
        headerKey: String((item.authCredentials as Record<string, unknown>)?.headerKey ?? "Authorization"),
        username: String((item.authCredentials as Record<string, unknown>)?.username ?? ""),
        password: String((item.authCredentials as Record<string, unknown>)?.password ?? ""),
      },
      globalHeaders: (item.globalHeaders as Record<string, string>) || {},
      endpoints: Array.isArray(item.endpoints)
        ? (item.endpoints as DynamicEndpoint[])
        : [{ name: "default", path: "/", method: "POST" }],
      webhooks: Array.isArray(item.webhooks) ? (item.webhooks as Webhook[]) : [],
      isConnected: item.isConnected !== false,
    })),
  );
  const [validationError, setValidationError] = useState("");

  const updateIntegration = (index: number, patch: Partial<DynamicIntegration>) =>
    setIntegrations(
      integrations.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );

  const updateCredentials = (index: number, patch: Partial<DynamicIntegration["authCredentials"]>) =>
    updateIntegration(index, {
      authCredentials: { ...integrations[index].authCredentials, ...patch },
    });

  const addEndpoint = (integrationIndex: number) => {
    const updated = [...integrations];
    updated[integrationIndex].endpoints.push({ name: "", path: "/", method: "POST" });
    setIntegrations(updated);
  };

  const updateEndpoint = (
    integrationIndex: number,
    endpointIndex: number,
    patch: Partial<DynamicEndpoint>,
  ) => {
    const updated = [...integrations];
    updated[integrationIndex].endpoints[endpointIndex] = {
      ...updated[integrationIndex].endpoints[endpointIndex],
      ...patch,
    };
    setIntegrations(updated);
  };

  const removeEndpoint = (integrationIndex: number, endpointIndex: number) => {
    const updated = [...integrations];
    updated[integrationIndex].endpoints = updated[integrationIndex].endpoints.filter(
      (_, idx) => idx !== endpointIndex,
    );
    setIntegrations(updated);
  };

  // The API rejects the whole save when a required field is blank, with a
  // generic message — catch the problems here and name the field instead.
  const validate = (): string => {
    for (const [index, item] of integrations.entries()) {
      const label = item.title || `Connector ${index + 1}`;
      if (!item.title.trim()) return `Connector ${index + 1}: a service title is required.`;
      if (!item.serviceSlug.trim()) return `${label}: a unique service slug is required.`;
      if (!item.baseUrl.trim()) return `${label}: a base API URL is required.`;
      for (const endpoint of item.endpoints) {
        if (!endpoint.name.trim()) return `${label}: every endpoint needs an action name.`;
        if (!endpoint.path.trim()) return `${label}: every endpoint needs a path.`;
      }
    }
    return "";
  };

  const handleSave = () => {
    const problem = validate();
    setValidationError(problem);
    if (!problem) onSave(integrations as unknown as Array<Record<string, unknown>>);
  };

  return (
    <SettingsCard
      title="API / Integrations"
      description="Connect any REST service directly using a custom URL, auth credentials, and endpoints."
    >
      <div className="space-y-6">
        {integrations.map((item, index) => (
          // Stable key only — see PaymentPanel: this key contained the
          // service slug, and the title field REWRITES the slug on every
          // keystroke, so the whole connector card remounted per letter
          // and its inputs lost focus immediately.
          <div key={index} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-[var(--primary)]" />
                <span className="font-semibold text-sm text-[var(--text)]">
                  {item.title || "New Connector / API"}
                </span>
                <span className="ml-2 rounded-md bg-[var(--primary-light)]/20 px-2 py-0.5 text-xs text-[var(--primary)] border border-[var(--primary)]/30 font-medium">
                  {item.usageType}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <SettingsToggle
                  label="Connect Service"
                  enabled={item.isConnected}
                  onChange={(isConnected) => updateIntegration(index, { isConnected })}
                />
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  title="Remove integration"
                  aria-label="Remove integration"
                  onClick={() => setIntegrations(integrations.filter((_, idx) => idx !== index))}
                />
              </div>
            </div>

            {/* Service main fields */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <SettingsInput
                label="Service Title"
                placeholder="e.g. Cloudinary / Twilio"
                value={item.title}
                onChange={(e) => {
                  const title = e.target.value;
                  // Keep the unique slug in sync with the title until the
                  // admin edits the slug field directly — requiring a
                  // hand-typed slug made new connectors unsaveable.
                  const slugEdited =
                    item.serviceSlug.trim() !== "" &&
                    item.serviceSlug !== slugifyTitle(item.title);
                  updateIntegration(index, {
                    title,
                    ...(slugEdited ? {} : { serviceSlug: slugifyTitle(title) }),
                  });
                }}
              />
              <SettingsSelect
                label="Usage Type"
                value={item.usageType}
                options={[...USAGE_TYPE_OPTIONS]}
                onChange={(usageType) => updateIntegration(index, { usageType: usageType as UsageType })}
              />
              <SettingsInput
                label="Service Slug (Unique)"
                placeholder="e.g. cloudinary-media"
                value={item.serviceSlug}
                onChange={(e) => updateIntegration(index, { serviceSlug: e.target.value })}
              />
              <SettingsInput
                label="Base API URL"
                placeholder="https://api.example.com"
                value={item.baseUrl}
                onChange={(e) => updateIntegration(index, { baseUrl: e.target.value })}
              />
            </div>

            {/* Authentication — the fields follow the auth type, matching
                exactly what the backend runner sends. */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
              <SettingsSelect
                label="Auth Type"
                value={item.authType}
                options={["NONE", "API_KEY", "BEARER_TOKEN", "BASIC", "CUSTOM_HEADER"]}
                onChange={(authType) => updateIntegration(index, { authType: authType as AuthType })}
              />

              {item.authType === "API_KEY" && (
                <>
                  <SettingsInput
                    label="Header Name"
                    placeholder="X-API-Key"
                    value={item.authCredentials.headerKey}
                    onChange={(e) => updateCredentials(index, { headerKey: e.target.value })}
                  />
                  <SettingsInput
                    label="API Key"
                    type="password"
                    value={item.authCredentials.apiKey}
                    onChange={(e) => updateCredentials(index, { apiKey: e.target.value })}
                  />
                </>
              )}

              {item.authType === "BEARER_TOKEN" && (
                <SettingsInput
                  label="Bearer Token"
                  type="password"
                  value={item.authCredentials.apiKey}
                  onChange={(e) => updateCredentials(index, { apiKey: e.target.value })}
                />
              )}

              {item.authType === "BASIC" && (
                <>
                  <SettingsInput
                    label="Username"
                    value={item.authCredentials.username}
                    onChange={(e) => updateCredentials(index, { username: e.target.value })}
                  />
                  <SettingsInput
                    label="Password"
                    type="password"
                    value={item.authCredentials.password}
                    onChange={(e) => updateCredentials(index, { password: e.target.value })}
                  />
                </>
              )}

              {item.authType === "CUSTOM_HEADER" && (
                <>
                  <SettingsInput
                    label="Header Name"
                    placeholder="X-Custom-Auth"
                    value={item.authCredentials.headerKey}
                    onChange={(e) => updateCredentials(index, { headerKey: e.target.value })}
                  />
                  <SettingsInput
                    label="Header Value"
                    type="password"
                    value={item.authCredentials.apiKey}
                    onChange={(e) => updateCredentials(index, { apiKey: e.target.value })}
                  />
                </>
              )}
            </div>

            {/* Dynamic endpoints */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[var(--text-soft)] flex items-center gap-1">
                  <Code2 className="h-3.5 w-3.5" /> Service Endpoints
                </span>
                <Button variant="outline" size="sm" icon={Plus} onClick={() => addEndpoint(index)}>
                  Add Endpoint
                </Button>
              </div>

              <div className="space-y-2">
                {item.endpoints.map((ep, epIdx) => (
                  <div key={epIdx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end bg-[var(--background)] p-3 rounded-md border border-[var(--border)]">
                    <SettingsInput
                      label="Action Name"
                      placeholder="e.g. upload / send_sms"
                      value={ep.name}
                      onChange={(e) => updateEndpoint(index, epIdx, { name: e.target.value })}
                    />
                    <SettingsInput
                      label="Path"
                      placeholder="/v1/send"
                      value={ep.path}
                      onChange={(e) => updateEndpoint(index, epIdx, { path: e.target.value })}
                    />
                    <SettingsSelect
                      label="HTTP Method"
                      value={ep.method}
                      options={["GET", "POST", "PUT", "DELETE", "PATCH"]}
                      onChange={(method) => updateEndpoint(index, epIdx, { method: method as HttpMethod })}
                    />
                    <div className="flex justify-end pb-1">
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={() => removeEndpoint(index, epIdx)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {integrations.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">No integration connectors configured.</p>
        )}

        <Button
          variant="outline"
          icon={Plus}
          onClick={() =>
            setIntegrations([
              ...integrations,
              {
                usageType: "API",
                serviceSlug: "",
                title: "",
                baseUrl: "",
                authType: "NONE",
                authCredentials: { apiKey: "", headerKey: "Authorization", username: "", password: "" },
                globalHeaders: {},
                endpoints: [{ name: "default", path: "/", method: "POST" }],
                webhooks: [],
                isConnected: true,
              },
            ])
          }
        >
          Add New Service Connector
        </Button>
      </div>

      {validationError && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
          {validationError}
        </p>
      )}

      <SettingsSaveButton onSave={handleSave} saving={saving} />
    </SettingsCard>
  );
}

function AppearancePanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const [form, setForm] = useState({
    theme: String(data?.theme ?? "Light"),
    compactSidebar: Boolean(data?.compactSidebar),
    showBreadcrumbs: data?.showBreadcrumbs !== false,
    enableAnimations: data?.enableAnimations !== false,
  });

  const setBoolean = (
    key: "compactSidebar" | "showBreadcrumbs" | "enableAnimations",
    value: boolean,
  ) => setForm({ ...form, [key]: value });

  return (
    <SettingsCard title="Appearance" description="Customize saved dashboard preferences">
      <SettingsSelect
        label="Theme"
        value={form.theme}
        options={["Light", "Dark", "System"]}
        onChange={(theme) => setForm({ ...form, theme })}
      />
      <div className="mt-5 space-y-3">
        {(
          [
            ["compactSidebar", "Compact Sidebar", "Use a smaller navigation sidebar"],
            ["showBreadcrumbs", "Show Page Breadcrumbs", "Display breadcrumbs at the top of pages"],
            ["enableAnimations", "Animations", "Enable interface animations"],
          ] as const
        ).map(([key, title, description]) => (
          <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] p-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
            </div>
            <SettingsToggle
              label={title}
              enabled={form[key]}
              onChange={(enabled) => setBoolean(key, enabled)}
            />
          </div>
        ))}
      </div>
      <SettingsSaveButton onSave={() => onSave(form)} saving={saving} />
    </SettingsCard>
  );
}