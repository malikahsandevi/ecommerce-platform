// Service catalogue for Settings → API / Integrations — the frontend
// mirror of the backend's config/services definitions (the panel
// renders its dynamic forms from this; the backend serves the same
// structure at GET /settings/services/catalogue and remains the
// authority: it forces preset base URLs, auth styles and masking
// server-side regardless of what the client sends).
//
// STRUCTURE ONLY: field schemas and provider facts. Credential values
// are never stored here — they live in the backend's database store.

export interface ServiceFieldDef {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  type?: "text" | "number" | "select";
  options?: string[];
  default?: string;
}

export interface SubServiceDef {
  id: string;
  name: string;
  builtIn?: boolean;
  hasFixedBase: boolean;
  fields: ServiceFieldDef[];
  endpoints: { name: string; path: string; method: string }[];
}

export interface ServiceCategoryDef {
  id: string;
  label: string;
  subServices: SubServiceDef[];
}

const F = (
  key: string,
  label: string,
  secret = false,
  extra: Partial<ServiceFieldDef> = {},
): ServiceFieldDef => ({ key, label, secret, required: true, ...extra });

export const SERVICE_CATALOGUE: ServiceCategoryDef[] = [
  {
    id: "STORAGE",
    label: "Storage",
    subServices: [
      {
        id: "cloudinary", name: "Cloudinary", builtIn: true, hasFixedBase: true,
        fields: [F("cloudName", "Cloud Name"), F("apiKey", "API Key"), F("apiSecret", "API Secret", true)],
        endpoints: [{ name: "ping", path: "/ping", method: "GET" }],
      },
      {
        id: "aws-s3", name: "AWS S3", hasFixedBase: false,
        fields: [F("accessKey", "Access Key"), F("secretKey", "Secret Key", true), F("bucket", "Bucket"), F("region", "Region")],
        endpoints: [],
      },
      {
        id: "cloudflare-r2", name: "Cloudflare R2", hasFixedBase: false,
        fields: [F("accountId", "Account ID"), F("accessKey", "Access Key"), F("secretKey", "Secret Key", true), F("bucket", "Bucket")],
        endpoints: [],
      },
    ],
  },
  {
    id: "PAYMENT",
    label: "Payment",
    subServices: [
      {
        id: "stripe", name: "Stripe", hasFixedBase: true,
        fields: [F("publishableKey", "Publishable Key"), F("secretKey", "Secret Key", true), F("webhookSecret", "Webhook Secret", true)],
        endpoints: [{ name: "balance", path: "/balance", method: "GET" }],
      },
      {
        id: "paypal", name: "PayPal", hasFixedBase: true,
        fields: [
          F("clientId", "Client ID"), F("clientSecret", "Client Secret", true),
          F("mode", "Mode", false, { type: "select", options: ["Sandbox", "Live"], default: "Sandbox" }),
        ],
        endpoints: [{ name: "userinfo", path: "/v1/identity/oauth2/userinfo", method: "GET" }],
      },
      {
        id: "razorpay", name: "Razorpay", hasFixedBase: true,
        fields: [F("keyId", "Key ID"), F("keySecret", "Key Secret", true)],
        endpoints: [{ name: "payments", path: "/payments", method: "GET" }],
      },
    ],
  },
  {
    id: "EMAIL",
    label: "Email",
    subServices: [
      {
        id: "hosting-mail", name: "Hosting Mail", hasFixedBase: false,
        fields: [
          F("providerName", "Provider Name"), F("host", "SMTP Host"),
          F("port", "Port", false, { type: "number" }),
          F("username", "Username"), F("password", "Password", true),
          F("encryption", "Encryption", false, { type: "select", options: ["SSL", "TLS", "None"], default: "SSL" }),
          F("fromEmail", "From Email"), F("fromName", "From Name"),
        ],
        endpoints: [],
      },
      {
        id: "smtp", name: "SMTP", hasFixedBase: false,
        fields: [
          F("host", "Host"), F("port", "Port", false, { type: "number" }),
          F("username", "Username"), F("password", "Password", true),
          F("fromEmail", "From Email"), F("fromName", "From Name"),
        ],
        endpoints: [],
      },
      {
        id: "sendgrid", name: "SendGrid", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("fromEmail", "From Email")],
        endpoints: [{ name: "profile", path: "/user/profile", method: "GET" }],
      },
      {
        id: "resend", name: "Resend", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("fromEmail", "From Email")],
        endpoints: [{ name: "domains", path: "/domains", method: "GET" }],
      },
      {
        id: "mailgun", name: "Mailgun", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("domain", "Domain"), F("fromEmail", "From Email")],
        endpoints: [{ name: "domain", path: "/domains/{domain}", method: "GET" }],
      },
    ],
  },
  {
    id: "SMS_NOTIFICATION",
    label: "SMS",
    subServices: [
      {
        id: "twilio", name: "Twilio", hasFixedBase: true,
        fields: [F("accountSid", "Account SID"), F("authToken", "Auth Token", true), F("fromNumber", "From Number")],
        endpoints: [{ name: "messages", path: "/Messages.json", method: "GET" }],
      },
      {
        id: "vonage", name: "Vonage", hasFixedBase: true,
        fields: [F("apiKey", "API Key"), F("apiSecret", "API Secret", true), F("from", "From")],
        endpoints: [{ name: "balance", path: "/account/get-balance", method: "GET" }],
      },
    ],
  },
  {
    id: "AUTH",
    label: "Auth",
    subServices: [
      {
        id: "google", name: "Google", hasFixedBase: false,
        fields: [F("clientId", "Client ID"), F("clientSecret", "Client Secret", true)],
        endpoints: [],
      },
      {
        id: "facebook", name: "Facebook", hasFixedBase: false,
        fields: [F("appId", "App ID"), F("appSecret", "App Secret", true)],
        endpoints: [],
      },
      {
        id: "github", name: "GitHub", hasFixedBase: false,
        fields: [F("clientId", "Client ID"), F("clientSecret", "Client Secret", true)],
        endpoints: [],
      },
      {
        id: "store-session-jwt", name: "Store Session (JWT)", builtIn: true, hasFixedBase: false,
        fields: [F("jwtSecret", "JWT Secret", true)],
        endpoints: [],
      },
    ],
  },
  {
    id: "SHIPPING",
    label: "Shipping",
    subServices: [
      { id: "easypost", name: "EasyPost", hasFixedBase: true, fields: [F("apiKey", "API Key", true)], endpoints: [{ name: "addresses", path: "/addresses", method: "GET" }] },
      { id: "shippo", name: "Shippo", hasFixedBase: true, fields: [F("apiKey", "API Key", true)], endpoints: [{ name: "addresses", path: "/addresses/", method: "GET" }] },
      {
        id: "fedex", name: "FedEx", hasFixedBase: true,
        fields: [F("clientId", "Client ID"), F("clientSecret", "Client Secret", true), F("accountNumber", "Account Number")],
        endpoints: [],
      },
      {
        id: "ups", name: "UPS", hasFixedBase: true,
        fields: [F("clientId", "Client ID"), F("clientSecret", "Client Secret", true), F("accountNumber", "Account Number")],
        endpoints: [],
      },
      {
        id: "dhl", name: "DHL", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("accountNumber", "Account Number")],
        endpoints: [],
      },
      {
        id: "usps", name: "USPS", hasFixedBase: true,
        fields: [F("clientId", "Client ID"), F("clientSecret", "Client Secret", true)],
        endpoints: [],
      },
      {
        id: "aramex", name: "Aramex", hasFixedBase: false,
        fields: [F("username", "Username"), F("password", "Password", true), F("accountNumber", "Account Number"), F("accountPin", "Account PIN", true)],
        endpoints: [],
      },
      {
        id: "sendcloud", name: "SendCloud", hasFixedBase: true,
        fields: [F("publicKey", "Public Key"), F("secretKey", "Secret Key", true)],
        endpoints: [{ name: "user", path: "/user", method: "GET" }],
      },
      { id: "aftership", name: "AfterShip", hasFixedBase: true, fields: [F("apiKey", "API Key", true)], endpoints: [{ name: "couriers", path: "/couriers", method: "GET" }] },
      { id: "leopards", name: "Leopards Courier", hasFixedBase: false, fields: [F("apiKey", "API Key", true)], endpoints: [] },
      { id: "postex", name: "PostEx", hasFixedBase: true, fields: [F("apiToken", "API Token", true)], endpoints: [] },
    ],
  },
  {
    id: "ANALYTICS",
    label: "Analytics",
    subServices: [
      { id: "google-analytics", name: "Google Analytics", hasFixedBase: false, fields: [F("measurementId", "Measurement ID")], endpoints: [] },
      { id: "meta-pixel", name: "Meta Pixel", hasFixedBase: false, fields: [F("pixelId", "Pixel ID")], endpoints: [] },
    ],
  },
  {
    id: "MAPS",
    label: "Maps",
    subServices: [
      { id: "google-maps", name: "Google Maps", hasFixedBase: true, fields: [F("apiKey", "API Key", true)], endpoints: [{ name: "geocode", path: "/geocode/json", method: "GET" }] },
      { id: "mapbox", name: "Mapbox", hasFixedBase: true, fields: [F("accessToken", "Access Token", true)], endpoints: [] },
    ],
  },
  {
    id: "CUSTOM",
    label: "Custom",
    subServices: [
      { id: "custom", name: "Custom", hasFixedBase: false, fields: [], endpoints: [] },
    ],
  },
];

export const categoryById = (id: string): ServiceCategoryDef | undefined =>
  SERVICE_CATALOGUE.find((category) => category.id === id);

export const subServiceById = (id: string): SubServiceDef | undefined => {
  for (const category of SERVICE_CATALOGUE) {
    const found = category.subServices.find((sub) => sub.id === id);
    if (found) return found;
  }
  return undefined;
};

/** The mask the settings API returns in place of a stored secret. */
export const SECRET_MASK = "••••••••••";
