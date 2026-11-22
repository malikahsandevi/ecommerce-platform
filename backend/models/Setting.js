const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    // 1. General Settings
    general: {
      storeName: { type: String, default: "" },
      storeTagline: { type: String, default: "" },
      storeEmail: { type: String, default: "" },
      phone: { type: String, default: "" },
      timeZone: { type: String, default: "Asia/Karachi" },
      language: { type: String, default: "English" },
      // ISO 4217 code of the store's currency. The admin formats every
      // money figure with this currency's symbol; stored amounts are
      // plain numbers and are never converted.
      currency: { type: String, default: "USD" },
      // Admin-set revenue goal for the current calendar month, shown as
      // the gauge on the dashboard. 0 means "not set".
      monthlyTarget: { type: Number, default: 0 },
      logo: { type: String, default: "" },
      favicon: { type: String, default: "" },
    },

    // 2. Store Information
    storeInfo: {
      businessName: { type: String, default: "" },
      businessType: { type: String, default: "" },
      taxId: { type: String },
      website: { type: String, default: "" },
      address: {
        addressLine1: { type: String, default: "" },
        addressLine2: { type: String },
        city: { type: String },
        state: { type: String },
        postalCode: { type: String },
        country: { type: String },
      },
    },

    // 3. Payment Methods
    paymentMethods: [
      {
        name: { type: String, required: true }, // e.g. Stripe, PayPal, Cash on Delivery
        description: { type: String },
        enabled: { type: Boolean, default: true },
      },
    ],

    // 4. Shipping Settings
    shipping: {
      zones: [
        {
          name: { type: String, required: true }, // e.g. Pakistan, Europe
          regions: [String],
          rate: { type: Number, required: true },
          isActive: { type: Boolean, default: true },
        },
      ],
      freeShippingThreshold: { type: Number, default: 100 },
      defaultShippingMethod: { type: String, default: "Standard Shipping" },
    },

    // 5. Notifications
    notifications: {
      newOrder: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      customerMessages: { type: Boolean, default: true },
      marketingUpdates: { type: Boolean, default: false },
      systemNotifications: { type: Boolean, default: true },
    },

    // 6. UPDATED: Universal / Dynamic Integrations (Zero-Selection Architecture)
    // Entries are catalogue-driven (backend/config/services): `subService`
    // names a preset definition whose credential fields render dynamically
    // and whose values live in `fields`; CUSTOM entries carry admin-defined
    // `customFields` key-value pairs instead. A service is used only when
    // configured AND its `isConnected` activation toggle is ON — the gate
    // is config/services/index.js.
    integrations: [
      {
        usageType: {
          type: String,
          enum: [
            "STORAGE",
            "PAYMENT",
            "SMS_NOTIFICATION",
            "EMAIL",
            "AUTH",
            "SHIPPING",
            "ANALYTICS",
            "MAPS",
            "API",
            "CUSTOM",
          ],
          required: true,
        },
        // Preset sub-service id from the catalogue (e.g. "stripe",
        // "twilio", "custom"); "" for legacy generic connectors.
        subService: { type: String, default: "" },
        serviceSlug: { type: String, required: true, trim: true }, // Unique identifier (e.g. "my-sms-api")
        title: { type: String, required: true }, // Name given by Admin
        baseUrl: { type: String, default: "", trim: true }, // API Base URL (presets: forced server-side to the definition's fixed base)
        // Preset credential/config values, keyed by the definition's
        // field keys. Secret values are masked on every API read.
        fields: { type: Map, of: String, default: {} },
        // CUSTOM entries: admin-defined key-value pairs; pairs flagged
        // secret are masked on read and kept when re-saved as the mask.
        customFields: [
          {
            key: { type: String, default: "" },
            value: { type: String, default: "" },
            secret: { type: Boolean, default: false },
            // A pair toggled OFF stays saved on the entry but is NOT
            // part of its effective config — the gate's entryValues
            // skips it, so the runner never sees or sends it.
            isActive: { type: Boolean, default: true },
          },
        ],
        authType: {
          type: String,
          enum: ["API_KEY", "BEARER_TOKEN", "BASIC", "CUSTOM_HEADER", "NONE"],
          default: "NONE",
        },
        authCredentials: {
          apiKey: { type: String, default: "" },
          headerKey: { type: String, default: "Authorization" }, // Custom Header Name
          username: { type: String, default: "" },
          password: { type: String, default: "" },
        },
        globalHeaders: { type: Map, of: String, default: {} },
        endpoints: [
          {
            name: { type: String, required: true }, // Action Name e.g. "send_otp"
            path: { type: String, required: true }, // Endpoint Path e.g. "/v1/send"
            method: {
              type: String,
              enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
              default: "POST",
            },
            defaultHeaders: { type: Map, of: String, default: {} },
            responseMapping: {
              successField: { type: String, default: "" },
              dataField: { type: String, default: "" }, // e.g. "data.url"
              errorField: { type: String, default: "" },
            },
          },
        ],
        webhooks: [
          {
            event: { type: String, required: true }, // e.g. order.created
            url: { type: String, required: true },
            isActive: { type: Boolean, default: true },
          },
        ],
        isConnected: { type: Boolean, default: true },
      },
    ],

    // 7. Appearance
    appearance: {
      theme: {
        type: String,
        enum: ["Light", "Dark", "System"],
        default: "Light",
      },
      compactSidebar: { type: Boolean, default: false },
      showBreadcrumbs: { type: Boolean, default: true },
      enableAnimations: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Setting", settingSchema);
