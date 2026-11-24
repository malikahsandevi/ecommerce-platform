"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  SettingsCard,
  SettingsInput,
  SettingsSaveButton,
  SettingsSectionTitle,
  SettingsToggle,
} from "./SettingsControls";
import { useLanguage } from "@/services/i18n";
import type {
  CourierProfile,
  DeliveryOption,
  DeliveryZone,
  ShippingMethod,
  ShippingSettings,
} from "@/services/settingsService";

/**
 * Settings → Shipping — the store's ONE shipping management centre.
 * Three sides, one save (the page's per-save security check covers
 * the whole section, like every Settings save):
 *   1. Methods & Rates        — what shipping costs and when it is free
 *   2. Delivery Options & Areas — how orders reach customers, and the
 *      areas with their own charge
 *   3. Couriers & Automation  — the courier profiles (tracking link
 *      templates + optional live-tracking API credentials, masked
 *      like every credential in Settings), the one default courier,
 *      and the automation toggles.
 * The order flow prices and assigns through the SAME data on the
 * server (the shared shipping calculator), so what is set here is
 * exactly what orders do.
 */

interface MethodRow {
  id: string;
  name: string;
  charge: string;
  freeAbove: string;
  estimatedDays: string;
  isActive: boolean;
}

interface OptionRow {
  id: string;
  name: string;
  chargeAdjustment: string;
  isPickup: boolean;
  isActive: boolean;
  isBuiltIn: boolean;
}

interface ZoneRow {
  id: string;
  name: string;
  citiesText: string;
  chargeOverride: string;
  isActive: boolean;
}

interface CourierRow {
  id: string;
  name: string;
  trackingUrlTemplate: string;
  apiBaseUrl: string;
  apiKey: string;
  apiUsername: string;
  apiPassword: string;
  isActive: boolean;
  isBuiltIn: boolean;
}

interface CentreState {
  methods: MethodRow[];
  defaultMethodId: string;
  options: OptionRow[];
  zones: ZoneRow[];
  defaultOptionId: string;
  couriers: CourierRow[];
  defaultCourierId: string;
  autoAssignCourier: boolean;
  codPaidOnDelivery: boolean;
}

const numberText = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const fromData = (data?: ShippingSettings): CentreState => ({
  methods: (data?.methods || []).map((method) => ({
    id: method.id,
    name: method.name || "",
    charge: numberText(method.charge ?? 0),
    freeAbove: numberText(method.freeAbove),
    estimatedDays: method.estimatedDays || "",
    isActive: method.isActive !== false,
  })),
  defaultMethodId: data?.defaultMethodId || "",
  options: (data?.deliveryOptions || []).map((option) => ({
    id: option.id,
    name: option.name || "",
    chargeAdjustment: numberText(option.chargeAdjustment ?? 0),
    isPickup: Boolean(option.isPickup),
    isActive: option.isActive !== false,
    isBuiltIn: Boolean(option.isBuiltIn),
  })),
  zones: (data?.deliveryZones || []).map((zone) => ({
    id: zone.id,
    name: zone.name || "",
    citiesText: (zone.cities || []).join(", "),
    chargeOverride: numberText(zone.chargeOverride),
    isActive: zone.isActive !== false,
  })),
  defaultOptionId: data?.defaultDeliveryOptionId || "",
  couriers: (data?.couriers || []).map((courier) => ({
    id: courier.id,
    name: courier.name || "",
    trackingUrlTemplate: courier.trackingUrlTemplate || "",
    apiBaseUrl: courier.apiBaseUrl || "",
    apiKey: courier.apiKey || "",
    apiUsername: courier.apiUsername || "",
    apiPassword: courier.apiPassword || "",
    isActive: courier.isActive !== false,
    isBuiltIn: Boolean(courier.isBuiltIn),
  })),
  defaultCourierId: data?.defaultCourierId || "",
  autoAssignCourier: data?.autoAssignCourier !== false,
  codPaidOnDelivery: data?.codPaidOnDelivery !== false,
});

