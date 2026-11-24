// Shipping centre — the ONE server-side source for everything
// shipping (the coupon-resolver pattern: every consumer prices and
// resolves through here, so the admin panel, order placement and the
// future storefront checkout can never drift apart).
//
// Settings → Shipping manages three sides in the Setting document:
//   1. METHODS & RATES   — named shipping methods with a charge, an
//                          optional free-above threshold and an
//                          estimated delivery time; one default.
//   2. DELIVERY          — delivery options (Home Delivery, Local
//                          Delivery, Store Pickup…) with a charge
//                          adjustment each (pickup never pays), and
//                          delivery zones: named city lists with an
//                          optional per-zone charge override.
//   3. COURIERS          — the courier profiles that carry parcels:
//                          public tracking URL template, optional
//                          live-tracking API credentials, one
//                          default, plus the automation toggles.
//
// DEFAULTS: until staff save a side for the first time (the
// document's *Initialized flags), reads serve the built-ins below —
// a fresh store shows TCS as its default courier and the three
// standard delivery options, and NO shipping methods (so a fresh
// store's orders price exactly as they always have: no shipping
// charge, nothing new required). Once a side is saved, the stored
// list rules — even when staff empty it on purpose.
const Setting = require('../models/Setting');

// Public tracking pages of the built-in couriers. "{tracking}" is
// replaced with the order's tracking number; templates without the
// placeholder open the courier's tracking page as-is (Leopards and
// Trax take the number on the page itself — their sites publish no
// deep-link pattern). Every template stays editable in the panel.
const BUILT_IN_COURIERS = [
    {
        id: 'tcs',
        name: 'TCS',
        trackingUrlTemplate: 'https://www.tcsexpress.com/track/{tracking}',
        apiBaseUrl: '',
        apiKey: '',
        apiUsername: '',
        apiPassword: '',
        isActive: true,
        isBuiltIn: true,
    },
    {
        id: 'leopards',
        name: 'Leopards Courier',
        trackingUrlTemplate: 'https://pk.leopardscourier.com/tracking',
        apiBaseUrl: '',
        apiKey: '',
        apiUsername: '',
        apiPassword: '',
        isActive: true,
        isBuiltIn: true,
    },
    {
        id: 'postex',
        name: 'PostEx',
        trackingUrlTemplate: 'https://merchant.postex.pk/?cn={tracking}',
        apiBaseUrl: '',
        apiKey: '',
        apiUsername: '',
        apiPassword: '',
        isActive: true,
        isBuiltIn: true,
    },
    {
        id: 'call-courier',
        name: 'Call Courier',
        // Call Courier is part of PostEx — its parcels track on the
        // PostEx portal with the same number.
        trackingUrlTemplate: 'https://merchant.postex.pk/?cn={tracking}',
        apiBaseUrl: '',
        apiKey: '',
        apiUsername: '',
        apiPassword: '',
        isActive: true,
        isBuiltIn: true,
    },
    {
        id: 'trax',
        name: 'Trax',
        trackingUrlTemplate: 'https://trax.pk/tracking',
        apiBaseUrl: '',
        apiKey: '',
        apiUsername: '',
        apiPassword: '',
        isActive: true,
        isBuiltIn: true,
    },
];

const BUILT_IN_DELIVERY_OPTIONS = [
    { id: 'home-delivery', name: 'Home Delivery', chargeAdjustment: 0, isPickup: false, isActive: true, isBuiltIn: true },
    { id: 'local-delivery', name: 'Local Delivery', chargeAdjustment: 0, isPickup: false, isActive: true, isBuiltIn: true },
    { id: 'store-pickup', name: 'Store Pickup', chargeAdjustment: 0, isPickup: true, isActive: true, isBuiltIn: true },
];

// The default courier of a never-configured store.
const FRESH_DEFAULT_COURIER_ID = 'tcs';
const FRESH_DEFAULT_DELIVERY_OPTION_ID = 'home-delivery';

const plain = (value) => (value?.toObject ? value.toObject() : value) || {};

/**
 * The effective shipping configuration of a settings document (or of
 * the store, when no document exists yet): stored lists once their
 * side has been saved, built-in defaults before that.
 */
const effectiveShipping = (settingsDoc) => {
    const doc = plain(settingsDoc);
    const s = plain(doc.shipping);
    const couriers = s.couriersInitialized
        ? (s.couriers || []).map(plain)
        : BUILT_IN_COURIERS.map((courier) => ({ ...courier }));
    const methods = s.deliveryInitialized ? (s.methods || []).map(plain) : [];
    const deliveryOptions = s.deliveryInitialized
        ? (s.deliveryOptions || []).map(plain)
        : BUILT_IN_DELIVERY_OPTIONS.map((option) => ({ ...option }));
    const deliveryZones = s.deliveryInitialized ? (s.deliveryZones || []).map(plain) : [];
    return {
        methods,
        defaultMethodId: s.defaultMethodId || '',
        deliveryOptions,
        deliveryZones,
        defaultDeliveryOptionId:
            s.defaultDeliveryOptionId ||
            (s.deliveryInitialized ? '' : FRESH_DEFAULT_DELIVERY_OPTION_ID),
        couriers,
        defaultCourierId:
            s.defaultCourierId || (s.couriersInitialized ? '' : FRESH_DEFAULT_COURIER_ID),
        autoAssignCourier: s.autoAssignCourier !== false,
        codPaidOnDelivery: s.codPaidOnDelivery !== false,
    };
};

