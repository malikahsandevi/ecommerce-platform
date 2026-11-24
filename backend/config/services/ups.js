// UPS — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "ups",
    "service": "SHIPPING",
    "name": "UPS",
    "baseUrl": "https://onlinetools.ups.com",
    "auth": {
        "style": "clientCredentials",
        "idKey": "clientId",
        "secretKey": "clientSecret",
        "tokenPath": "/security/v1/oauth/token"
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
            "key": "accountNumber",
            "label": "Account Number",
            "secret": false,
            "required": true,
            "placeholder": "e.g. 123456789"
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