const parseAmount = (text: string): number => {
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseOptionalAmount = (text: string): number | null => {
  if (text.trim() === "") return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
};

const toPayload = (state: CentreState): ShippingSettings => ({
  methods: state.methods.map(
    (row): ShippingMethod => ({
      id: row.id,
      name: row.name.trim(),
      charge: Math.max(0, parseAmount(row.charge)),
      freeAbove: parseOptionalAmount(row.freeAbove),
      estimatedDays: row.estimatedDays.trim(),
      isActive: row.isActive,
    }),
  ),
  defaultMethodId: state.defaultMethodId,
  deliveryOptions: state.options.map(
    (row): DeliveryOption => ({
      id: row.id,
      name: row.name.trim(),
      chargeAdjustment: parseAmount(row.chargeAdjustment),
      isPickup: row.isPickup,
      isActive: row.isActive,
      isBuiltIn: row.isBuiltIn,
    }),
  ),
  deliveryZones: state.zones.map(
    (row): DeliveryZone => ({
      id: row.id,
      name: row.name.trim(),
      cities: row.citiesText
        .split(",")
        .map((city) => city.trim())
        .filter(Boolean),
      chargeOverride: parseOptionalAmount(row.chargeOverride),
      isActive: row.isActive,
    }),
  ),
  defaultDeliveryOptionId: state.defaultOptionId,
  couriers: state.couriers.map(
    (row): CourierProfile => ({
      id: row.id,
      name: row.name.trim(),
      trackingUrlTemplate: row.trackingUrlTemplate.trim(),
      apiBaseUrl: row.apiBaseUrl.trim(),
      apiKey: row.apiKey,
      apiUsername: row.apiUsername,
      apiPassword: row.apiPassword,
      isActive: row.isActive,
      isBuiltIn: row.isBuiltIn,
    }),
  ),
  defaultCourierId: state.defaultCourierId,
  autoAssignCourier: state.autoAssignCourier,
  codPaidOnDelivery: state.codPaidOnDelivery,
});

const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Small row furniture shared by every list in the centre. */
function RowShell({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("Remove")}
          title={t("Remove")}
          className="mt-1 shrink-0 cursor-pointer rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function ActiveToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-medium text-[var(--text-soft)]">{t("Active")}</span>
      <SettingsToggle label="Active" enabled={enabled} onChange={onChange} />
    </span>
  );
}

function DefaultButton({
  isDefault,
  onSet,
}: {
  isDefault: boolean;
  onSet: () => void;
}) {
  const { t } = useLanguage();
  if (isDefault) {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary-dark)]">
        {t("Default")}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onSet}
      className="cursor-pointer rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
    >
      {t("Set as Default")}
    </button>
  );
}

