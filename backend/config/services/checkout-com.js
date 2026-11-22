// Checkout.com — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "checkout-com",
    "service": "PAYMENT",
    "name": "Checkout.com",
    "baseUrl": "https://api.checkout.com",
    "auth": {
        "style": "bearer",
        "tokenKey": "secretKey"
    },
    "fields": [
        {
            "key": "secretKey",
            "label": "Secret Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the secret key — hidden after saving"
        },
        {
            "key": "publishableKey",
            "label": "Publishable Key",
            "secret": false,
            "required": true,
            "placeholder": "e.g. pk_live_…"
        }
    ],
    "endpoints": []
};
