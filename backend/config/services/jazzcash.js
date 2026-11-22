// JazzCash — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
// JazzCash's merchant API is a hosted-form / hash-based flow with no
// plain REST read endpoint, so this entry is configuration-only.
module.exports = {
    "id": "jazzcash",
    "service": "PAYMENT",
    "name": "JazzCash",
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
            "key": "password",
            "label": "Password",
            "secret": true,
            "required": true,
            "placeholder": "Paste the password — hidden after saving"
        },
        {
            "key": "integritySalt",
            "label": "Integrity Salt",
            "secret": true,
            "required": true,
            "placeholder": "Paste the integrity salt — hidden after saving"
        }
    ],
    "endpoints": []
};
