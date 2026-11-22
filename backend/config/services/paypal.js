// PayPal — PAYMENT sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "paypal",
    "service": "PAYMENT",
    "name": "PayPal",
    "baseUrl": {
        "byField": "mode",
        "map": {
            "Sandbox": "https://api-m.sandbox.paypal.com",
            "Live": "https://api-m.paypal.com"
        },
        "default": "https://api-m.sandbox.paypal.com"
    },
    "auth": {
        "style": "clientCredentials",
        "idKey": "clientId",
        "secretKey": "clientSecret",
        "tokenPath": "/v1/oauth2/token"
    },
    "fields": [
        {
            "key": "clientId",
            "label": "Client ID",
            "secret": false,
            "required": true,
            "placeholder": "Client ID from the provider dashboard"
        },
        {
            "key": "clientSecret",
            "label": "Client Secret",
            "secret": true,
            "required": true,
            "placeholder": "Paste the client secret — hidden after saving"
        },
        {
            "key": "mode",
            "label": "Mode",
            "secret": false,
            "required": true,
            "type": "select",
            "options": [
                "Sandbox",
                "Live"
            ],
            "default": "Sandbox"
        }
    ],
    "endpoints": [
        {
            "name": "userinfo",
            "path": "/v1/identity/oauth2/userinfo",
            "method": "GET"
        }
    ]
};
