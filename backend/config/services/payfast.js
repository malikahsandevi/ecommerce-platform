// PayFast — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
// PayFast's merchant flow is redirect/hash-based with no plain REST
// read endpoint, so this entry is configuration-only.
module.exports = {
    "id": "payfast",
    "service": "PAYMENT",
    "name": "PayFast",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "merchantId",
            "label": "Merchant ID",
            "secret": false,
            "required": true,
            "placeholder": "Your merchant ID"
        },
        {
            "key": "securedKey",
            "label": "Secured Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the secured key — hidden after saving"
        }
    ],
    "endpoints": []
};