export default function ShippingCentrePanel({
  data,
  saving,
  onSave,
}: {
  data?: ShippingSettings;
  saving: boolean;
  onSave: (value: ShippingSettings) => void;
}) {
  const { t } = useLanguage();
  const [state, setState] = useState<CentreState>(() => fromData(data));

  // A save returns the stored document (secrets masked) — resync to
  // it so the panel shows exactly what is stored, masks included.
  useEffect(() => {
    setState(fromData(data));
  }, [data]);

  const patch = (partial: Partial<CentreState>) =>
    setState((current) => ({ ...current, ...partial }));

  type RowKey = "methods" | "options" | "zones" | "couriers";

  const updateRow = (key: RowKey, id: string, change: Record<string, unknown>) =>
    setState(
      (current) =>
        ({
          ...current,
          [key]: (current[key] as unknown as Array<Record<string, unknown>>).map((row) =>
            row.id === id ? { ...row, ...change } : row,
          ),
        }) as CentreState,
    );

  const removeRow = (key: RowKey, id: string) =>
    setState(
      (current) =>
        ({
          ...current,
          [key]: (current[key] as unknown as Array<Record<string, unknown>>).filter(
            (row) => row.id !== id,
          ),
        }) as CentreState,
    );

  return (
    <>
      {/* ── Side 1: Methods & Rates ─────────────────────────────── */}
      <SettingsCard
        title={t("Methods & Rates")}
        description={t("Shipping methods customers can choose, what each one charges, and when shipping becomes free.")}
      >
        <div className="space-y-3">
          {state.methods.length === 0 && (
            <p className="rounded-lg bg-[var(--surface)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
              {t("No shipping methods yet — orders carry no shipping charge until you add one.")}
            </p>
          )}
          {state.methods.map((row) => (
            <RowShell
              key={row.id}
              onRemove={() => {
                removeRow("methods", row.id);
                if (state.defaultMethodId === row.id) patch({ defaultMethodId: "" });
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SettingsInput
                  label="Method Name"
                  value={row.name}
                  onChange={(event) => updateRow("methods", row.id, { name: event.target.value })}
                  placeholder="e.g. Standard"
                />
                <SettingsInput
                  label="Charge"
                  type="number"
                  min={0}
                  value={row.charge}
                  onChange={(event) => updateRow("methods", row.id, { charge: event.target.value })}
                />
                <SettingsInput
                  label="Free Above (optional)"
                  type="number"
                  min={0}
                  value={row.freeAbove}
                  onChange={(event) => updateRow("methods", row.id, { freeAbove: event.target.value })}
                  placeholder="Never free"
                />
                <SettingsInput
                  label="Estimated Days"
                  value={row.estimatedDays}
                  onChange={(event) => updateRow("methods", row.id, { estimatedDays: event.target.value })}
                  placeholder="e.g. 2-3 days"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <ActiveToggle
                  enabled={row.isActive}
                  onChange={(enabled) => updateRow("methods", row.id, { isActive: enabled })}
                />
                <DefaultButton
                  isDefault={state.defaultMethodId === row.id}
                  onSet={() => patch({ defaultMethodId: row.id })}
                />
              </div>
            </RowShell>
          ))}
        </div>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() =>
              patch({
                methods: [
                  ...state.methods,
                  { id: newId("method"), name: "", charge: "", freeAbove: "", estimatedDays: "", isActive: true },
                ],
              })
            }
          >
            {t("Add Method")}
          </Button>
        </div>
      </SettingsCard>

      {/* ── Side 2: Delivery Options & Areas ────────────────────── */}
      <SettingsCard
        title={t("Delivery Options & Areas")}
        description={t("How orders reach customers — delivery options with their own charge adjustments, and the areas that carry their own delivery charge.")}
      >
        <SettingsSectionTitle title="Delivery Options" />
        <div className="mt-3 space-y-3">
          {state.options.map((row) => (
            <RowShell
              key={row.id}
              onRemove={() => {
                removeRow("options", row.id);
                if (state.defaultOptionId === row.id) patch({ defaultOptionId: "" });
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SettingsInput
                  label="Option Name"
                  value={row.name}
                  onChange={(event) => updateRow("options", row.id, { name: event.target.value })}
                  placeholder="e.g. Home Delivery"
                />
                <SettingsInput
                  label="Charge Adjustment"
                  type="number"
                  value={row.chargeAdjustment}
                  onChange={(event) => updateRow("options", row.id, { chargeAdjustment: event.target.value })}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <ActiveToggle
                  enabled={row.isActive}
                  onChange={(enabled) => updateRow("options", row.id, { isActive: enabled })}
                />
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-soft)]">{t("Pickup")}</span>
                  <SettingsToggle
                    label="Pickup"
                    enabled={row.isPickup}
                    onChange={(enabled) => updateRow("options", row.id, { isPickup: enabled })}
                  />
                </span>
                <DefaultButton
                  isDefault={state.defaultOptionId === row.id}
                  onSet={() => patch({ defaultOptionId: row.id })}
                />
                {row.isBuiltIn && (
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">{t("Built-in")}</span>
                )}
              </div>
              {row.isPickup && (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  {t("Pickup orders never pay a shipping charge.")}
                </p>
              )}
            </RowShell>
          ))}
        </div>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() =>
              patch({
                options: [
                  ...state.options,
                  { id: newId("option"), name: "", chargeAdjustment: "", isPickup: false, isActive: true, isBuiltIn: false },
                ],
              })
            }
          >
            {t("Add Option")}
          </Button>
        </div>

        <div className="mt-8">
          <SettingsSectionTitle title="Delivery Areas" />
          <div className="mt-3 space-y-3">
            {state.zones.map((row) => (
              <RowShell key={row.id} onRemove={() => removeRow("zones", row.id)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SettingsInput
                    label="Area Name"
                    value={row.name}
                    onChange={(event) => updateRow("zones", row.id, { name: event.target.value })}
                    placeholder="e.g. Punjab Cities"
                  />
                  <SettingsInput
                    label="Cities (comma separated)"
                    value={row.citiesText}
                    onChange={(event) => updateRow("zones", row.id, { citiesText: event.target.value })}
                    placeholder="e.g. Lahore, Multan"
                  />
                  <SettingsInput
                    label="Charge Override (optional)"
                    type="number"
                    min={0}
                    value={row.chargeOverride}
                    onChange={(event) => updateRow("zones", row.id, { chargeOverride: event.target.value })}
                    placeholder="Method charge"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <ActiveToggle
                    enabled={row.isActive}
                    onChange={(enabled) => updateRow("zones", row.id, { isActive: enabled })}
                  />
                </div>
              </RowShell>
            ))}
          </div>
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() =>
                patch({
                  zones: [
                    ...state.zones,
                    { id: newId("zone"), name: "", citiesText: "", chargeOverride: "", isActive: true },
                  ],
                })
              }
            >
              {t("Add Area")}
            </Button>
          </div>
        </div>
      </SettingsCard>

      {/* ── Side 3: Couriers & Automation ───────────────────────── */}
      <SettingsCard
        title={t("Couriers & Automation")}
        description={t("The couriers that carry your parcels, their tracking links and API connections, and the automation that keeps orders moving.")}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg bg-[var(--surface)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">{t("Auto-assign default courier")}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {t("When an order is confirmed, the default courier is assigned to it automatically.")}
              </p>
            </div>
            <SettingsToggle
              label="Auto-assign default courier"
              enabled={state.autoAssignCourier}
              onChange={(enabled) => patch({ autoAssignCourier: enabled })}
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg bg-[var(--surface)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">{t("Mark COD as Paid on delivery")}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {t("When a cash-on-delivery order is delivered, its payment is marked Paid automatically.")}
              </p>
            </div>
            <SettingsToggle
              label="Mark COD as Paid on delivery"
              enabled={state.codPaidOnDelivery}
              onChange={(enabled) => patch({ codPaidOnDelivery: enabled })}
            />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {state.couriers.map((row) => (
            <RowShell
              key={row.id}
              onRemove={() => {
                removeRow("couriers", row.id);
                if (state.defaultCourierId === row.id) patch({ defaultCourierId: "" });
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SettingsInput
                  label="Courier Name"
                  value={row.name}
                  onChange={(event) => updateRow("couriers", row.id, { name: event.target.value })}
                  placeholder="e.g. TCS"
                />
                <SettingsInput
                  label="API Base URL (optional)"
                  value={row.apiBaseUrl}
                  onChange={(event) => updateRow("couriers", row.id, { apiBaseUrl: event.target.value })}
                  placeholder="For live tracking sync"
                />
                <div className="sm:col-span-2">
                  <SettingsInput
                    label="Tracking URL Template"
                    value={row.trackingUrlTemplate}
                    onChange={(event) => updateRow("couriers", row.id, { trackingUrlTemplate: event.target.value })}
                    placeholder="Use {tracking} where the tracking number goes."
                  />
                </div>
                <SettingsInput
                  label="API Key"
                  type="password"
                  value={row.apiKey}
                  onChange={(event) => updateRow("couriers", row.id, { apiKey: event.target.value })}
                  placeholder="Paste the API key — hidden after saving"
                />
                <SettingsInput
                  label="API Username"
                  value={row.apiUsername}
                  onChange={(event) => updateRow("couriers", row.id, { apiUsername: event.target.value })}
                />
                <SettingsInput
                  label="API Password"
                  type="password"
                  value={row.apiPassword}
                  onChange={(event) => updateRow("couriers", row.id, { apiPassword: event.target.value })}
                  placeholder="Paste the API password — hidden after saving"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <ActiveToggle
                  enabled={row.isActive}
                  onChange={(enabled) => updateRow("couriers", row.id, { isActive: enabled })}
                />
                <DefaultButton
                  isDefault={state.defaultCourierId === row.id}
                  onSet={() => patch({ defaultCourierId: row.id })}
                />
                {row.isBuiltIn && (
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">{t("Built-in")}</span>
                )}
              </div>
            </RowShell>
          ))}
        </div>
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() =>
              patch({
                couriers: [
                  ...state.couriers,
                  {
                    id: newId("courier"),
                    name: "",
                    trackingUrlTemplate: "",
                    apiBaseUrl: "",
                    apiKey: "",
                    apiUsername: "",
                    apiPassword: "",
                    isActive: true,
                    isBuiltIn: false,
                  },
                ],
              })
            }
          >
            {t("Add Courier")}
          </Button>
        </div>

        <SettingsSaveButton saving={saving} onSave={() => onSave(toPayload(state))} />
      </SettingsCard>
    </>
  );
}
