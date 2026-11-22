// Stripe — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "stripe",
    "service": "PAYMENT",
    "name": "Stripe",
    "baseUrl": "https://api.stripe.com/v1",
    "auth": {
        "style": "bearer",
        "tokenKey": "secretKey"
    },
    "fields": [
        {
            "key": "publishableKey",
            "label": "Publishable Key",
            "secret": false,
            "required": true
        },
        {
            "key": "secretKey",
            "label": "Secret Key",
            "secret": true,
            "required": true
        },
        {
            "key": "webhookSecret",
            "label": "Webhook Secret",
            "secret": true,
            "required": true
        }
    ],
    "endpoints": [
        {
            "name": "balance",
            "path": "/balance",
            "method": "GET"
        }
    ]
};
