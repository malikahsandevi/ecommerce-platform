// AfterShip — SHIPPING sub-service definition (config/services).
// STRUCTURE ONLY: the provider's field schema, fixed API base and auth
// style. Credential VALUES are never stored here or anywhere in git —
// they live in the database and are resolved at runtime through
// config/services/index.js (the single gate for every consumer).
module.exports = {
    "id": "aftership",
    "service": "SHIPPING",
    "name": "AfterShip",
    "baseUrl": "https://api.aftership.com/v4",
    "auth": {
        "style": "apiKeyHeader",
        "header": "aftership-api-key",
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
            "name": "couriers",
            "path": "/couriers",
            "method": "GET"
        }
    ]
};
