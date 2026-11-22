// Mollie — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "mollie",
    "service": "PAYMENT",
    "name": "Mollie",
    "baseUrl": "https://api.mollie.com/v2",
    "auth": {
        "style": "bearer",
        "tokenKey": "apiKey"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API key — hidden after saving"
        }
    ],
    "endpoints": [
        {
            "name": "methods",
            "path": "/methods",
            "method": "GET"
        }
    ]
};
