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
  /** Input placeholder — a format hint/example, never a fake secret. */
  placeholder?: string;
}

export interface SubServiceDef {
  id: string;
  name: string;
  hasFixedBase: boolean;
  /** Single-configuration sub-service (e.g. Store Session (JWT)):
   *  the system reads exactly one entry for it, so the panel never
   *  offers a second entry and the backend refuses to store one. */
  singleton?: boolean;
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
        id: "cloudinary", name: "Cloudinary", hasFixedBase: true,
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
      {
        id: "google-cloud-storage", name: "Google Cloud Storage", hasFixedBase: false,
        fields: [F("accessKey", "Access Key", false, { placeholder: "HMAC access key from Cloud Storage settings" }), F("secretKey", "Secret Key", true), F("bucket", "Bucket"), F("projectId", "Project ID")],
        endpoints: [],
      },
      {
        id: "azure-blob-storage", name: "Azure Blob Storage", hasFixedBase: false,
        fields: [F("accountName", "Storage Account"), F("accountKey", "Account Key", true), F("container", "Container")],
        endpoints: [],
      },
      {
        id: "digitalocean-spaces", name: "DigitalOcean Spaces", hasFixedBase: false,
        fields: [F("accessKey", "Access Key", false, { placeholder: "Spaces access key from the API page" }), F("secretKey", "Secret Key", true), F("bucket", "Bucket"), F("region", "Region", false, { placeholder: "e.g. nyc3" })],
        endpoints: [],
      },
      {
        id: "backblaze-b2", name: "Backblaze B2", hasFixedBase: false,
        fields: [F("keyId", "Key ID", false, { placeholder: "Application key ID from B2" }), F("applicationKey", "Application Key", true), F("bucket", "Bucket")],
        endpoints: [],
      },
      {
        id: "wasabi", name: "Wasabi", hasFixedBase: false,
        fields: [F("accessKey", "Access Key", false, { placeholder: "Access key from the Wasabi console" }), F("secretKey", "Secret Key", true), F("bucket", "Bucket"), F("region", "Region", false, { placeholder: "e.g. us-east-1" })],
        endpoints: [],
      },
      {
        id: "bunny-storage", name: "Bunny Storage", hasFixedBase: false,
        fields: [F("storageZone", "Storage Zone"), F("accessKey", "Access Key", true), F("region", "Storage Hostname", false, { placeholder: "e.g. storage.bunnycdn.com" })],
        endpoints: [],
      },
      {
        id: "supabase-storage", name: "Supabase Storage", hasFixedBase: false,
        fields: [F("projectUrl", "Project URL"), F("serviceRoleKey", "Service Role Key", true), F("bucket", "Bucket")],
        endpoints: [],
      },
      {
        id: "firebase-storage", name: "Firebase Storage", hasFixedBase: false,
        fields: [F("projectId", "Project ID"), F("bucket", "Bucket", false, { placeholder: "e.g. my-project.appspot.com" }), F("clientEmail", "Client Email"), F("privateKey", "Private Key", true)],
        endpoints: [],
      },
      {
        id: "minio", name: "MinIO", hasFixedBase: false,
        fields: [F("endpoint", "Endpoint URL"), F("accessKey", "Access Key", false, { placeholder: "Access key for your MinIO server" }), F("secretKey", "Secret Key", true), F("bucket", "Bucket"), F("region", "Region", false, { placeholder: "e.g. us-east-1" })],
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
      {
        id: "square", name: "Square", hasFixedBase: true,
        fields: [F("accessToken", "Access Token", true), F("locationId", "Location ID")],
        endpoints: [{ name: "locations", path: "/locations", method: "GET" }],
      },
      {
        id: "adyen", name: "Adyen", hasFixedBase: true,
        fields: [
          F("apiKey", "API Key", true), F("merchantAccount", "Merchant Account"),
          F("environment", "Environment", false, { type: "select", options: ["Test", "Live"], default: "Test" }),
        ],
        endpoints: [{ name: "paymentMethods", path: "/paymentMethods", method: "POST" }],
      },
      {
        id: "checkout-com", name: "Checkout.com", hasFixedBase: true,
        fields: [F("secretKey", "Secret Key", true), F("publishableKey", "Publishable Key")],
        endpoints: [],
      },
      {
        id: "braintree", name: "Braintree", hasFixedBase: true,
        fields: [
          F("merchantId", "Merchant ID"), F("publicKey", "Public Key"), F("privateKey", "Private Key", true),
          F("environment", "Environment", false, { type: "select", options: ["Sandbox", "Production"], default: "Sandbox" }),
        ],
        endpoints: [],
      },
      {
        id: "mollie", name: "Mollie", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true)],
        endpoints: [{ name: "methods", path: "/methods", method: "GET" }],
      },
      {
        id: "paddle", name: "Paddle", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("clientToken", "Client Token")],
        endpoints: [{ name: "products", path: "/products", method: "GET" }],
      },
      {
        id: "jazzcash", name: "JazzCash", hasFixedBase: false,
        fields: [F("merchantId", "Merchant ID"), F("password", "Password", true), F("integritySalt", "Integrity Salt", true)],
        endpoints: [],
      },
      {
        id: "easypaisa", name: "Easypaisa", hasFixedBase: false,
        fields: [F("storeId", "Store ID"), F("hashKey", "Hash Key", true)],
        endpoints: [],
      },
      {
        id: "payfast", name: "PayFast", hasFixedBase: false,
        fields: [F("merchantId", "Merchant ID"), F("securedKey", "Secured Key", true)],
        endpoints: [],
      },
      // Custom is ALWAYS last (Ahsan's order): any gateway not in the
      // list is added with free key-value pairs; the entry still
      // stores this tab's category (PAYMENT) with sub-service "custom".
      { id: "custom", name: "Custom", hasFixedBase: false, fields: [], endpoints: [] },
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
      {
        id: "postmark", name: "Postmark", hasFixedBase: true,
        fields: [F("serverToken", "Server Token", true), F("fromEmail", "From Email")],
        endpoints: [{ name: "server", path: "/server", method: "GET" }],
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
      {
        id: "messagebird", name: "MessageBird", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("from", "From")],
        endpoints: [{ name: "balance", path: "/balance", method: "GET" }],
      },
      {
        id: "plivo", name: "Plivo", hasFixedBase: true,
        fields: [F("authId", "Auth ID"), F("authToken", "Auth Token", true), F("fromNumber", "From Number")],
        endpoints: [{ name: "account", path: "/", method: "GET" }],
      },
      {
        id: "sinch", name: "Sinch", hasFixedBase: true,
        fields: [F("servicePlanId", "Service Plan ID"), F("apiToken", "API Token", true), F("fromNumber", "From Number")],
        endpoints: [{ name: "batches", path: "/batches", method: "GET" }],
      },
      {
        id: "infobip", name: "Infobip", hasFixedBase: false,
        fields: [F("apiKey", "API Key", true), F("from", "From")],
        endpoints: [],
      },
      {
        id: "bandwidth", name: "Bandwidth", hasFixedBase: true,
        fields: [F("accountId", "Account ID"), F("apiToken", "API Token", false, { placeholder: "Your Bandwidth API token" }), F("apiSecret", "API Secret", true), F("fromNumber", "From Number")],
        endpoints: [],
      },
      {
        id: "telnyx", name: "Telnyx", hasFixedBase: true,
        fields: [F("apiKey", "API Key", true), F("fromNumber", "From Number"), F("messagingProfileId", "Messaging Profile ID")],
        endpoints: [{ name: "balance", path: "/balance", method: "GET" }],
      },
      {
        id: "amazon-sns", name: "Amazon SNS", hasFixedBase: false,
        fields: [F("accessKey", "Access Key"), F("secretKey", "Secret Key", true), F("region", "Region")],
        endpoints: [],
      },
      {
        id: "clicksend", name: "ClickSend", hasFixedBase: true,
        fields: [F("username", "Username", false, { placeholder: "Your ClickSend username" }), F("apiKey", "API Key", true), F("from", "From")],
        endpoints: [{ name: "account", path: "/account", method: "GET" }],
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
        id: "store-session-jwt", name: "Store Session (JWT)", hasFixedBase: false, singleton: true,
        fields: [F("jwtSecret", "JWT Secret", true)],
        endpoints: [{ name: "verify", path: "/", method: "GET" }],
      },
      {
        id: "auth0", name: "Auth0", hasFixedBase: false,
        fields: [F("domain", "Domain", false, { placeholder: "e.g. myapp.us.auth0.com" }), F("clientId", "Client ID"), F("clientSecret", "Client Secret", true)],
        endpoints: [],
      },
      {
        id: "clerk", name: "Clerk", hasFixedBase: true,
        fields: [F("publishableKey", "Publishable Key"), F("secretKey", "Secret Key", true)],
        endpoints: [],
      },
      {
        id: "firebase-auth", name: "Firebase Auth", hasFixedBase: false,
        fields: [F("projectId", "Project ID"), F("clientEmail", "Client Email"), F("privateKey", "Private Key", true)],
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
      // Custom is ALWAYS last (Ahsan's order): any carrier not in the
      // list is added with free key-value pairs; the entry still
      // stores this tab's category (SHIPPING) with sub-service "custom".
      { id: "custom", name: "Custom", hasFixedBase: false, fields: [], endpoints: [] },
    ],
  },
  {
    id: "ANALYTICS",
    label: "Analytics",
    subServices: [
      { id: "google-analytics", name: "Google Analytics", hasFixedBase: false, fields: [F("measurementId", "Measurement ID")], endpoints: [] },
      { id: "meta-pixel", name: "Meta Pixel", hasFixedBase: false, fields: [F("pixelId", "Pixel ID")], endpoints: [] },
      { id: "mixpanel", name: "Mixpanel", hasFixedBase: false, fields: [F("projectToken", "Project Token")], endpoints: [] },
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

/** Input placeholders per field key — format hints/examples only.
 *  Secret fields get a textual "hidden after saving" hint, never a
 *  fake real-looking secret. Mirrors the backend definitions'
 *  placeholder metadata (config/services). */
const PLACEHOLDER_BY_KEY: Record<string, string> = {
  cloudName: "e.g. my-cloud-name",
  accessKey: "Access key ID (starts with AKIA…)",
  bucket: "e.g. store-media",
  region: "e.g. eu-west-1",
  accountId: "Your account ID",
  publishableKey: "e.g. pk_live_…",
  clientId: "Client ID from the provider dashboard",
  keyId: "e.g. rzp_live_…",
  providerName: "e.g. Hostinger / cPanel mail",
  host: "e.g. smtp.example.com",
  port: "587",
  username: "e.g. mail@yourdomain.com",
  fromEmail: "name@example.com",
  fromName: "e.g. My Store",
  domain: "e.g. mg.yourdomain.com",
  accountSid: "e.g. AC… (34 characters)",
  fromNumber: "e.g. +14155552671",
  from: "e.g. MyStore",
  appId: "Your app ID",
  merchantId: "Your merchant ID",
  publicKey: "Your public key",
  locationId: "Your Square location ID",
  merchantAccount: "e.g. MyStoreECOM",
  storeId: "Your store ID",
  clientToken: "Client-side token from the dashboard",
  accountNumber: "e.g. 123456789",
  measurementId: "e.g. G-XXXXXXXXXX",
  pixelId: "e.g. 123456789012345",
  projectId: "e.g. my-project-123",
  storageZone: "e.g. my-store-zone",
  servicePlanId: "Your Sinch service plan ID",
  messagingProfileId: "Your messaging profile ID",
  projectUrl: "e.g. https://xyzcompany.supabase.co",
  endpoint: "e.g. https://minio.example.com:9000",
  container: "e.g. store-media",
  accountName: "e.g. mystoreaccount",
  authId: "Your Plivo Auth ID",
  clientEmail: "Service account email",
  projectToken: "e.g. 1234567890abcdef…",
};
const SECRET_PLACEHOLDER_BY_KEY: Record<string, string> = {
  apiKey: "Paste the API key — hidden after saving",
  apiSecret: "Paste the API secret — hidden after saving",
  secretKey: "Paste the secret key — hidden after saving",
  webhookSecret: "e.g. whsec_… — hidden after saving",
  clientSecret: "Paste the client secret — hidden after saving",
  keySecret: "Paste the key secret — hidden after saving",
  password: "Paste the password — hidden after saving",
  authToken: "Paste the auth token — hidden after saving",
  appSecret: "Paste the app secret — hidden after saving",
  jwtSecret: "A long random string — hidden after saving",
  privateKey: "Paste the private key — hidden after saving",
  integritySalt: "Paste the integrity salt — hidden after saving",
  hashKey: "Paste the hash key — hidden after saving",
  securedKey: "Paste the secured key — hidden after saving",
  apiToken: "Paste the API token — hidden after saving",
  accessToken: "Paste the access token — hidden after saving",
  accountPin: "Paste the account PIN — hidden after saving",
  serverToken: "Paste the server token — hidden after saving",
  serviceRoleKey: "Paste the service role key — hidden after saving",
  accountKey: "Paste the account key — hidden after saving",
  applicationKey: "Paste the application key — hidden after saving",
  accessKey: "Paste the access key — hidden after saving",
};
// apiKey is a plain identifier for some providers (Cloudinary) and a
// secret for others — the per-field secret flag decides, like the
// backend script that wrote the same values into the definitions.
for (const category of SERVICE_CATALOGUE) {
  for (const sub of category.subServices) {
    for (const field of sub.fields) {
      if (field.type === "select" || field.placeholder) continue;
      field.placeholder = field.secret
        ? (SECRET_PLACEHOLDER_BY_KEY[field.key] ?? "Paste the value — hidden after saving")
        : (PLACEHOLDER_BY_KEY[field.key] ?? (field.key === "apiKey" ? "e.g. 123456789012345" : `e.g. ${field.label}`));
    }
  }
}

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
