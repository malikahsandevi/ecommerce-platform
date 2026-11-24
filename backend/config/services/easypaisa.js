// Easypaisa — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
// Easypaisa's merchant API is a hosted-form / hash-based flow with no
// plain REST read endpoint, so this entry is configuration-only.
module.exports = {
    "id": "easypaisa",
    "service": "PAYMENT",
    "name": "Easypaisa",
    "baseUrl": null,
    "auth": {
        "style": "none"
    },
    "fields": [
        {
            "key": "storeId",
            "label": "Store ID",
            "secret": false,
            "required": true,
            "placeholder": "Your store ID"
        },
        {
            "key": "hashKey",
            "label": "Hash Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the hash key — hidden after saving"
        },
        {
            "key": "planName",
            "label": "Plan Name",
            "secret": false,
            "required": false,
            "plan": true,
            "placeholder": "e.g. Free"
        }
    ],
    "endpoints": []
};
