"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, KeyRound, LoaderCircle, Play, Plus, Save, ShieldCheck, Trash2, Code2, Globe } from "lucide-react";
import {
  SERVICE_CATALOGUE,
  categoryById,
  subServiceById,
} from "@/services/serviceCatalogue";
import Button from "@/components/ui/Button";
import { useBackdropClose } from "@/hooks/useBackdropClose";
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
import { choiceDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { LANGUAGE_OPTIONS, applyLanguage, useLanguage } from "@/services/i18n";
import ThemePalettePicker from "./ThemePalettePicker";

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
  onIntegrationsSync,
}: {
  activeMenu: string;
  settings: SettingsDocument;
  users: SettingsUser[];
  saving: boolean;
  onSave: (section: SettingsSection, value: unknown) => void;
  onIntegrationsSync: (integrations: Array<Record<string, unknown>>) => void;
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
        <ServiceBuilderPanel
          data={settings.integrations}
          categoryIds={["PAYMENT"]}
          title="Payment Methods"
          description="Payment gateways for the store. Pick a gateway and its own credential fields appear — every gateway is saved and tested on its own card, and runs only when it is configured AND its Active toggle is on."
          onSync={onIntegrationsSync}
        />
      );
    case "Shipping":
      return (
        <ServiceBuilderPanel
          data={settings.integrations}
          categoryIds={["SHIPPING"]}
          title="Shipping"
          description="Shipping and tracking providers for the store. Pick a provider and its own credential fields appear — every provider is saved and tested on its own card, and runs only when it is configured AND its Active toggle is on."
          onSync={onIntegrationsSync}
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
        <ServiceBuilderPanel
          data={settings.integrations}
          categoryIds={["STORAGE", "EMAIL", "SMS_NOTIFICATION", "AUTH", "ANALYTICS", "MAPS", "CUSTOM"]}
          title="API / Integrations"
          description="The store's platform services — storage, email, SMS, auth, analytics, maps and custom connectors. Payment gateways live in Payment Methods and shipping providers in Shipping. A service runs only when it is configured AND its Active toggle is on."
          onSync={onIntegrationsSync}
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
  const { t } = useLanguage();
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">{t(label)}</span>
      <div className="flex items-center gap-2">
        {isPreviewableImageSrc(value) && (
          <Image
            src={value}
            alt={t("{label} preview").replace("{label}", t(label))}
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
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-light)]"
        />
        <Button
          variant="secondary"
          size="md"
          onClick={onSelect}
          className="h-10 shrink-0 text-xs"
        >
          {t("Select")}
        </Button>
      </div>
    </div>
  );
}

function GeneralPanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const { t } = useLanguage();
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

  // The media picker already closes on a backdrop click; Escape closes
  // it too while it is the open popup on this page.
  useEffect(() => {
    if (pickerTarget === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerTarget]);

  return (
    <SettingsCard title={t("General Settings")} description="Basic information about your store">
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
          options={LANGUAGE_OPTIONS}
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
            {t("Every price and total in the panel is shown in this currency. Amounts are never converted — only the symbol changes.")}
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
            label={t("Monthly Target (amount {symbol})").replace("{symbol}", currencySymbolFor(form.currency))}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 5000"
            value={form.monthlyTarget}
            onChange={(event) => setForm({ ...form, monthlyTarget: event.target.value })}
          />
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            {t("Revenue goal for the current month — shown as the gauge on the dashboard. Leave empty for no target.")}
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
          // Same for the language: the shell re-renders in the chosen
          // language (and direction) the moment General is saved.
          applyLanguage(form.language);
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

const notificationFields = [
  ["newOrder", "New Order Notifications", "Get notified when a new order is placed"],
  ["lowStock", "Low Stock Alerts", "Get notified when product stock is low"],
  ["customerMessages", "Customer Messages", "Get notified when a customer sends a message"],
  ["marketingUpdates", "Marketing Updates", "Receive store updates and promotions"],
  ["systemNotifications", "System Notifications", "Get notified about system events"],
] as const;

function NotificationsPanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const { t } = useLanguage();
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
              <h3 className="text-sm font-medium text-[var(--text)]">{t(title)}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t(description)}</p>
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
  const { t } = useLanguage();
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

  // Backdrop dismissal (Ahsan's rule: every popup closes on an outside
  // click) — press-starts-and-ends-on-the-overlay pattern; closing is a
  // cancel, and it stays disabled while a create is in flight (same as
  // the Cancel button).
  const addUserBackdrop = useBackdropClose(
    () => setShowAddForm(false),
    showAddForm && !creating,
  );

  const openAddForm = () => {
    setForm({ firstName: "", lastName: "", email: "", password: "", role: "Manager", isActive: true });
    setFormError("");
    setShowAddForm(true);
  };

  const submitAddForm = async () => {
    if (!form.firstName.trim()) {
      setFormError(t("A first name is required."));
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError(t("Enter a valid email address."));
      return;
    }
    if (form.password.length < 6) {
      setFormError(t("Password must be at least 6 characters."));
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
      setFormError(createError instanceof Error ? createError.message : t("Unable to create the user."));
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
            {t("Add User")}
          </Button>
        </div>
      )}

      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
          {...addUserBackdrop}
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-[var(--text)]">{t("Add User")}</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("The new account can sign in to the admin panel right away (staff roles) with this email and password.")}
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
                <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">{t("Role")}</span>
                <select
                  aria-label={t("Role for the new user")}
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                  className={selectClassName}
                >
                  {USER_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {t(role)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">{t("Status")}</span>
                <select
                  aria-label={t("Status for the new user")}
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(event) => setForm({ ...form, isActive: event.target.value === "active" })}
                  className={selectClassName}
                >
                  <option value="active">{t("Active")}</option>
                  <option value="inactive">{t("Inactive")}</option>
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
                {t("Cancel")}
              </Button>
              <Button variant="primary" onClick={() => void submitAddForm()} disabled={creating}>
                {creating ? t("Creating...") : t("Create User")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">{t("Name")}</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">{t("Email")}</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">{t("Role")}</th>
              <th className="px-4 py-3 whitespace-nowrap text-center">{t("Status")}</th>
              <th className="px-4 py-3 text-center whitespace-nowrap">{t("Actions")}</th>
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
                <td className="px-4 py-3 text-[var(--text-soft)] text-center">{user.email}</td>
                <td className="px-4 py-3 text-center">
                  <select
                    aria-label={t("Role for {email}").replace("{email}", user.email)}
                    value={user.role || "Customer"}
                    disabled={!canEditUsers}
                    onChange={(event) => onUpdateUser(user._id, { role: event.target.value })}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {USER_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {t(role)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    disabled={!canEditUsers}
                    onClick={() => onUpdateUser(user._id, { isActive: user.isActive === false })}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
                      user.isActive === false
                        ? "bg-red-500/10 text-red-500"
                        : "bg-emerald-500/10 text-emerald-600"
                    }`}
                    title={user.isActive === false ? t("Reactivate this account") : t("Deactivate this account")}
                  >
                    {user.isActive === false ? t("Inactive") : t("Active")}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  {/* Same row-action rule as the shared resource
                      tables: always visible, muted at rest, full
                      colour on the hovered row. (This table's row
                      action is delete; role/status edit inline.) */}
                  {canDeleteUsers && (
                    <button
                      type="button"
                      aria-label={t("Delete {email}").replace("{email}", user.email)}
                      title={t("Delete")}
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
                  {t("No users found.")}
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
  const { t } = useLanguage();
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
      toast.success(t("Role permissions saved."));
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
          <p className="text-sm text-[var(--text-muted)]">{t("Loading permissions…")}</p>
        ) : loadFailed && !data ? (
          <p className="rounded-lg border border-red-300 bg-red-500/10 p-3 text-xs text-red-600" role="alert">
            {t("Role permissions could not be loaded.")}
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
                  {t(role)}
                  {selectedRole === role && <Check size={11} strokeWidth={3.5} />}
                </button>
              ))}
            </div>

            {roleLocked ? (
              <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-soft)]">
                {t("Super Admin always has full access to everything — this row can't be changed, so the store's top admin can never be locked out.")}
              </p>
            ) : !canEdit ? (
              <p className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-soft)]">
                {t("Only a Super Admin can change role permissions. You're viewing them read-only.")}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[var(--surface)] text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">{t("Module")}</th>
                    {MATRIX_ACTIONS.map((action) => (
                      <th key={action} className="px-4 py-3 text-center capitalize">
                        {t(action)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.modules.map((module) => (
                    <tr key={module} className="border-t border-[var(--border)]">
                      <td className="px-4 py-2.5 font-medium text-[var(--text)]">
                        {t(module)}
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
                                label={t("{role} can {action} {module}").replace("{role}", t(selectedRole)).replace("{action}", t(action)).replace("{module}", t(module))}
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
                  {saving ? t("Saving...") : t("Save Permissions")}
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
  const { t } = useLanguage();
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
      toast.success(t("Two-factor authentication is now on. Your next sign-in will ask for a code."));
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
      toast.success(t("Two-factor authentication has been turned off."));
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
              <h3 className="text-sm font-medium text-[var(--text)]">{t("Two-Factor Authentication (2FA)")}</h3>
              <p className="mt-1 max-w-xl text-xs text-[var(--text-muted)]">
                {t("Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) on top of your password when signing in to this panel.")}
              </p>
            </div>
          </div>
          {enabled !== null && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--surface)] text-[var(--text-muted)]"
              }`}
            >
              {enabled ? t("Enabled") : t("Off")}
            </span>
          )}
        </div>

        {enabled === null && !loadFailed && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">{t("Checking your two-factor status…")}</p>
        )}

        {enabled === false && !setupData && (
          <div className="mt-4">
            <Button variant="primary" onClick={() => void startSetup()} disabled={busy}>
              {busy ? t("Preparing...") : t("Enable Two-Factor Authentication")}
            </Button>
          </div>
        )}

        {enabled === false && setupData && (
          <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
            <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--text-muted)]">
              <li>{t("Open your authenticator app and scan this QR code (or enter the secret manually).")}</li>
              <li>{t("Type the 6-digit code the app shows to confirm and switch 2FA on.")}</li>
            </ol>
            <div className="flex flex-wrap items-start gap-5">
              {/* Server-generated QR for the otpauth:// enrolment URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrCode}
                alt={t("Two-factor enrolment QR code")}
                width={160}
                height={160}
                className="rounded-lg border border-[var(--border)] bg-white p-1"
              />
              <div className="min-w-56 flex-1">
                <span className="mb-2 block text-xs font-medium text-[var(--text-soft)]">
                  {t("Manual Secret Key")}
                </span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]">
                    {setupData.secret}
                  </code>
                  <Button variant="outline" size="sm" icon={Copy} onClick={() => void copySecret()}>
                    {copied ? t("Copied") : t("Copy")}
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
                    {busy ? t("Confirming...") : t("Confirm & Enable")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSetupData(null);
                      setCode("");
                    }}
                    disabled={busy}
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {enabled === true && (
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            <p className="text-xs text-[var(--text-muted)]">
              {t("To turn 2FA off, enter a current code from your authenticator app.")}
            </p>
            <div className="mt-3 max-w-xs">{codeInput("two-factor-disable-code")}</div>
            <div className="mt-4">
              <Button variant="danger" onClick={() => void disable()} disabled={busy || code.length !== 6}>
                {busy ? t("Turning off...") : t("Disable Two-Factor Authentication")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

// ── API / Integrations — catalogue-driven services ───────────────────
// The panel is built on the service catalogue (services/serviceCatalogue
// on the admin, config/services on the backend): pick a Service, then a
// Sub-Service, and the form renders exactly that provider's credential
// fields — every provider has its own set. CUSTOM is the escape hatch:
// an admin-typed base URL, endpoints, and free key-value pairs.
//
// A service is USED only when it is both configured (every field saved)
// and switched ON with its Active toggle — the backend gate
// (config/services/index.js) enforces that for the runner, the media
// path and JWT signing; this panel only edits the stored state.
//
// SECURITY: the settings API never returns a full credential value —
// the backend masks EVERY value server-side (stars + the last 4
// characters) before the response leaves the server, so the full
// value never travels over the wire. The form therefore DISPLAYS the
// masked string it received; on save the backend recognises the mask
// of the stored value and keeps the stored value, while a genuinely
// new typed value replaces it.

const slugifyTitle = (title: string): string =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const MASKED_VALUES_NOTE =
  "Saved values are shown masked — stars plus the last 4 characters only. Leave a field unchanged to keep its saved value; type a new value to replace it.";

interface CustomPairState {
  key: string;
  value: string;
  secret: boolean;
  configured: boolean;
  isActive: boolean;
}

interface ServiceEntryState {
  usageType: string;
  subService: string;
  serviceSlug: string;
  title: string;
  baseUrl: string;
  authType: AuthType;
  authApiKey: string;
  authApiKeyConfigured: boolean;
  authHeaderKey: string;
  authUsername: string;
  authPassword: string;
  authPasswordConfigured: boolean;
  fields: Record<string, string>;
  configuredSecrets: Record<string, boolean>;
  customFields: CustomPairState[];
  endpoints: DynamicEndpoint[];
  isConnected: boolean;
  /** True once the entry exists server-side (loaded or saved) — the
   *  remove button only calls the API for persisted entries. */
  persisted: boolean;
  /** The slug the entry is stored under. A persisted entry's slug is
   *  its identity: it never changes (title edits do NOT regenerate
   *  it), so a per-entry save always updates THAT entry and can never
   *  fork a duplicate under a fresh slug. */
  persistedSlug: string;
  /** Stable client-side identity for the card's open/closed state —
   *  assigned once when the card is created and preserved across
   *  saves, so collapsing never jumps between cards. */
  uiId: string;
  /** Canonical JSON of the entry's comparable state as last loaded
   *  from / saved to the server. The save-guard popup keys off the
   *  form differing from this snapshot. Empty for unsaved entries. */
  savedJson: string;
  /** The entry's full state as last loaded/saved — "Make new one"
   *  reverts the original card's form to this once its edits have
   *  been moved into the clone. Null for unsaved entries. */
  savedState: ServiceEntryState | null;
}

