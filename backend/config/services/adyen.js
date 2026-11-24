// Adyen — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "adyen",
    "service": "PAYMENT",
    "name": "Adyen",
    "baseUrl": {
        "byField": "environment",
        "map": {
            "Test": "https://checkout-test.adyen.com/v71",
            "Live": "https://checkout-live.adyen.com/v71"
        },
        "default": "https://checkout-test.adyen.com/v71"
    },
    "auth": {
        "style": "apiKeyHeader",
        "header": "X-API-Key",
        "key": "apiKey"
    },
    "fields": [
        {
            "key": "apiKey",
            "label": "API Key",
            "secret": true,
            "required": true,
            "placeholder": "Paste the API key — hidden after saving"
        },
        {
            "key": "merchantAccount",
            "label": "Merchant Account",
            "secret": false,
            "required": true,
            "placeholder": "e.g. MyStoreECOM"
        },
        {
            "key": "clientKey",
            "label": "Client Key",
            "secret": false,
            "required": false,
            "placeholder": "Client key for web components"
        },
        {
            "key": "environment",
            "label": "Environment",
            "secret": false,
            "required": true,
            "type": "select",
            "options": [
                "Test",
                "Live"
            ],
            "default": "Test"
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
    "endpoints": [
        {
            "name": "paymentMethods",
            "path": "/paymentMethods",
            "method": "POST"
        }
    ]
};
