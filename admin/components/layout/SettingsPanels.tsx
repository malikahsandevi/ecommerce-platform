"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, Eye, EyeOff, Plus, ShieldCheck, Trash2, Code2, Globe } from "lucide-react";
import Button from "@/components/ui/Button";
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

export function SettingsPanel({
  activeMenu,
  settings,
  users,
  saving,
  onSave,
  onDeleteUser,
}: {
  activeMenu: string;
  settings: SettingsDocument;
  users: SettingsUser[];
  saving: boolean;
  onSave: (section: SettingsSection, value: unknown) => void;
  onDeleteUser: (id: string) => void;
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
      return <UsersPanel users={users} onDeleteUser={onDeleteUser} />;
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

function GeneralPanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const [form, setForm] = useState(() => ({
    storeName: String(data?.storeName ?? ""),
    storeTagline: String(data?.storeTagline ?? ""),
    storeEmail: String(data?.storeEmail ?? ""),
    phone: String(data?.phone ?? ""),
    timeZone: String(data?.timeZone ?? ""),
    language: String(data?.language ?? ""),
    logo: String(data?.logo ?? ""),
  }));

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
          options={["(GMT+05:00) Pakistan Standard Time", "(GMT+00:00) UTC"]}
          onChange={(timeZone) => setForm({ ...form, timeZone })}
        />
        <SettingsSelect
          label="Language"
          value={form.language}
          options={["English", "Urdu"]}
          onChange={(language) => setForm({ ...form, language })}
        />
        <SettingsInput
          label="Store Logo URL"
          value={form.logo}
          onChange={(event) => setForm({ ...form, logo: event.target.value })}
        />
      </div>
      {form.logo && (
        <Image
          src={form.logo}
          alt="Store logo preview"
          width={64}
          height={64}
          unoptimized
          className="mt-5 rounded-lg border border-[var(--border)] object-contain"
        />
      )}
      <SettingsSaveButton onSave={() => onSave(form)} saving={saving} />
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
          <div
            key={`${method.name}-${index}`}
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
          <div key={`${zone.name}-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] p-4 md:grid-cols-4">
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

function UsersPanel({ users, onDeleteUser }: { users: SettingsUser[]; onDeleteUser: (id: string) => void }) {
  return (
    <SettingsCard title="Users & Roles" description="Users currently stored in the database">
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium text-[var(--text)]">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "Unnamed user"}
                </td>
                <td className="px-4 py-3 text-[var(--text-soft)]">{user.email}</td>
                <td className="px-4 py-3 text-[var(--text-soft)]">{user.role || "—"}</td>
                <td className="px-4 py-3">{user.isActive === false ? "Inactive" : "Active"}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    aria-label={`Delete ${user.email}`}
                    onClick={() => onDeleteUser(user._id)}
                  />
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
  );
}

function SecurityPanel() {
  return (
    <SettingsCard title="Security" description="Authentication controls">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
        <p className="text-sm text-[var(--text-muted)]">
          Password changes and two-factor authentication are not available through the current Settings API.
        </p>
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
          <div key={`${item.serviceSlug}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-5 space-y-4">
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