let uiIdCounter = 0;
const nextUiId = (): string => `svc-new-${++uiIdCounter}`;

/** The comparable projection of an entry for the save-guard dirty
 *  check: everything the form can change EXCEPT the Active toggle
 *  (the toggle has its own behaviour and never triggers the popup)
 *  and bookkeeping fields. Credential fields hold their displayed
 *  (masked) strings — an untouched field therefore compares EQUAL to
 *  its snapshot, while any typed change differs. */
const comparableEntryJson = (entry: ServiceEntryState): string =>
  JSON.stringify({
    title: entry.title,
    usageType: entry.usageType,
    subService: entry.subService,
    serviceSlug: entry.serviceSlug,
    baseUrl: entry.baseUrl,
    authType: entry.authType,
    authApiKey: entry.authApiKey,
    authHeaderKey: entry.authHeaderKey,
    authUsername: entry.authUsername,
    authPassword: entry.authPassword,
    fields: Object.fromEntries(
      Object.entries(entry.fields).sort(([a], [b]) => a.localeCompare(b)),
    ),
    customFields: entry.customFields.map((pair) => ({
      key: pair.key,
      value: pair.value,
      secret: pair.secret,
      isActive: pair.isActive,
    })),
    endpoints: entry.endpoints.map((endpoint) => ({
      name: endpoint.name,
      path: endpoint.path,
      method: endpoint.method,
    })),
  });

/** True when a SAVED entry's form differs from its last-saved state. */
const entryIsDirty = (entry: ServiceEntryState): boolean =>
  entry.persisted && entry.savedJson !== "" && comparableEntryJson(entry) !== entry.savedJson;

const entryCategory = (entry: ServiceEntryState): string => {
  const def = subServiceById(entry.subService);
  if (def) {
    // A "custom" sub-service exists in several categories (the Custom
    // category itself, plus Payment and Shipping, where it sits last
    // in the list). Its category is whatever the entry itself stores —
    // a custom payment gateway belongs to PAYMENT, not to CUSTOM.
    if (def.id === "custom" && SERVICE_CATALOGUE.some((category) => category.id === entry.usageType)) {
      return entry.usageType;
    }
    for (const category of SERVICE_CATALOGUE) {
      if (category.subServices.some((sub) => sub.id === def.id)) return category.id;
    }
  }
  if (SERVICE_CATALOGUE.some((category) => category.id === entry.usageType)) return entry.usageType;
  return "CUSTOM";
};

const entryFromApi = (item: Record<string, unknown>): ServiceEntryState => {
  const auth = (item.authCredentials as Record<string, unknown>) || {};
  const rawFields = (item.fields as Record<string, unknown>) || {};
  const fields: Record<string, string> = {};
  // Every value the API returns is already masked server-side (stars +
  // last 4). The form displays that masked string verbatim — there is
  // no unmasking anywhere on the client. "configured" simply records
  // that a value is stored for the slot.
  const configuredSecrets: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    fields[key] = String(value ?? "");
    if (fields[key] !== "") configuredSecrets[key] = true;
  }
  const apiKeyRaw = String(auth.apiKey ?? "");
  const passwordRaw = String(auth.password ?? "");
  const entry: ServiceEntryState = {
    usageType: String(item.usageType ?? "API"),
    subService: String(item.subService ?? ""),
    serviceSlug: String(item.serviceSlug ?? ""),
    title: String(item.title ?? ""),
    baseUrl: String(item.baseUrl ?? ""),
    authType: (item.authType as AuthType) || "NONE",
    authApiKey: apiKeyRaw,
    authApiKeyConfigured: apiKeyRaw !== "",
    authHeaderKey: String(auth.headerKey ?? "Authorization"),
    authUsername: String(auth.username ?? ""),
    authPassword: passwordRaw,
    authPasswordConfigured: passwordRaw !== "",
    fields,
    configuredSecrets,
    customFields: Array.isArray(item.customFields)
      ? (item.customFields as Array<Record<string, unknown>>).map((pair) => ({
          key: String(pair.key ?? ""),
          value: String(pair.value ?? ""),
          secret: Boolean(pair.secret),
          configured: String(pair.value ?? "") !== "",
          isActive: pair.isActive !== false,
        }))
      : [],
    endpoints: Array.isArray(item.endpoints)
      ? (item.endpoints as DynamicEndpoint[])
      : [{ name: "default", path: "/", method: "POST" }],
    isConnected: item.isConnected !== false,
    persisted: true,
    persistedSlug: String(item.serviceSlug ?? ""),
    uiId: `svc-${String(item.serviceSlug ?? "")}`,
    savedJson: "",
    savedState: null,
  };
  // The freshly loaded state IS the last-saved state — snapshot it so
  // the save-guard dirty check compares later edits against exactly
  // what the server holds.
  entry.savedJson = comparableEntryJson(entry);
  entry.savedState = { ...entry, savedState: null };
  return entry;
};

