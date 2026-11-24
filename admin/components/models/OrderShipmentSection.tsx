"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { apiClient, extractApiError } from "@/services/api";
import { toast } from "@/components/ui/Toast";
import { useLanguage } from "@/services/i18n";
import type { Order } from "@/config/orderConfig";

interface CourierOption {
  id: string;
  name: string;
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mb-1 block border-t border-[var(--border)] pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
    {children}
  </span>
);

/**
 * The order detail's Shipment section: the courier riding with this
 * order (editable — the house Select over the ACTIVE couriers from
 * Settings → Shipping), its tracking number (editable), the courier
 * tracking link the API computes from the courier's template, the
 * shipped/delivered stamps, and a "Sync tracking" button that asks
 * the courier for the parcel's current status. Sync outcomes come
 * back as one plain message — shown as a simple status toast, per
 * the toast rule (main point only).
 */
export const OrderShipmentSection: React.FC<{
  order: Order;
  onOrderUpdated: (order: Order) => void;
}> = ({ order, onOrderUpdated }) => {
  const { t } = useLanguage();
  const [current, setCurrent] = useState<Order>(order);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [courierId, setCourierId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // A different order opened → the section follows it.
  useEffect(() => {
    setCurrent(order);
    setTrackingNumber(order.trackingNumber || "");
    setCourierId(order.courierId || "");
  }, [order]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/orders/shipping-options")
      .then(({ data }) => {
        if (cancelled) return;
        const list: CourierOption[] = data?.couriers || [];
        setCouriers(list);
        // Orders placed before courier profiles (or auto-assigned by
        // name only) match their courier by name on first open.
        setCourierId((existing) => {
          if (existing) return existing;
          const match = list.find(
            (courier) =>
              courier.name.toLowerCase() === String(order.shippingCarrier || "").toLowerCase(),
          );
          return match?.id || "";
        });
      })
      .catch(() => {
        // The section still works without the picker (tracking
        // number + sync remain); the courier just can't be changed.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order._id]);

  const orderId = String(current._id || "");
  const trackingUrl = current.shipment?.trackingUrl || "";
  const shippedAt = current.shipment?.shippedAt || current.shippedAt;
  const deliveredAt = current.shipment?.deliveredAt || current.deliveredAt;

  const handleSave = async () => {
    if (!orderId) return;
    const chosen = couriers.find((courier) => courier.id === courierId);
    setSaving(true);
    try {
      const { data } = await apiClient.put(`/orders/${orderId}`, {
        shippingCarrier: chosen?.name || current.shippingCarrier || "",
        courierId,
        trackingNumber: trackingNumber.trim(),
      });
      setCurrent(data as Order);
      onOrderUpdated(data as Order);
      toast.success(t("Shipment saved."));
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!orderId) return;
    setSyncing(true);
    try {
      const { data } = await apiClient.post(`/orders/${orderId}/sync-tracking`);
      if (data?.order) {
        setCurrent(data.order as Order);
        setTrackingNumber((data.order as Order).trackingNumber || "");
        onOrderUpdated(data.order as Order);
      }
      // The server's sync messages are already main-point sentences.
      if (data?.success) toast.success(String(data.message || ""));
      else toast.error(String(data?.message || t("Tracking sync failed.")));
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setSyncing(false);
    }
  };

  const stamp = (label: string, value?: string | null) =>
    value ? (
      <div className="flex items-center justify-between py-0.5">
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        <span className="text-[11px] font-medium text-[var(--text)]">
          {new Date(value).toLocaleString()}
        </span>
      </div>
    ) : null;

  return (
    <div className="mt-3">
      <SectionTitle>{t("Shipment")}</SectionTitle>
      <div className="space-y-2.5 pt-1">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-soft)]">
            {t("Courier")}
          </label>
          <Select
            value={courierId}
            onChange={setCourierId}
            options={couriers.map((courier) => ({ label: courier.name, value: courier.id }))}
            placeholder={t("Select a courier")}
            size="sm"
            triggerFullWidth
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-soft)]">
            {t("Tracking Number")}
          </label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--primary)]"
          />
        </div>
        {trackingUrl && (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline"
          >
            {t("Track")}
            <ExternalLink size={12} />
          </a>
        )}
        {stamp(t("Shipped At"), shippedAt)}
        {stamp(t("Delivered At"), deliveredAt)}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || syncing}>
            {saving ? t("Saving...") : t("Save Shipment")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={handleSync}
            disabled={syncing || saving}
          >
            {syncing ? t("Syncing...") : t("Sync Tracking")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OrderShipmentSection;