/** Loads the store's effective shipping configuration. */
const getShippingConfig = async () => {
    const settings = await Setting.findOne().sort({ createdAt: 1 }).lean();
    return effectiveShipping(settings);
};

/** The default courier profile (active), or null when none is set. */
const defaultCourier = (config) =>
    (config.couriers || []).find(
        (courier) => courier.id === config.defaultCourierId && courier.isActive !== false,
    ) || null;

/** The courier an order rides with: by stored profile id first,
 *  then by the carrier name snapshot (orders placed before courier
 *  ids existed, or hand-typed carrier names that match a profile). */
const findCourier = (config, order) => {
    const couriers = config.couriers || [];
    if (order?.courierId) {
        const byId = couriers.find((courier) => courier.id === order.courierId);
        if (byId) return byId;
    }
    const name = String(order?.shippingCarrier || '').trim().toLowerCase();
    if (name) {
        return couriers.find((courier) => courier.name.trim().toLowerCase() === name) || null;
    }
    return null;
};

/** The public tracking link for an order's parcel, or '' when no
 *  link can honestly be built (no number, no courier, no template).
 *  Callers must omit the link entirely on '' — never a broken one. */
const trackingUrlFor = (courier, trackingNumber) => {
    const template = String(courier?.trackingUrlTemplate || '').trim();
    const number = String(trackingNumber || '').trim();
    if (!template || !number) return '';
    if (template.includes('{tracking}')) {
        return template.split('{tracking}').join(encodeURIComponent(number));
    }
    return template;
};

/** The shipment block the order payloads carry: the fulfilment
 *  facts plus the computed tracking link. */
const shipmentBlock = (config, order) => {
    const courier = findCourier(config, order);
    return {
        courierId: order?.courierId || courier?.id || '',
        courierName: order?.shippingCarrier || courier?.name || '',
        trackingNumber: order?.trackingNumber || '',
        shippedAt: order?.shippedAt || null,
        deliveredAt: order?.deliveredAt || null,
        trackingUrl: trackingUrlFor(courier, order?.trackingNumber),
    };
};

/** True for cash-on-delivery payment methods — the admin's stored
 *  code ('cod') and the long-form label both count. */
const isCodPayment = (paymentMethod) => {
    const value = String(paymentMethod || '').trim().toLowerCase();
    return value === 'cod' || value.includes('cash on delivery');
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * THE shipping calculator. Given the order's subtotal and the chosen
 * method / delivery option / destination city, returns the shipping
 * charge and the snapshots the order records.
 *
 * Rules, in order:
 *   1. No active methods configured → `configured: false` and the
 *      caller keeps its previous behaviour (no charge imposed).
 *   2. The method is the requested one, else the default, else the
 *      first active method.
 *   3. The method's free-above threshold met by the subtotal →
 *      shipping is FREE (the zone override never resurrects a
 *      charge on a free order).
 *   4. Otherwise a zone whose city list contains the destination
 *      city (case-insensitive) replaces the charge with its
 *      override, when it sets one.
 *   5. A pickup delivery option never pays shipping; any other
 *      option adds its charge adjustment (the total never goes
 *      below zero).
 */
const computeShippingCharge = (config, { subtotal = 0, methodId, deliveryOptionId, city } = {}) => {
    const activeMethods = (config.methods || []).filter((method) => method.isActive !== false);
    if (activeMethods.length === 0) {
        return { configured: false, charge: 0 };
    }
    const method =
        activeMethods.find((entry) => entry.id === methodId) ||
        activeMethods.find((entry) => entry.id === config.defaultMethodId) ||
        activeMethods[0];

    const activeOptions = (config.deliveryOptions || []).filter(
        (option) => option.isActive !== false,
    );
    const option =
        activeOptions.find((entry) => entry.id === deliveryOptionId) ||
        activeOptions.find((entry) => entry.id === config.defaultDeliveryOptionId) ||
        activeOptions.find((entry) => !entry.isPickup) ||
        activeOptions[0] ||
        null;

    let charge = Number(method.charge) || 0;
    let freeApplied = false;
    if (method.freeAbove != null && Number(subtotal) >= Number(method.freeAbove)) {
        charge = 0;
        freeApplied = true;
    }

    let zone = null;
    if (!freeApplied && city) {
        const wanted = String(city).trim().toLowerCase();
        zone =
            (config.deliveryZones || []).find(
                (entry) =>
                    entry.isActive !== false &&
                    (entry.cities || []).some(
                        (entryCity) => String(entryCity).trim().toLowerCase() === wanted,
                    ),
            ) || null;
        if (zone && zone.chargeOverride != null) {
            charge = Number(zone.chargeOverride) || 0;
        }
    }

    if (option?.isPickup) {
        charge = 0;
    } else if (option) {
        charge = Math.max(0, charge + (Number(option.chargeAdjustment) || 0));
    }

    return {
        configured: true,
        charge: roundMoney(charge),
        methodId: method.id,
        methodName: method.name,
        deliveryOptionId: option?.id || '',
        deliveryOptionName: option?.name || '',
        zoneName: zone?.name || '',
        freeApplied,
    };
};

module.exports = {
    BUILT_IN_COURIERS,
    BUILT_IN_DELIVERY_OPTIONS,
    effectiveShipping,
    getShippingConfig,
    defaultCourier,
    findCourier,
    trackingUrlFor,
    shipmentBlock,
    isCodPayment,
    computeShippingCharge,
};