const entryToApi = (entry: ServiceEntryState): Record<string, unknown> => {
  const def = subServiceById(entry.subService);
  const isPreset = Boolean(def && def.id !== "custom");
  const fields: Record<string, string> = {};
  if (def && isPreset) {
    for (const field of def.fields) fields[field.key] = entry.fields[field.key] ?? "";
  }
  return {
    // Presets take their category from the definition; a "custom"
    // sub-service takes it from the entry itself (its tab) — so a
    // custom gateway saved from the Payment tab stores PAYMENT, and
    // one from the API tab's Custom category stores CUSTOM.
    usageType: isPreset || entry.subService === "custom" ? entryCategory(entry) : entry.usageType,
    subService: entry.subService,
    serviceSlug: entry.serviceSlug,
    title: entry.title,
    baseUrl: isPreset ? "" : entry.baseUrl,
    authType: isPreset ? "NONE" : entry.authType,
    authCredentials: {
      apiKey: entry.authApiKey,
      headerKey: entry.authHeaderKey,
      username: entry.authUsername,
      ["password"]: entry.authPassword,
    },
    fields,
    customFields: isPreset
      ? []
      : entry.customFields.map((pair) => ({ key: pair.key, value: pair.value, secret: pair.secret, isActive: pair.isActive })),
    endpoints: isPreset
      ? (def?.endpoints ?? []).map((endpoint) => ({ ...endpoint }))
      : entry.endpoints,
    webhooks: [],
    isConnected: entry.isConnected,
  };
};

/** A preset entry counts as configured when every field of its
 *  definition holds a value — typed now or already stored (masked). */
const entryConfigured = (entry: ServiceEntryState): boolean => {
  const def = subServiceById(entry.subService);
  if (def && def.id !== "custom") {
    return def.fields
      .filter((field) => field.required)
      .every((field) => (entry.fields[field.key] ?? "") !== "" || entry.configuredSecrets[field.key]);
  }
  return entry.baseUrl.trim() !== "";
};

/**
 * The service builder — ONE component behind three tabs, all reading
 * and writing the same integrations store through the same gate:
 * API / Integrations (every category except Payment + Shipping),
 * Payment Methods (Payment only) and Shipping (Shipping only).
 *
 * Every entry is managed on its OWN card: its own Save button (a
 * per-entry API write that touches only that entry), its own Test
 * button (saves the entry, then runs it through the backend runner),
 * its own Active toggle and its own remove. ALL feedback — validation
 * problems, save results, test results — goes through the Toast
 * system; this panel renders NO inline alert/banner bars.
 */
function ServiceBuilderPanel({
  data,
  categoryIds,
  title,
  description,
  onSync,
}: {
  data?: Array<Record<string, unknown>>;
  categoryIds: string[];
  title: string;
  description: string;
  onSync: (integrations: Array<Record<string, unknown>>) => void;
}) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<ServiceEntryState[]>(() => (data ?? []).map(entryFromApi));
  const [busy, setBusy] = useState<Record<number, "save" | "test" | "delete">>({});
  // Collapsible cards: saved entries start CLOSED (a single header
  // bar); only cards whose uiId is in this set render their form.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const toggleOpen = (uiId: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(uiId)) next.delete(uiId);
      else next.add(uiId);
      return next;
    });

  const allowedCategories = SERVICE_CATALOGUE.filter((category) => categoryIds.includes(category.id));
  // A tab bound to exactly ONE category (Payment Methods, Shipping):
  // the category comes from the tab, so the entry form shows no
  // Service selector — only Sub-Service.
  const fixedCategory = categoryIds.length === 1 ? allowedCategories[0] : undefined;
  const visible = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => categoryIds.includes(entryCategory(entry)));

  const updateEntry = (index: number, patch: Partial<ServiceEntryState>) =>
    setEntries((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));

  const updateField = (index: number, key: string, value: string) =>
    updateEntry(index, { fields: { ...entries[index].fields, [key]: value } });

  const changeService = (index: number, categoryId: string) => {
    const category = categoryById(categoryId);
    const firstSub = category?.subServices[0];
    if (!firstSub) return;
    const fields: Record<string, string> = {};
    for (const field of firstSub.fields) {
      if (field.default) fields[field.key] = field.default;
    }
    updateEntry(index, {
      usageType: categoryId,
      subService: firstSub.id,
      fields,
      configuredSecrets: {},
      endpoints: [{ name: "default", path: "/", method: "POST" }],
    });
  };

  const changeSubService = (index: number, subId: string) => {
    const def = subServiceById(subId);
    if (!def) return;
    const fields: Record<string, string> = {};
    for (const field of def.fields) {
      if (field.default) fields[field.key] = field.default;
    }
    updateEntry(index, { subService: subId, fields, configuredSecrets: {} });
  };

  const addEndpoint = (index: number) => {
    const updated = [...entries];
    updated[index] = {
      ...updated[index],
      endpoints: [...updated[index].endpoints, { name: "", path: "/", method: "POST" }],
    };
    setEntries(updated);
  };

  const updateEndpoint = (index: number, endpointIndex: number, patch: Partial<DynamicEndpoint>) => {
    const updated = [...entries];
    const endpoints = [...updated[index].endpoints];
    endpoints[endpointIndex] = { ...endpoints[endpointIndex], ...patch };
    updated[index] = { ...updated[index], endpoints };
    setEntries(updated);
  };

  const removeEndpoint = (index: number, endpointIndex: number) => {
    const updated = [...entries];
    updated[index] = {
      ...updated[index],
      endpoints: updated[index].endpoints.filter((_, idx) => idx !== endpointIndex),
    };
    setEntries(updated);
  };

  const addPair = (index: number) =>
    updateEntry(index, {
      customFields: [...entries[index].customFields, { key: "", value: "", secret: false, configured: false, isActive: true }],
    });

  const updatePair = (index: number, pairIndex: number, patch: Partial<CustomPairState>) => {
    const customFields = [...entries[index].customFields];
    customFields[pairIndex] = { ...customFields[pairIndex], ...patch };
    updateEntry(index, { customFields });
  };

  const removePair = (index: number, pairIndex: number) =>
    updateEntry(index, {
      customFields: entries[index].customFields.filter((_, idx) => idx !== pairIndex),
    });

  /** One entry's problems, worded for a toast (never an inline bar). */
  const validateEntry = (item: ServiceEntryState): string => {
    const label = item.title || t("This service");
    if (!item.title.trim()) return t("A service title is required before saving.");
    if (!item.serviceSlug.trim()) return t("{label}: a unique service slug is required.").replace("{label}", label);
    if (entries.some((other) => other !== item && other.serviceSlug.trim() === item.serviceSlug.trim())) {
      return t("{label}: the slug \"{slug}\" is already used by another service — slugs must be unique.").replace("{label}", label).replace("{slug}", item.serviceSlug);
    }
    const def = subServiceById(item.subService);
    const isPreset = Boolean(def && def.id !== "custom");
    if (!isPreset) {
      if (!item.baseUrl.trim()) return t("{label}: a base API URL is required for custom services.").replace("{label}", label);
      for (const endpoint of item.endpoints) {
        if (!endpoint.name.trim()) return t("{label}: every endpoint needs an action name.").replace("{label}", label);
        if (!endpoint.path.trim()) return t("{label}: every endpoint needs a path.").replace("{label}", label);
      }
      for (const pair of item.customFields) {
        if (!pair.key.trim() && pair.value.trim()) return t("{label}: every key-value pair needs a key.").replace("{label}", label);
      }
    }
    return "";
  };

  const saveEntry = async (index: number): Promise<boolean> => {
    const item = entries[index];
    const problem = validateEntry(item);
    if (problem) {
      toast.error(problem);
      return false;
    }
    setBusy((current) => ({ ...current, [index]: "save" }));
    try {
      const result = await settingsService.saveIntegration(
        entryToApi(item),
        item.persisted ? item.persistedSlug : undefined,
      );
      if (result.integration) {
        const saved = entryFromApi(result.integration);
        // The card keeps its client identity (and open/closed state)
        // across the save — only its data is refreshed.
        saved.uiId = item.uiId;
        setEntries((current) => current.map((entry, idx) => (idx === index ? saved : entry)));
      } else {
        updateEntry(index, {
          persisted: true,
          persistedSlug: item.serviceSlug,
          savedJson: comparableEntryJson(item),
          savedState: { ...item, savedState: null },
        });
      }
      onSync(result.integrations);
      toast.success(t("{title} saved.").replace("{title}", item.title));
      return true;
    } catch (saveError) {
      toast.error(extractApiError(saveError));
      return false;
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    }
  };

  /** "Make new one" from the save-guard popup: a NEW entry is created
   *  from the form's CURRENT state (the saved data plus the pending
   *  edits); the original entry is not written at all. The clone goes
   *  through the normal create path under a fresh unique slug, and
   *  the payload names the source via `cloneFromSlug` so the backend
   *  resolves the clone's masked values against the SOURCE's stored
   *  values — the clone is stored with the real credentials and the
   *  original stays byte-identical. */
  const makeNewEntry = async (index: number): Promise<boolean> => {
    const item = entries[index];
    const usedSlugs = new Set(entries.map((entry) => entry.serviceSlug.trim()));
    let suffix = 2;
    let cloneSlug = `${item.persistedSlug}-${suffix}`;
    while (usedSlugs.has(cloneSlug)) {
      suffix += 1;
      cloneSlug = `${item.persistedSlug}-${suffix}`;
    }
    const clone: ServiceEntryState = {
      ...item,
      serviceSlug: cloneSlug,
      persisted: false,
      persistedSlug: "",
      uiId: nextUiId(),
      savedJson: "",
      savedState: null,
    };
    const problem = validateEntry(clone);
    if (problem) {
      toast.error(problem);
      return false;
    }
    setBusy((current) => ({ ...current, [index]: "save" }));
    try {
      const payload = { ...entryToApi(clone), cloneFromSlug: item.persistedSlug };
      const result = await settingsService.saveIntegration(payload, undefined);
      if (result.integration) {
        const savedClone = entryFromApi(result.integration);
        savedClone.uiId = clone.uiId;
        setEntries((current) => {
          // The edits now live in the clone — the original card's
          // form reverts to its last-saved state (its saved data was
          // never written), keeping its uiId and open state.
          const reverted = current.map((entry, idx) =>
            idx === index && entry.savedState
              ? { ...entry.savedState, uiId: entry.uiId, savedState: entry.savedState }
              : entry,
          );
          return [...reverted, savedClone];
        });
        // The clone opens; the original keeps its own open state.
        setOpenIds((current) => new Set(current).add(clone.uiId));
      }
      onSync(result.integrations);
      toast.success(t("{title} saved.").replace("{title}", clone.title));
      return true;
    } catch (saveError) {
      toast.error(extractApiError(saveError));
      return false;
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    }
  };

  /** The Save button's guard (Ahsan's order): saving a CHANGED entry
   *  that is already configured first asks — Cancel (keep editing,
   *  nothing saved), "Change this one" (save onto this entry), or
   *  "Make new one" (clone the form into a new entry). An unchanged
   *  saved entry and a brand-new entry save directly, no popup. The
   *  Test button and the Active toggle never pass through here. */
  const handleSaveClick = async (index: number) => {
    const item = entries[index];
    if (!entryIsDirty(item)) {
      await saveEntry(index);
      return;
    }
    const problem = validateEntry(item);
    if (problem) {
      toast.error(problem);
      return;
    }
    const choice = await choiceDialog({
      title: t("Already configured"),
      message: t("{title} is already configured. It's better to create a new one — changing this one replaces the saved configuration everywhere it is used.").replace("{title}", item.title),
      confirmLabel: t("Change this one"),
      altLabel: t("Make new one"),
      cancelLabel: t("Cancel"),
    });
    if (choice === "confirm") await saveEntry(index);
    else if (choice === "alt") await makeNewEntry(index);
  };

  // Test runs the SAVED configuration through the backend runner —
  // the entry is saved first (its own per-entry save), so what is
  // tested is exactly what is stored. The outcome is a toast.
  const testEntry = async (index: number) => {
    const item = entries[index];
    const def = subServiceById(item.subService);
    const isPreset = Boolean(def && def.id !== "custom");
    const endpointName = isPreset ? (def?.endpoints[0]?.name ?? "config") : item.endpoints[0]?.name;
    if (!endpointName) {
      toast.error(t("{title}: add an endpoint before testing.").replace("{title}", item.title || t("This service")));
      return;
    }
    setBusy((current) => ({ ...current, [index]: "test" }));
    try {
      const saved = await saveEntry(index);
      if (!saved) return;
      const result = await settingsService.executeIntegration(item.serviceSlug, endpointName);
      const summary = JSON.stringify(result.data ?? result).slice(0, 220);
      toast.success(t("{title}: connection works — {summary}").replace("{title}", item.title).replace("{summary}", summary));
    } catch (testError) {
      toast.error(extractApiError(testError).slice(0, 300));
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    }
  };

  const removeEntry = async (index: number) => {
    const item = entries[index];
    if (!item.persisted) {
      setEntries((current) => current.filter((_, idx) => idx !== index));
      return;
    }
    const confirmed = await confirmDialog({
      title: t("Remove {title}?").replace("{title}", item.title || t("this service")),
      message: t("Its saved configuration will be deleted. This cannot be undone."),
      confirmLabel: t("Remove"),
      variant: "danger",
    });
    if (!confirmed) return;
    setBusy((current) => ({ ...current, [index]: "delete" }));
    try {
      const result = await settingsService.deleteIntegration(item.serviceSlug);
      setEntries((current) => current.filter((_, idx) => idx !== index));
      onSync(result.integrations);
      toast.success(t("{title} removed.").replace("{title}", item.title));
    } catch (removeError) {
      toast.error(extractApiError(removeError));
    } finally {
      setBusy((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
    }
  };

  const addEntry = () => {
    const base: ServiceEntryState = {
      usageType: "CUSTOM",
      subService: "custom",
      serviceSlug: "",
      title: "",
      baseUrl: "",
      authType: "NONE",
      authApiKey: "",
      authApiKeyConfigured: false,
      authHeaderKey: "Authorization",
      authUsername: "",
      authPassword: "",
      authPasswordConfigured: false,
      fields: {},
      configuredSecrets: {},
      customFields: [],
      endpoints: [{ name: "default", path: "/", method: "POST" }],
      isConnected: true,
      persisted: false,
      persistedSlug: "",
      uiId: nextUiId(),
      savedJson: "",
      savedState: null,
    };
    let fresh = base;
    if (!categoryIds.includes("CUSTOM") && allowedCategories.length > 0) {
      const firstCategory = allowedCategories[0];
      const firstSub = firstCategory.subServices[0];
      const fields: Record<string, string> = {};
      if (firstSub) {
        for (const field of firstSub.fields) {
          if (field.default) fields[field.key] = field.default;
        }
      }
      fresh = {
        ...base,
        usageType: firstCategory.id,
        subService: firstSub?.id ?? "custom",
        fields,
      };
    }
    setEntries([...entries, fresh]);
    // A newly added (unsaved) card starts OPEN.
    setOpenIds((current) => new Set(current).add(fresh.uiId));
  };

  return (
    <SettingsCard title={t(title)} description={description}>
      <div className="space-y-6">
        {visible.map(({ entry: item, index }) => {
          const def = subServiceById(item.subService);
          const isPreset = Boolean(def && def.id !== "custom");
          const category = entryCategory(item);
          const categoryDef = categoryById(category);
          const configured = entryConfigured(item);
          const entryBusy = busy[index];
          const isOpen = openIds.has(item.uiId);
          return (
            <div key={index} className={`rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 ${isOpen ? "p-5 space-y-4" : "px-5 py-4"}`}>
              <div className={`flex items-center justify-between ${isOpen ? "border-b border-[var(--border)] pb-3" : ""}`}>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[var(--primary)]" />
                  <span className="font-semibold text-sm text-[var(--text)]">
                    {item.title || t("New Service")}
                  </span>
                  <span className="ml-2 rounded-md bg-[var(--primary-light)]/20 px-2 py-0.5 text-xs text-[var(--primary)] border border-[var(--primary)]/30 font-medium">
                    {def ? def.name : item.usageType}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs border font-medium ${
                      configured
                        ? "bg-green-500/10 text-green-700 border-green-500/40"
                        : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]"
                    }`}
                  >
                    {configured ? t("Configured") : t("Not configured")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)]">{t("Active")}</span>
                  <SettingsToggle
                    label="Active"
                    enabled={item.isConnected}
                    onChange={(isConnected) => updateEntry(index, { isConnected })}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={isOpen ? ChevronUp : ChevronDown}
                    title={isOpen ? t("Collapse") : t("Expand")}
                    aria-label={isOpen ? t("Collapse") : t("Expand")}
                    aria-expanded={isOpen}
                    onClick={() => toggleOpen(item.uiId)}
                  />
                </div>
              </div>

              {isOpen && (
              <>

              {/* Title / (Service) / Slug / Sub-Service. In the
                  single-category tabs (Payment Methods, Shipping) the
                  category is fixed by the tab itself, so there is NO
                  Service dropdown — the form goes Title → Slug →
                  Sub-Service (Ahsan's order). The API / Integrations
                  tab spans categories and keeps both selectors. The
                  saved entry still stores the tab's category: it is
                  derived from the chosen sub-service's definition. */}
              <div className={`grid grid-cols-1 gap-4 ${fixedCategory ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
                <SettingsInput
                  label="Service Title"
                  placeholder="e.g. My Cloudinary Storage"
                  value={item.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    const slugEdited =
                      item.serviceSlug.trim() !== "" &&
                      item.serviceSlug !== slugifyTitle(item.title);
                    updateEntry(index, {
                      title,
                      // The slug auto-derives from the title only
                      // while the entry is NEW. Once saved, the slug
                      // is the entry's identity and never regenerates
                      // — a rename updates the same entry.
                      ...(slugEdited || item.persisted ? {} : { serviceSlug: slugifyTitle(title) }),
                    });
                  }}
                />
                {!fixedCategory && (
                  <SettingsSelect
                    label="Service"
                    value={category}
                    options={allowedCategories.map((c) => ({ label: t(c.label), value: c.id }))}
                    onChange={(value) => changeService(index, value)}
                  />
                )}
                <SettingsInput
                  label="Service Slug (Unique)"
                  placeholder="e.g. my-service"
                  value={item.serviceSlug}
                  disabled={item.persisted}
                  title={item.persisted ? t("The slug is this service's identity — it is set when the service is first saved and does not change.") : undefined}
                  onChange={(e) => updateEntry(index, { serviceSlug: e.target.value })}
                />
                <SettingsSelect
                  label="Sub-Service"
                  value={item.subService || "custom"}
                  options={(categoryDef?.subServices ?? []).map((sub) => ({ label: sub.name, value: sub.id }))}
                  onChange={(value) => changeSubService(index, value)}
                />
              </div>

              <p className="text-xs text-[var(--text-muted)]">{t(MASKED_VALUES_NOTE)}</p>

              {isPreset && def ? (
                <>
                  <p className="text-xs text-[var(--text-muted)]">
                    {def.hasFixedBase
                      ? t("Calls go to {name}'s fixed API address with exactly these saved credentials — there is no URL to type, so this service can only ever talk to {name}.").replaceAll("{name}", def.name)
                      : t("{name} has no HTTP API base of its own — these saved values are what the store uses for it.").replace("{name}", def.name)}
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
                    {def.fields.map((field) =>
                      field.type === "select" ? (
                        <SettingsSelect
                          key={field.key}
                          label={field.label}
                          value={item.fields[field.key] ?? field.default ?? ""}
                          options={(() => {
                            // A saved entry's value arrives MASKED from
                            // the API (stars + last 4), which matches no
                            // option — surface the mask itself as the
                            // current selection so it displays instead
                            // of a blank; picking a real option replaces
                            // it, leaving it submits the mask and the
                            // backend keeps the stored value.
                            const opts = field.options ?? [];
                            const current = item.fields[field.key] ?? field.default ?? "";
                            const base = opts.map((option) => ({ label: t(option), value: option }));
                            return current && !opts.includes(current)
                              ? [{ label: current, value: current }, ...base]
                              : base;
                          })()}
                          onChange={(value) => updateField(index, field.key, value)}
                        />
                      ) : (
                        <SettingsInput
                          key={field.key}
                          label={field.label}
                          // Always a text input: credential values are
                          // displayed MASKED (stars + last 4), and a
                          // number input cannot render the mask.
                          type={field.secret ? "password" : "text"}
                          inputMode={field.type === "number" ? "numeric" : undefined}
                          value={item.fields[field.key] ?? ""}
                          placeholder={field.placeholder}
                          autoComplete={field.secret ? "new-password" : "off"}
                          onChange={(e) => updateField(index, field.key, e.target.value)}
                        />
                      ),
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Custom / generic connector: admin-typed base URL,
                      generic auth, endpoints and key-value pairs. */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SettingsInput
                      label="Base API URL"
                      placeholder="https://api.example.com"
                      value={item.baseUrl}
                      onChange={(e) => updateEntry(index, { baseUrl: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 bg-[var(--background)] p-3 rounded-lg border border-[var(--border)]">
                    <SettingsSelect
                      label="Auth Type"
                      value={item.authType}
                      options={["NONE", "API_KEY", "BEARER_TOKEN", "BASIC", "CUSTOM_HEADER"]}
                      onChange={(authType) => updateEntry(index, { authType: authType as AuthType })}
                    />
                    {item.authType === "API_KEY" && (
                      <>
                        <SettingsInput
                          label="Header Name"
                          placeholder="X-API-Key"
                          value={item.authHeaderKey}
                          onChange={(e) => updateEntry(index, { authHeaderKey: e.target.value })}
                        />
                        <SettingsInput
                          label="API Key"
                          type="password"
                          value={item.authApiKey}
                          placeholder="Paste the API key — shown masked after saving"
                          onChange={(e) => updateEntry(index, { authApiKey: e.target.value })}
                        />
                      </>
                    )}
                    {item.authType === "BEARER_TOKEN" && (
                      <SettingsInput
                        label="Bearer Token"
                        type="password"
                        value={item.authApiKey}
                        placeholder="Paste the token — shown masked after saving"
                        onChange={(e) => updateEntry(index, { authApiKey: e.target.value })}
                      />
                    )}
                    {item.authType === "BASIC" && (
                      <>
                        <SettingsInput
                          label="Username"
                          placeholder="e.g. mail@yourdomain.com"
                          value={item.authUsername}
                          onChange={(e) => updateEntry(index, { authUsername: e.target.value })}
                        />
                        <SettingsInput
                          label="Password"
                          type="password"
                          value={item.authPassword}
                          placeholder="Paste the password — shown masked after saving"
                          onChange={(e) => updateEntry(index, { authPassword: e.target.value })}
                        />
                      </>
                    )}
                    {item.authType === "CUSTOM_HEADER" && (
                      <>
                        <SettingsInput
                          label="Header Name"
                          placeholder="X-Custom-Auth"
                          value={item.authHeaderKey}
                          onChange={(e) => updateEntry(index, { authHeaderKey: e.target.value })}
                        />
                        <SettingsInput
                          label="Header Value"
                          type="password"
                          value={item.authApiKey}
                          placeholder="Paste the header value — shown masked after saving"
                          onChange={(e) => updateEntry(index, { authApiKey: e.target.value })}
                        />
                      </>
                    )}
                  </div>

                  {/* Key-value pairs — the Custom service's own fields.
                      Each pair has a Secret TOGGLE (its value is then
                      masked on read) and its own ON/OFF toggle: an
                      OFF pair stays saved but is never used. */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[var(--text-soft)] flex items-center gap-1">
                        <KeyRound className="h-3.5 w-3.5" /> {t("Key-Value Pairs")}
                      </span>
                      <Button variant="outline" size="sm" icon={Plus} onClick={() => addPair(index)}>
                        {t("Add Pair")}
                      </Button>
                    </div>
                    {item.customFields.length === 0 && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {t("No key-value pairs yet — add the fields this service needs. Toggle a pair Secret to keep its value masked, and OFF to keep it saved but unused.")}
                      </p>
                    )}
                    <div className="space-y-2">
                      {item.customFields.map((pair, pairIdx) => (
                        <div key={pairIdx} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-end bg-[var(--background)] p-3 rounded-md border border-[var(--border)]">
                          <SettingsInput
                            label="Key"
                            placeholder="Key (e.g. region)"
                            value={pair.key}
                            onChange={(e) => updatePair(index, pairIdx, { key: e.target.value })}
                          />
                          <SettingsInput
                            label="Value"
                            type={pair.secret ? "password" : "text"}
                            value={pair.value}
                            placeholder="Value (e.g. eu)"
                            onChange={(e) => updatePair(index, pairIdx, { value: e.target.value })}
                          />
                          <div className="flex flex-col items-center gap-1 pb-1">
                            <span className="text-[10px] font-medium text-[var(--text-muted)]">{t("Secret")}</span>
                            <SettingsToggle
                              label={t("Pair {name} secret").replace("{name}", String(pair.key || pairIdx))}
                              enabled={pair.secret}
                              onChange={(secret) => updatePair(index, pairIdx, { secret })}
                            />
                          </div>
                          <div className="flex flex-col items-center gap-1 pb-1">
                            <span className="text-[10px] font-medium text-[var(--text-muted)]">{t("On")}</span>
                            <SettingsToggle
                              label={t("Pair {name} active").replace("{name}", String(pair.key || pairIdx))}
                              enabled={pair.isActive}
                              onChange={(isActive) => updatePair(index, pairIdx, { isActive })}
                            />
                          </div>
                          <div className="flex justify-end pb-1">
                            <Button variant="danger" size="sm" icon={Trash2} onClick={() => removePair(index, pairIdx)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Endpoints */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[var(--text-soft)] flex items-center gap-1">
                        <Code2 className="h-3.5 w-3.5" /> {t("Service Endpoints")}
                      </span>
                      <Button variant="outline" size="sm" icon={Plus} onClick={() => addEndpoint(index)}>
                        {t("Add Endpoint")}
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
                          <div className="flex justify-end gap-2 pb-1">
                            <Button variant="danger" size="sm" icon={Trash2} onClick={() => removeEndpoint(index, epIdx)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Per-entry actions: Delete on the LEFT of the row
                  (it moved out of the header — the header now carries
                  the open/close chevron instead), THIS entry's own
                  Test + Save on the right. */}
              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  title={t("Remove service")}
                  aria-label={t("Remove service")}
                  disabled={entryBusy === "delete"}
                  onClick={() => void removeEntry(index)}
                >
                  {t("Delete")}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void testEntry(index)}
                    disabled={entryBusy !== undefined}
                    icon={entryBusy === "test" ? LoaderCircle : Play}
                  >
                    {entryBusy === "test" ? t("Testing…") : t("Test")}
                  </Button>
                  <Button
                    onClick={() => void handleSaveClick(index)}
                    disabled={entryBusy !== undefined}
                    icon={entryBusy === "save" ? LoaderCircle : Save}
                  >
                    {entryBusy === "save" ? t("Saving...") : t("Save")}
                  </Button>
                </div>
              </div>
              </>
              )}
            </div>
          );
        })}

        {visible.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">{t("No services configured yet — add the first one below.")}</p>
        )}

        <Button variant="outline" icon={Plus} onClick={addEntry}>
          {t("Add New Service")}
        </Button>
      </div>
    </SettingsCard>
  );
}

function AppearancePanel({ data, saving, onSave }: SectionPanelProps<ObjectData>) {
  const { t } = useLanguage();
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

  const handleSave = () => {
    // The theme palette is NOT part of this form: the picker below
    // persists it through its own Apply → Keep flow, and the backend
    // merge leaves the stored palette untouched by this save.
    onSave(form);
  };

  return (
    <SettingsCard title="Appearance" description="Customize saved dashboard preferences">
      <SettingsSelect
        label="Theme"
        value={form.theme}
        options={["Light", "Dark", "System"]}
        onChange={(theme) => setForm({ ...form, theme })}
      />
      <div className="mt-5">
        <ThemePalettePicker data={data} />
      </div>
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
              <h3 className="text-sm font-medium text-[var(--text)]">{t(title)}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t(description)}</p>
            </div>
            <SettingsToggle
              label={title}
              enabled={form[key]}
              onChange={(enabled) => setBoolean(key, enabled)}
            />
          </div>
        ))}
      </div>
      <SettingsSaveButton onSave={handleSave} saving={saving} />
    </SettingsCard>
  );
}